"""File-based storage management for uploaded songs and stems."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import TypedDict

from backend.app.models import Song, SongStatus, StemName, VersionStatus


class VersionMetaEntry(TypedDict, total=False):
    """Structure of a single entry in versions.json."""

    accessed_at: str  # ISO 8601 timestamp – used for LRU eviction ordering
    stem_count: int
    pinned: bool


class SongStorage:
    """Manages the directory layout and metadata persistence for songs."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.songs_dir = base_dir / "songs"
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        self.songs_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Song directory helpers
    # ------------------------------------------------------------------

    def _song_dir(self, song_id: str) -> Path:
        return self.songs_dir / song_id

    def original_dir(self, song_id: str) -> Path:
        """Return the directory that holds the original uploaded file."""
        return self._song_dir(song_id) / "original"

    def stems_output_dir(self, song_id: str) -> Path:
        """Return the directory where demucs writes stem files."""
        return self._song_dir(song_id) / "stems"

    def processed_output_dir(self, song_id: str) -> Path:
        """Return the directory where rubberband-processed files are cached."""
        return self._song_dir(song_id) / "processed"

    # ------------------------------------------------------------------
    # Song metadata helpers
    # ------------------------------------------------------------------

    def _meta_path(self, song_id: str) -> Path:
        return self._song_dir(song_id) / "meta.json"

    def save_song(self, song: Song) -> None:
        self._song_dir(song.id).mkdir(parents=True, exist_ok=True)
        self._meta_path(song.id).write_text(song.model_dump_json(), encoding="utf-8")

    def load_song(self, song_id: str) -> Song | None:
        meta = self._meta_path(song_id)
        if not meta.exists():
            return None
        return Song.model_validate_json(meta.read_text(encoding="utf-8"))

    def list_songs(self) -> list[Song]:
        songs: list[Song] = []
        for meta in sorted(self.songs_dir.glob("*/meta.json")):
            try:
                songs.append(Song.model_validate_json(meta.read_text(encoding="utf-8")))
            except json.JSONDecodeError, ValueError:
                continue
        return songs

    def delete_song(self, song_id: str) -> bool:
        import shutil

        song_dir = self._song_dir(song_id)
        if not song_dir.exists():
            return False
        shutil.rmtree(song_dir, ignore_errors=True)
        return True

    # ------------------------------------------------------------------
    # File path helpers
    # ------------------------------------------------------------------

    def upload_path(self, song_id: str, filename: str) -> Path:
        orig_dir = self.original_dir(song_id)
        orig_dir.mkdir(parents=True, exist_ok=True)
        return orig_dir / filename

    def stem_path(self, song_id: str, stem: StemName) -> Path:
        return self.stems_output_dir(song_id) / f"{stem.value}.mp3"

    def processed_path(
        self,
        song_id: str,
        stem: StemName,
        pitch: float,
        tempo: float,
    ) -> Path:
        """Return the output path for a rubberband-processed stem file."""
        tag = self._make_version_tag(pitch, tempo)
        proc_dir = self.processed_output_dir(song_id)
        proc_dir.mkdir(parents=True, exist_ok=True)
        return proc_dir / f"{stem.value}_{tag}.mp3"

    # ------------------------------------------------------------------
    # Version helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_version_tag(pitch: float, tempo: float) -> str:
        """Build the filesystem-safe tag for a (pitch, tempo) pair."""
        return (
            f"p{pitch:+.2f}_t{tempo:.3f}".replace("+", "p")
            .replace("-", "m")
            .replace(".", "d")
        )

    def _version_meta_path(self, song_id: str) -> Path:
        return self.processed_output_dir(song_id) / "versions.json"

    def read_version_meta(self, song_id: str) -> dict[str, VersionMetaEntry]:
        """Read the versions.json sidecar. Returns empty dict if absent or invalid."""
        path = self._version_meta_path(song_id)
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
            return {}
        except json.JSONDecodeError, OSError:
            return {}

    def write_version_meta(
        self, song_id: str, meta: dict[str, VersionMetaEntry]
    ) -> None:
        """Write the versions.json sidecar."""
        path = self._version_meta_path(song_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(meta, default=str), encoding="utf-8")

    def touch_version(self, song_id: str, pitch: float, tempo: float) -> None:
        """Record or refresh the access timestamp for a (pitch, tempo) version."""
        tag = self._make_version_tag(pitch, tempo)
        meta = self.read_version_meta(song_id)
        stem_count = sum(
            1
            for stem in StemName
            if self.processed_path(song_id, stem, pitch, tempo).exists()
        )
        existing = meta.get(tag, {})
        entry: VersionMetaEntry = {
            "accessed_at": datetime.now(UTC).isoformat(),
            "stem_count": stem_count,
            "pinned": bool(existing.get("pinned", False)),
        }
        meta[tag] = entry
        self.write_version_meta(song_id, meta)

    def version_status(self, song_id: str, pitch: float, tempo: float) -> VersionStatus:
        """Return the readiness status of a (pitch, tempo) version."""
        total = len(list(StemName))
        stem_count = sum(
            1
            for stem in StemName
            if self.processed_path(song_id, stem, pitch, tempo).exists()
        )
        if stem_count == total:
            return VersionStatus.READY
        if stem_count > 0:
            return VersionStatus.PARTIAL
        return VersionStatus.MISSING

    def evict_global_lru(self, max_total: int) -> list[tuple[str, float, float]]:
        """Evict globally least-recently-used non-pinned, non-default versions.

        Scans every song's processed directory and keeps the total count of
        non-default processed versions across **all** songs at or below
        *max_total*.  The default (pitch=0.0, tempo=1.0) version of any song
        is never evicted.

        Returns the list of (song_id, pitch, tempo) triples that were deleted.
        """
        evicted: list[tuple[str, float, float]] = []
        while True:
            candidates: list[tuple[str, str, float, float]] = []
            total_non_default = 0

            for song_dir in sorted(self.songs_dir.iterdir()):
                if not song_dir.is_dir():
                    continue
                song_id = song_dir.name
                versions = self.list_versions(song_id)
                non_default = [
                    (p, t) for p, t in versions if not (p == 0.0 and t == 1.0)
                ]
                total_non_default += len(non_default)
                meta = self.read_version_meta(song_id)
                for p, t in non_default:
                    tag = self._make_version_tag(p, t)
                    entry = meta.get(tag, {})
                    if not entry.get("pinned", False):
                        accessed_at = entry.get(
                            "accessed_at", "1970-01-01T00:00:00+00:00"
                        )
                        candidates.append((accessed_at, song_id, p, t))

            if total_non_default <= max_total:
                break
            if not candidates:
                break  # All remaining non-default versions are pinned
            candidates.sort()  # oldest accessed_at first
            _, song_id, pitch, tempo = candidates[0]
            self.delete_version(song_id, pitch, tempo)
            evicted.append((song_id, pitch, tempo))
        return evicted

    def list_versions(self, song_id: str) -> list[tuple[float, float]]:
        """Return unique (pitch_semitones, tempo_ratio) pairs from processed/ dir."""
        proc_dir = self.processed_output_dir(song_id)
        if not proc_dir.exists():
            return []

        versions: set[tuple[float, float]] = set()
        for f in proc_dir.iterdir():
            if f.suffix != ".mp3":
                continue
            name = f.stem  # filename without .mp3
            for stem in StemName:
                prefix = f"{stem.value}_"
                if name.startswith(prefix):
                    tag = name[len(prefix) :]
                    parsed = self._parse_version_tag(tag)
                    if parsed is not None:
                        versions.add(parsed)
                    break

        return sorted(versions)

    @staticmethod
    def _parse_version_tag(tag: str) -> tuple[float, float] | None:
        """Parse a version tag back into (pitch_semitones, tempo_ratio).

        Tag format: p{sign}{encoded_abs_pitch}_t{encoded_tempo}
        where '+' -> 'p', '-' -> 'm', '.' -> 'd'.
        """
        try:
            pitch_part, tempo_part = tag.split("_t", 1)
            # pitch_part: e.g. "pp2d00" or "pm3d50" (leading 'p' is literal prefix)
            inner = pitch_part[1:]  # strip leading 'p' prefix
            sign = "+" if inner[0] == "p" else "-"
            pitch = float(sign + inner[1:].replace("d", "."))
            tempo = float(tempo_part.replace("d", "."))
            return (pitch, tempo)
        except ValueError, IndexError:
            return None

    def delete_version(self, song_id: str, pitch: float, tempo: float) -> int:
        """Delete all processed stem files for the given pitch/tempo pair.

        Also removes the entry from versions.json if present.
        Returns the number of files deleted (0 if none found).
        """
        proc_dir = self.processed_output_dir(song_id)
        if not proc_dir.exists():
            return 0

        tag = self._make_version_tag(pitch, tempo)

        count = 0
        for stem in StemName:
            path = proc_dir / f"{stem.value}_{tag}.mp3"
            if path.exists():
                path.unlink()
                count += 1

        if count > 0:
            meta = self.read_version_meta(song_id)
            if tag in meta:
                meta.pop(tag)
                self.write_version_meta(song_id, meta)

        return count

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @staticmethod
    def new_song_id() -> str:
        return str(uuid.uuid4())

    def create_song(self, filename: str) -> Song:
        song = Song(id=self.new_song_id(), filename=filename)
        self.save_song(song)
        return song

    def update_status(
        self,
        song_id: str,
        status: SongStatus,
        stems: list[StemName] | None = None,
        error_message: str | None = None,
    ) -> Song | None:
        song = self.load_song(song_id)
        if song is None:
            return None
        song.status = status
        if stems is not None:
            song.stems = stems
        if error_message is not None:
            song.error_message = error_message
        self.save_song(song)
        return song
