"""FastAPI application for the Bass Karaoke Player."""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import os
import shutil
import subprocess
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from json import JSONDecodeError, loads
from pathlib import Path

import aiofiles
from backend.app.audio_processor import (
    AudioProcessorError,
    RubberbandProcessor,
    StemSplitter,
)
from backend.app.models import (
    BulkProcessRequest,
    BulkProcessResponse,
    ErrorResponse,
    ProcessRequest,
    ProcessResponse,
    Song,
    SongListResponse,
    SongStatus,
    StemName,
    Version,
    VersionListResponse,
    VersionStatus,
)
from backend.app.storage import SongStorage
from fastapi import APIRouter, BackgroundTasks, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application configuration
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", "frontend/dist"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
ALLOWED_AUDIO_SUFFIXES = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}
MAX_UPLOAD_BYTES = 300 * 1024 * 1024  # 300 MB
MAX_VERSIONS_GLOBAL = int(os.getenv("MAX_VERSIONS_GLOBAL", "50"))
# Maximum number of stem-splitting jobs that may run concurrently.
# Additional uploads are queued (status "queued") until a slot is free.
# Demucs is very CPU- and memory-intensive; the default of 1 prevents the
# machine from being overwhelmed when multiple songs are uploaded at once.
# Increase this value only if the host has enough cores and RAM to run
# several demucs instances in parallel.
MAX_SPLIT_WORKERS = int(os.getenv("MAX_SPLIT_WORKERS", "1"))
# Maximum number of rubberband stem-processing jobs that may run concurrently.
# Unlike demucs, rubberband is not memory-intensive, so a higher default is
# appropriate.  Set to 1 to disable parallelism.  All rubberband jobs across
# all songs share this pool, so this also acts as a global queue.
MAX_PROCESS_WORKERS = int(os.getenv("MAX_PROCESS_WORKERS", "4"))

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

