"""Tests for the storage module."""

from __future__ import annotations

from pathlib import Path

import pytest
from backend.app.models import SongStatus, StemName
from backend.app.storage import SongStorage


@pytest.fixture()
def storage(tmp_path: Path) -> SongStorage:
    return SongStorage(tmp_path / "data")


class TestSongStorage:
    def test_directories_created_on_init(self, tmp_path: Path) -> None:
        base = tmp_path / "mydata"
        store = SongStorage(base)
        assert store.songs_dir.exists()

    def test_create_and_load_song(self, storage: SongStorage) -> None:
        song = storage.create_song("my_song.mp3")
        assert song.filename == "my_song.mp3"
        assert song.status is SongStatus.UPLOADED

        loaded = storage.load_song(song.id)
        assert loaded is not None
        assert loaded.id == song.id
        assert loaded.filename == "my_song.mp3"

    def test_load_nonexistent_song_returns_none(self, storage: SongStorage) -> None:
        assert storage.load_song("does-not-exist") is None

    def test_list_songs_empty(self, storage: SongStorage) -> None:
        assert storage.list_songs() == []

    def test_list_songs_multiple(self, storage: SongStorage) -> None:
        s1 = storage.create_song("a.mp3")
        s2 = storage.create_song("b.mp3")
        songs = storage.list_songs()
        ids = {s.id for s in songs}
        assert s1.id in ids
        assert s2.id in ids

    def test_update_status(self, storage: SongStorage) -> None:
        song = storage.create_song("c.mp3")
        updated = storage.update_status(
            song.id,
            SongStatus.READY,
            stems=[StemName.BASS, StemName.VOCALS],
        )
        assert updated is not None
        assert updated.status is SongStatus.READY
        assert StemName.BASS in updated.stems

        reloaded = storage.load_song(song.id)
        assert reloaded is not None
        assert reloaded.status is SongStatus.READY

    def test_update_status_nonexistent(self, storage: SongStorage) -> None:
        result = storage.update_status("ghost", SongStatus.ERROR)
        assert result is None

    def test_delete_song(self, storage: SongStorage) -> None:
        song = storage.create_song("del.mp3")
        assert storage.delete_song(song.id) is True
        assert storage.load_song(song.id) is None

    def test_delete_nonexistent_song(self, storage: SongStorage) -> None:
        assert storage.delete_song("ghost") is False

    def test_stem_path(self, storage: SongStorage) -> None:
        path = storage.stem_path("song123", StemName.VOCALS)
        assert path.name == "vocals.wav"
        assert "song123" in str(path)
        assert "stems" in str(path)

    def test_processed_path_unique_per_params(self, storage: SongStorage) -> None:
        p1 = storage.processed_path("s1", StemName.BASS, 0.0, 1.0)
        p2 = storage.processed_path("s1", StemName.BASS, 2.0, 1.0)
        p3 = storage.processed_path("s1", StemName.BASS, 0.0, 0.8)
        assert p1 != p2
        assert p1 != p3
        assert p2 != p3

    def test_upload_path_creates_directory(self, storage: SongStorage) -> None:
        path = storage.upload_path("song999", "track.mp3")
        assert path.parent.exists()
        assert path.name == "track.mp3"
        assert "original" in str(path)

    def test_new_song_id_is_unique(self, storage: SongStorage) -> None:
        ids = {storage.new_song_id() for _ in range(100)}
        assert len(ids) == 100
