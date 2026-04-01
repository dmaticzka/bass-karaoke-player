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
        tag = (
            f"p{pitch:+.2f}_t{tempo:.3f}".replace("+", "p")
            .replace("-", "m")
            .replace(".", "d")
        )
        proc_dir = self.processed_output_dir(song_id)
        proc_dir.mkdir(parents=True, exist_ok=True)
        return proc_dir / f"{stem.value}_{tag}.mp3"

    # ------------------------------------------------------------------
    # Version helpers
    # ------------------------------------------------------------------

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
        where '+' → 'p', '-' → 'm', '.' → 'd'.
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

        Returns the number of files deleted (0 if none found).
        """
        proc_dir = self.processed_output_dir(song_id)
        if not proc_dir.exists():
            return 0

        tag = (
            f"p{pitch:+.2f}_t{tempo:.3f}".replace("+", "p")
            .replace("-", "m")
            .replace(".", "d")
        )

        count = 0
        for stem in StemName:
            path = proc_dir / f"{stem.value}_{tag}.mp3"
            if path.exists():
                path.unlink()
                count += 1
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
