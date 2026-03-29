"""FastAPI application for the Bass Karaoke Player."""

from __future__ import annotations

import logging
import os
import shutil
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

import aiofiles
from backend.app.audio_processor import (
    AudioProcessorError,
    RubberbandProcessor,
    StemSplitter,
)
from backend.app.models import (
    ErrorResponse,
    ProcessRequest,
    ProcessResponse,
    Song,
    SongListResponse,
    SongStatus,
    StemName,
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
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", "frontend"))
ALLOWED_AUDIO_SUFFIXES = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}
MAX_UPLOAD_BYTES = 300 * 1024 * 1024  # 300 MB

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

storage: SongStorage
splitter: StemSplitter
processor: RubberbandProcessor


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global storage, splitter, processor  # noqa: PLW0603
    storage = SongStorage(DATA_DIR)
    splitter = StemSplitter()
    processor = RubberbandProcessor()
    yield


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
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

    # Mount frontend static files if the directory exists
    if FRONTEND_DIR.is_dir():
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

    upload_dir = storage.uploads_dir / song_id
    audio_files = [
        f for f in upload_dir.iterdir() if f.suffix.lower() in ALLOWED_AUDIO_SUFFIXES
    ]
    if not audio_files:
        storage.update_status(
            song_id, SongStatus.ERROR, error_message="No audio file found"
        )
        return

    input_path = audio_files[0]
    stems_out_dir = storage.stems_dir / song_id

    try:
        stem_map = splitter.split(input_path, stems_out_dir)
    except AudioProcessorError as exc:
        logger.exception("Stem splitting failed for %s", song_id)
        storage.update_status(song_id, SongStatus.ERROR, error_message=str(exc))
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

        storage.update_status(song.id, SongStatus.SPLITTING)
        background_tasks.add_task(_split_song_task, song.id)
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

    @router.get(
        "/songs/{song_id}/stems/{stem_name}",
        responses={
            200: {"content": {"audio/wav": {}}},
            404: {"model": ErrorResponse},
        },
    )
    async def get_stem(song_id: str, stem_name: str) -> FileResponse:
        """Stream an unprocessed stem WAV file."""
        song = _require_ready_song(song_id)
        stem = _parse_stem(stem_name)
        if stem not in song.stems:
            raise HTTPException(
                status_code=404, detail=f"Stem '{stem_name}' not available."
            )
        path = storage.stem_path(song_id, stem)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Stem file missing on disk.")
        return FileResponse(path, media_type="audio/wav")

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
                raise HTTPException(status_code=500, detail=str(exc)) from exc

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
            200: {"content": {"audio/wav": {}}},
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
                raise HTTPException(status_code=500, detail=str(exc)) from exc

        return FileResponse(output_path, media_type="audio/wav")

    @router.get("/health")
    async def health() -> dict[str, str]:
        """Health check endpoint."""
        return {"status": "ok"}

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
