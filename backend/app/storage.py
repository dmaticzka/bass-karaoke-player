"""File-based storage management for uploaded songs and stems."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from backend.app.models import Song, SongStatus, StemName


class SongStorage:
    """Manages the directory layout and metadata persistence for songs."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.uploads_dir = base_dir / "uploads"
        self.stems_dir = base_dir / "stems"
        self.processed_dir = base_dir / "processed"
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        for d in (self.uploads_dir, self.stems_dir, self.processed_dir):
            d.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Song metadata helpers
    # ------------------------------------------------------------------

    def _meta_path(self, song_id: str) -> Path:
        return self.uploads_dir / song_id / "meta.json"

    def save_song(self, song: Song) -> None:
        song_dir = self.uploads_dir / song.id
        song_dir.mkdir(parents=True, exist_ok=True)
        self._meta_path(song.id).write_text(song.model_dump_json(), encoding="utf-8")

    def load_song(self, song_id: str) -> Song | None:
        meta = self._meta_path(song_id)
        if not meta.exists():
            return None
        return Song.model_validate_json(meta.read_text(encoding="utf-8"))

    def list_songs(self) -> list[Song]:
        songs: list[Song] = []
        for meta in sorted(self.uploads_dir.glob("*/meta.json")):
            try:
                songs.append(Song.model_validate_json(meta.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, ValueError):
                continue
        return songs

    def delete_song(self, song_id: str) -> bool:
        import shutil

        song_dir = self.uploads_dir / song_id
        if not song_dir.exists():
            return False
        shutil.rmtree(song_dir, ignore_errors=True)
        stems_dir = self.stems_dir / song_id
        if stems_dir.exists():
            shutil.rmtree(stems_dir, ignore_errors=True)
        processed_dir = self.processed_dir / song_id
        if processed_dir.exists():
            shutil.rmtree(processed_dir, ignore_errors=True)
        return True

    # ------------------------------------------------------------------
    # File path helpers
    # ------------------------------------------------------------------

    def upload_path(self, song_id: str, filename: str) -> Path:
        song_dir = self.uploads_dir / song_id
        song_dir.mkdir(parents=True, exist_ok=True)
        return song_dir / filename

    def stem_path(self, song_id: str, stem: StemName) -> Path:
        return self.stems_dir / song_id / f"{stem.value}.wav"

    def processed_path(
        self,
        song_id: str,
        stem: StemName,
        pitch: float,
        tempo: float,
    ) -> Path:
        """Return the output path for a rubberband-processed stem file."""
        tag = (
            f"p{pitch:+.2f}_t{tempo:.3f}".replace("+", "p")
            .replace("-", "m")
            .replace(".", "d")
        )
        proc_dir = self.processed_dir / song_id
        proc_dir.mkdir(parents=True, exist_ok=True)
        return proc_dir / f"{stem.value}_{tag}.wav"

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