storage: SongStorage
splitter: StemSplitter
processor: RubberbandProcessor
# Semaphore that limits the number of concurrent stem-splitting jobs.
# Initialised here with the module-level default so that test fixtures that
# bypass the lifespan still get a working semaphore.  The lifespan recreates
# it to pick up any runtime value of MAX_SPLIT_WORKERS.
split_semaphore: asyncio.Semaphore = asyncio.Semaphore(MAX_SPLIT_WORKERS)
# Thread-pool executor for rubberband processing.  Limits the total number of
# concurrent rubberband processes across all songs.  Initialised at module
# level so tests that bypass the lifespan still get a working executor.
process_executor: concurrent.futures.ThreadPoolExecutor = (
    concurrent.futures.ThreadPoolExecutor(max_workers=MAX_PROCESS_WORKERS)
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    global storage, splitter, processor, split_semaphore, process_executor  # noqa: PLW0603
    storage = SongStorage(DATA_DIR)
    splitter = StemSplitter()
    processor = RubberbandProcessor()
    split_semaphore = asyncio.Semaphore(MAX_SPLIT_WORKERS)
    process_executor = concurrent.futures.ThreadPoolExecutor(
        max_workers=MAX_PROCESS_WORKERS
    )
    yield


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


_VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


def _configure_logging() -> None:
    """Configure root logger from the LOG_LEVEL environment variable.

    Uses Python's standard :mod:`logging` module. Ensures at least one
    StreamHandler (stderr) is attached so that Docker can capture log output.
    """
    level_name = LOG_LEVEL if LOG_LEVEL in _VALID_LOG_LEVELS else "INFO"
    numeric_level: int = getattr(logging, level_name)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s %(levelname)-8s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    # Always honour LOG_LEVEL even when a handler was already installed
    # (e.g. by uvicorn) before create_app() is called.
    logging.getLogger().setLevel(numeric_level)
    if LOG_LEVEL not in _VALID_LOG_LEVELS:
        logger.warning(
            "Invalid LOG_LEVEL %r; defaulting to INFO. Valid values: %s",
            LOG_LEVEL,
            ", ".join(sorted(_VALID_LOG_LEVELS)),
        )


def _normalize_tag(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None


def _read_song_metadata(audio_path: Path) -> tuple[str | None, str | None]:
    """Best-effort metadata extraction for artist and title using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format_tags",
                "-of",
                "json",
                str(audio_path),
            ],
            capture_output=True,
            check=False,
            text=True,
        )
    except OSError:
        logger.exception("Unable to execute ffprobe for metadata extraction")
        return (None, None)

    if result.returncode != 0:
        logger.debug("ffprobe metadata read failed for %s", audio_path)
        return (None, None)

    try:
        payload = loads(result.stdout)
    except JSONDecodeError:
        logger.debug("ffprobe returned non-JSON metadata output for %s", audio_path)
        return (None, None)

    format_data = payload.get("format")
    if not isinstance(format_data, dict):
        return (None, None)
    tags_raw = format_data.get("tags")
    if not isinstance(tags_raw, dict):
        return (None, None)

    tags: dict[str, str] = {}
    for k, v in tags_raw.items():
        if not isinstance(k, str):
            continue
        normalized_value = _normalize_tag(v)
        if normalized_value is not None:
            tags[k.lower()] = normalized_value
    artist = (
        tags.get("artist")
        or tags.get("album_artist")
        or tags.get("albumartist")
        or tags.get("band")
    )
    title = tags.get("title")
    return (artist, title)


def create_app() -> FastAPI:
    _configure_logging()
    app = FastAPI(
        title="Bass Karaoke Player",
        description=(
            "A web-based music player with stem splitting (demucs), "
            "pitch/tempo control (rubberband) and per-stem volume mixing."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve the frontend at the root and mount static assets if the directory exists
    if FRONTEND_DIR.is_dir():

        @app.get("/", include_in_schema=False)
        async def serve_root() -> FileResponse:
            index = FRONTEND_DIR / "index.html"
            if not index.is_file():
                raise HTTPException(
                    status_code=404, detail="Frontend index.html not found."
                )
            return FileResponse(str(index))

        app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    app.include_router(_song_router())
    return app


# ---------------------------------------------------------------------------
# Background task helpers
# ---------------------------------------------------------------------------


def _split_song_task(song_id: str) -> None:
    """Background task: run demucs and update song metadata."""
    song = storage.load_song(song_id)
    if song is None:
        logger.error("split_song_task: song %s not found", song_id)
        return

    original_dir = storage.original_dir(song_id)
    if not original_dir.is_dir():
        storage.update_status(
            song_id, SongStatus.ERROR, error_message="No audio file found"
        )
        return
    audio_files = [
        f for f in original_dir.iterdir() if f.suffix.lower() in ALLOWED_AUDIO_SUFFIXES
    ]
    if not audio_files:
        storage.update_status(
            song_id, SongStatus.ERROR, error_message="No audio file found"
        )
        return

    input_path = audio_files[0]
    stems_out_dir = storage.stems_output_dir(song_id)

    try:
        stem_map = splitter.split(input_path, stems_out_dir)
    except AudioProcessorError:
        logger.exception("Stem splitting failed for %s", song_id)
        storage.update_status(
            song_id, SongStatus.ERROR, error_message="Stem splitting failed"
        )
        return

    # Copy stems to expected locations in storage
    available: list[StemName] = []
    for stem, src_path in stem_map.items():
        dest = storage.stem_path(song_id, stem)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src_path != dest:
            shutil.copy2(src_path, dest)
        available.append(stem)

    storage.update_status(song_id, SongStatus.READY, stems=available)
    logger.info("Stem splitting complete for %s", song_id)
    # Pre-cache the default (unmodified) version immediately after splitting.
    try:
        _process_version_task(song_id, 0.0, 1.0)
    except Exception:
        logger.exception("Failed to pre-cache default version for %s", song_id)


async def _enqueue_split_task(song_id: str) -> None:
    """Async wrapper that enforces the split-worker concurrency limit.

    Songs wait with status "queued" until a semaphore slot is free, then
    transition to "splitting" before the actual demucs work begins.
    The semaphore capacity is set by the MAX_SPLIT_WORKERS environment variable
    (default: 1), which prevents simultaneous demucs invocations from
    exhausting CPU and memory on the host.
    """
    if split_semaphore.locked():
        logger.info("Stem splitting queued for %s (all worker slots busy)", song_id)
    async with split_semaphore:
        storage.update_status(song_id, SongStatus.SPLITTING)
        await asyncio.to_thread(_split_song_task, song_id)


def _process_version_task(song_id: str, pitch: float, tempo: float) -> None:
    """Background task: rubberband-process all stems for the given pitch/tempo pair.

    Stems are processed in parallel using the global *process_executor* thread
    pool, which is bounded by MAX_PROCESS_WORKERS.  This limits the total number
    of concurrent rubberband invocations across all songs and acts as a queue
    when demand exceeds the pool capacity.
    """
    song = storage.load_song(song_id)
    if song is None:
        logger.error("process_version_task: song %s not found", song_id)
        return

    def _process_single_stem(stem_name: StemName) -> None:
        input_path = storage.stem_path(song_id, stem_name)
        if not input_path.exists():
            raise AudioProcessorError(
                f"Stem file missing for {song_id}/{stem_name}: {input_path}"
            )
        output_path = storage.processed_path(song_id, stem_name, pitch, tempo)
        if not output_path.exists():
            processor.process(
                input_path,
                output_path,
                pitch_semitones=pitch,
                tempo_ratio=tempo,
            )

    futures: dict[concurrent.futures.Future[None], StemName] = {
        process_executor.submit(_process_single_stem, StemName(stem_name)): StemName(
            stem_name
        )
        for stem_name in song.stems
    }

    failed = False
    for future in concurrent.futures.as_completed(futures):
        stem_name = futures[future]
        try:
            future.result()
        except AudioProcessorError:
            logger.exception(
                "process_version_task: processing failed for %s/%s", song_id, stem_name
            )
            failed = True

    if failed:
        return

    storage.touch_version(song_id, pitch, tempo)
    storage.evict_global_lru(MAX_VERSIONS_GLOBAL)
    logger.info("Version (pitch=%s, tempo=%s) ready for song %s", pitch, tempo, song_id)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


def _song_router() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["songs"])

    @router.get("/songs", response_model=SongListResponse)
    async def list_songs() -> SongListResponse:
        """Return all uploaded songs."""
        return SongListResponse(songs=storage.list_songs())

    @router.post(
        "/songs",
        response_model=Song,
        status_code=201,
        responses={400: {"model": ErrorResponse}},
    )
    async def upload_song(
        file: UploadFile,
        background_tasks: BackgroundTasks,
    ) -> Song:
        """Upload an audio file and trigger stem splitting in the background."""
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided.")
        suffix = Path(file.filename).suffix.lower()
        if suffix not in ALLOWED_AUDIO_SUFFIXES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{suffix}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_AUDIO_SUFFIXES))}",
            )

        song = storage.create_song(file.filename)
        dest = storage.upload_path(song.id, file.filename)

        # Stream upload to disk with size limit
        bytes_written = 0
        async with aiofiles.open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    await out.close()
                    dest.unlink(missing_ok=True)
                    storage.delete_song(song.id)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // 1024 // 1024} MB.",
                    )
                await out.write(chunk)

        artist, title = await asyncio.to_thread(_read_song_metadata, dest)
        storage.update_metadata(song.id, artist=artist, title=title)

        storage.update_status(song.id, SongStatus.QUEUED)
        background_tasks.add_task(_enqueue_split_task, song.id)
        return storage.load_song(song.id)  # type: ignore[return-value]

    @router.get(
        "/songs/{song_id}",
        response_model=Song,
        responses={404: {"model": ErrorResponse}},
    )
    async def get_song(song_id: str) -> Song:
        """Return metadata for a single song."""
        song = storage.load_song(song_id)
        if song is None:
            raise HTTPException(status_code=404, detail="Song not found.")
        return song

    @router.delete(
        "/songs/{song_id}",
        status_code=204,
        responses={404: {"model": ErrorResponse}},
    )
    async def delete_song(song_id: str) -> None:
        """Delete a song and all its associated files."""
        if not storage.delete_song(song_id):
            raise HTTPException(status_code=404, detail="Song not found.")

    @router.post(
        "/songs/{song_id}/touch",
        response_model=Song,
        responses={404: {"model": ErrorResponse}},
    )
    async def touch_song(song_id: str) -> Song:
        """Update last_used_at for a song to the current time."""
        song = storage.touch_song(song_id)
        if song is None:
            raise HTTPException(status_code=404, detail="Song not found.")
        return song

    @router.get(
        "/songs/{song_id}/stems/{stem_name}",
        responses={
            200: {"content": {"audio/mpeg": {}}},
            404: {"model": ErrorResponse},
        },
    )
    async def get_stem(song_id: str, stem_name: str) -> FileResponse:
        """Stream an unprocessed stem MP3 file."""
        song = _require_ready_song(song_id)
        stem = _parse_stem(stem_name)
        if stem not in song.stems:
            raise HTTPException(
                status_code=404, detail=f"Stem '{stem_name}' not available."
            )
        path = storage.stem_path(song_id, stem)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Stem file missing on disk.")
        return FileResponse(path, media_type="audio/mpeg")

    @router.post(
        "/songs/{song_id}/stems/{stem_name}/process",
        response_model=ProcessResponse,
        responses={
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
        },
    )
    async def process_stem(
        song_id: str,
        stem_name: str,
        params: ProcessRequest,
    ) -> ProcessResponse:
        """Apply rubberband pitch/tempo processing to a stem and return the result."""
        song = _require_ready_song(song_id)
        stem = _parse_stem(stem_name)
        if stem not in song.stems:
            raise HTTPException(
                status_code=404, detail=f"Stem '{stem_name}' not available."
            )

        input_path = storage.stem_path(song_id, stem)
        if not input_path.exists():
            raise HTTPException(status_code=404, detail="Stem file missing on disk.")

        output_path = storage.processed_path(
            song_id, stem, params.pitch_semitones, params.tempo_ratio
        )

        if not output_path.exists():
            try:
                processor.process(
                    input_path,
                    output_path,
                    pitch_semitones=params.pitch_semitones,
                    tempo_ratio=params.tempo_ratio,
                )
            except AudioProcessorError as exc:
                logger.exception(
                    "Audio processing failed for song %s stem %s", song_id, stem_name
                )
                raise HTTPException(
                    status_code=500, detail="Audio processing failed"
                ) from exc

        return ProcessResponse(
            song_id=song_id,
            stem=stem,
            pitch_semitones=params.pitch_semitones,
            tempo_ratio=params.tempo_ratio,
            output_path=str(output_path),
        )

    @router.get(
        "/songs/{song_id}/stems/{stem_name}/processed",
        responses={
            200: {"content": {"audio/mpeg": {}}},
            404: {"model": ErrorResponse},
        },
    )
    async def get_processed_stem(
        song_id: str,
        stem_name: str,
        pitch: float = 0.0,
        tempo: float = 1.0,
    ) -> FileResponse:
        """Stream a rubberband-processed stem.

        The stem will be (re-)processed if the output file does not exist yet.
        Use query parameters *pitch* (semitones) and *tempo* (ratio).
        """
        song = _require_ready_song(song_id)
        stem = _parse_stem(stem_name)
        if stem not in song.stems:
            raise HTTPException(
                status_code=404, detail=f"Stem '{stem_name}' not available."
            )

        input_path = storage.stem_path(song_id, stem)
        if not input_path.exists():
            raise HTTPException(status_code=404, detail="Stem file missing on disk.")

        output_path = storage.processed_path(song_id, stem, pitch, tempo)
        if not output_path.exists():
            try:
                processor.process(
                    input_path, output_path, pitch_semitones=pitch, tempo_ratio=tempo
                )
            except AudioProcessorError as exc:
                logger.exception(
                    "Audio processing failed for song %s stem %s", song_id, stem_name
                )
                raise HTTPException(
                    status_code=500, detail="Audio processing failed"
                ) from exc

        storage.touch_version(song_id, pitch, tempo)
        return FileResponse(output_path, media_type="audio/mpeg")

    @router.get(
        "/songs/{song_id}/versions",
        response_model=VersionListResponse,
        responses={
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse},
        },
    )
    async def list_versions(song_id: str) -> VersionListResponse:
        """Return all pre-calculated pitch/tempo versions for a ready song.

        The default version (pitch=0, tempo=1.0) is always included first and
        represents the unmodified stems produced by demucs.
        """
        _require_ready_song(song_id)
        pairs = storage.list_versions(song_id)
        versions: list[Version] = [
            Version(
                pitch_semitones=0.0,
                tempo_ratio=1.0,
                is_default=True,
                status=VersionStatus.READY,
            )
        ]
        for pitch, tempo in pairs:
            if pitch == 0.0 and tempo == 1.0:
                continue
            vstatus = storage.version_status(song_id, pitch, tempo)
            versions.append(
                Version(
                    pitch_semitones=pitch,
                    tempo_ratio=tempo,
                    is_default=False,
                    status=vstatus,
                )
            )
        return VersionListResponse(versions=versions)

    @router.post(
        "/songs/{song_id}/versions",
        response_model=BulkProcessResponse,
        responses={
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse},
        },
    )
    async def create_version(
        song_id: str,
        params: BulkProcessRequest,
        background_tasks: BackgroundTasks,
    ) -> BulkProcessResponse:
        """Pre-cache all stems for the given pitch/tempo pair in the background.

        Idempotent: returns status "ready" immediately if all stems already exist.
        If only some stems are cached (partial), reprocesses only the missing ones.
        """
        _require_ready_song(song_id)
        vstatus = storage.version_status(
            song_id, params.pitch_semitones, params.tempo_ratio
        )
        if vstatus == VersionStatus.READY:
            return BulkProcessResponse(
                song_id=song_id,
                pitch_semitones=params.pitch_semitones,
                tempo_ratio=params.tempo_ratio,
                status="ready",
            )
        background_tasks.add_task(
            _process_version_task, song_id, params.pitch_semitones, params.tempo_ratio
        )
        return BulkProcessResponse(
            song_id=song_id,
            pitch_semitones=params.pitch_semitones,
            tempo_ratio=params.tempo_ratio,
            status="processing",
        )

    @router.delete(
        "/songs/{song_id}/versions",
        status_code=204,
        responses={
            400: {"model": ErrorResponse},
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse},
        },
    )
    async def delete_version(
        song_id: str,
        pitch: float = 0.0,
        tempo: float = 1.0,
    ) -> None:
        """Delete a pre-calculated version (its processed stem files).

        The default version (pitch=0, tempo=1.0) cannot be deleted.
        Returns 404 if no processed files for the given pitch/tempo were found.
        """
        _require_ready_song(song_id)
        if pitch == 0.0 and tempo == 1.0:
            raise HTTPException(
                status_code=400, detail="Cannot delete the default version."
            )
        count = storage.delete_version(song_id, pitch, tempo)
        if count == 0:
            raise HTTPException(status_code=404, detail="Version not found.")

    @router.get("/health")
    async def health() -> dict[str, str]:
        """Health check endpoint."""
        return {"status": "ok"}

    @router.get("/config")
    async def get_config() -> dict[str, int]:
        """Return server-side configuration values useful to the frontend."""
        return {
            "max_versions_global": MAX_VERSIONS_GLOBAL,
            "max_split_workers": MAX_SPLIT_WORKERS,
            "max_process_workers": MAX_PROCESS_WORKERS,
        }

    return router


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _require_ready_song(song_id: str) -> Song:
    song = storage.load_song(song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found.")
    if song.status != SongStatus.READY:
        raise HTTPException(
            status_code=409,
            detail=f"Song is not ready yet (status: {song.status.value}).",
        )
    return song


def _parse_stem(stem_name: str) -> StemName:
    try:
        return StemName(stem_name)
    except ValueError:
        valid = ", ".join(s.value for s in StemName)
        raise HTTPException(
            status_code=422,
            detail=f"Invalid stem name '{stem_name}'. Valid values: {valid}",
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

app = create_app()


if __name__ == "__main__":
    import uvicorn

    reload = os.getenv("UVICORN_RELOAD", "false").lower() == "true"
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=reload)  # noqa: S104
