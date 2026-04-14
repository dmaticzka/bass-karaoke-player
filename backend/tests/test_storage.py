"""Tests for the storage module."""

from __future__ import annotations

from pathlib import Path

import pytest
from backend.app.models import SongStatus, StemName, VersionStatus
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
        assert path.name == "vocals.mp3"
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

    def test_list_songs_skips_corrupt_json(self, storage: SongStorage) -> None:
        """Corrupt meta.json files must be silently ignored."""
        bad_dir = storage.songs_dir / "bad-id"
        bad_dir.mkdir()
        (bad_dir / "meta.json").write_text("not-valid-json{{{", encoding="utf-8")

        good_song = storage.create_song("good.mp3")
        songs = storage.list_songs()
        ids = [s.id for s in songs]
        assert good_song.id in ids
        assert "bad-id" not in ids

    def test_delete_song_removes_stems_and_processed_dirs(
        self, storage: SongStorage
    ) -> None:
        """Deleting a song also removes its stems/ and processed/ subdirectories."""
        song = storage.create_song("track.mp3")

        stems_dir = storage.stems_output_dir(song.id)
        stems_dir.mkdir(parents=True)
        (stems_dir / "vocals.mp3").write_bytes(b"\x00" * 10)

        proc_dir = storage.processed_output_dir(song.id)
        proc_dir.mkdir(parents=True)
        (proc_dir / "vocals_p0d0_t1d000.mp3").write_bytes(b"\x00" * 10)

        result = storage.delete_song(song.id)
        assert result is True
        assert not stems_dir.exists()
        assert not proc_dir.exists()

    def test_update_status_stores_error_message(self, storage: SongStorage) -> None:
        """update_status with error_message must persist the message."""
        song = storage.create_song("fail.mp3")
        updated = storage.update_status(
            song.id, SongStatus.ERROR, error_message="processing failed"
        )
        assert updated is not None
        assert updated.error_message == "processing failed"

        reloaded = storage.load_song(song.id)
        assert reloaded is not None
        assert reloaded.error_message == "processing failed"


class TestVersionStorage:
    def test_list_versions_empty_no_dir(self, storage: SongStorage) -> None:
        """list_versions returns [] when processed/ dir does not exist."""
        song = storage.create_song("song.mp3")
        assert storage.list_versions(song.id) == []

    def test_list_versions_empty_dir(self, storage: SongStorage) -> None:
        """list_versions returns [] for an existing but empty processed/ dir."""
        song = storage.create_song("song.mp3")
        storage.processed_output_dir(song.id).mkdir(parents=True, exist_ok=True)
        assert storage.list_versions(song.id) == []

    def test_list_versions_single(self, storage: SongStorage) -> None:
        """A single processed file yields one version tuple."""
        song = storage.create_song("song.mp3")
        path = storage.processed_path(song.id, StemName.VOCALS, 2.0, 1.5)
        path.write_bytes(b"\x00" * 10)
        versions = storage.list_versions(song.id)
        assert versions == [(2.0, 1.5)]

    def test_list_versions_deduplicates_across_stems(
        self, storage: SongStorage
    ) -> None:
        """Each (pitch, tempo) pair is returned once even when multiple stems exist."""
        song = storage.create_song("song.mp3")
        for stem in StemName:
            path = storage.processed_path(song.id, stem, -3.0, 0.75)
            path.write_bytes(b"\x00" * 10)
        versions = storage.list_versions(song.id)
        assert versions == [(-3.0, 0.75)]

    def test_list_versions_multiple_unique_pairs(self, storage: SongStorage) -> None:
        """Multiple distinct (pitch, tempo) pairs are all returned and sorted."""
        song = storage.create_song("song.mp3")
        storage.processed_path(song.id, StemName.BASS, 0.0, 0.5).write_bytes(b"\x00")
        storage.processed_path(song.id, StemName.BASS, 2.0, 1.0).write_bytes(b"\x00")
        storage.processed_path(song.id, StemName.BASS, -1.0, 1.25).write_bytes(b"\x00")
        versions = storage.list_versions(song.id)
        assert len(versions) == 3
        assert (-1.0, 1.25) in versions
        assert (0.0, 0.5) in versions
        assert (2.0, 1.0) in versions

    def test_list_versions_ignores_unknown_files(self, storage: SongStorage) -> None:
        """Files with unexpected names are silently ignored."""
        song = storage.create_song("song.mp3")
        proc_dir = storage.processed_output_dir(song.id)
        proc_dir.mkdir(parents=True, exist_ok=True)
        (proc_dir / "garbage.mp3").write_bytes(b"\x00")
        (proc_dir / "readme.txt").write_bytes(b"hello")
        assert storage.list_versions(song.id) == []

    def test_delete_version_removes_files(self, storage: SongStorage) -> None:
        """delete_version removes all stem files for the given pair."""
        song = storage.create_song("song.mp3")
        for stem in StemName:
            storage.processed_path(song.id, stem, 1.0, 1.2).write_bytes(b"\x00")
        count = storage.delete_version(song.id, 1.0, 1.2)
        assert count == len(list(StemName))
        assert storage.list_versions(song.id) == []

    def test_delete_version_returns_zero_when_not_found(
        self, storage: SongStorage
    ) -> None:
        """delete_version returns 0 when there are no matching files."""
        song = storage.create_song("song.mp3")
        assert storage.delete_version(song.id, 5.0, 2.0) == 0

    def test_delete_version_no_processed_dir(self, storage: SongStorage) -> None:
        """delete_version returns 0 when processed/ dir does not exist."""
        song = storage.create_song("song.mp3")
        assert storage.delete_version(song.id, 0.5, 1.0) == 0

    def test_delete_version_partial_stems(self, storage: SongStorage) -> None:
        """delete_version only counts files that actually exist."""
        song = storage.create_song("song.mp3")
        storage.processed_path(song.id, StemName.BASS, 2.0, 1.0).write_bytes(b"\x00")
        count = storage.delete_version(song.id, 2.0, 1.0)
        assert count == 1

    def test_delete_version_removes_meta_entry(self, storage: SongStorage) -> None:
        """delete_version must also remove the entry from versions.json."""
        song = storage.create_song("song.mp3")
        for stem in StemName:
            storage.processed_path(song.id, stem, 1.0, 1.2).write_bytes(b"\x00")
        storage.touch_version(song.id, 1.0, 1.2)
        tag = storage._make_version_tag(1.0, 1.2)
        meta_before = storage.read_version_meta(song.id)
        assert tag in meta_before
        storage.delete_version(song.id, 1.0, 1.2)
        meta_after = storage.read_version_meta(song.id)
        assert tag not in meta_after


class TestVersionMeta:
    """Tests for versions.json sidecar: read/write/touch."""

    def test_read_version_meta_returns_empty_when_absent(
        self, storage: SongStorage
    ) -> None:
        song = storage.create_song("song.mp3")
        assert storage.read_version_meta(song.id) == {}

    def test_read_version_meta_returns_empty_for_corrupt_json(
        self, storage: SongStorage
    ) -> None:
        song = storage.create_song("song.mp3")
        meta_path = storage._version_meta_path(song.id)
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text("{{broken json{{", encoding="utf-8")
        assert storage.read_version_meta(song.id) == {}

    def test_write_and_read_version_meta_roundtrip(self, storage: SongStorage) -> None:
        song = storage.create_song("song.mp3")
        data: dict[str, dict] = {"key": {"accessed_at": "2026-01-01T00:00:00+00:00"}}  # type: ignore[type-arg]
        storage.write_version_meta(song.id, data)
        result = storage.read_version_meta(song.id)
        assert result["key"]["accessed_at"] == "2026-01-01T00:00:00+00:00"

    def test_touch_version_creates_entry(self, storage: SongStorage) -> None:
        """touch_version must create a versions.json entry with accessed_at."""
        song = storage.create_song("song.mp3")
        # Create all 4 processed stems
        for stem in StemName:
            storage.processed_path(song.id, stem, 2.0, 1.5).write_bytes(b"\x00")
        storage.touch_version(song.id, 2.0, 1.5)
        tag = storage._make_version_tag(2.0, 1.5)
        meta = storage.read_version_meta(song.id)
        assert tag in meta
        assert "accessed_at" in meta[tag]
        assert meta[tag]["stem_count"] == 4
        assert meta[tag]["pinned"] is False

    def test_touch_version_updates_accessed_at(self, storage: SongStorage) -> None:
        """Calling touch_version twice must update accessed_at."""
        song = storage.create_song("song.mp3")
        storage.touch_version(song.id, 1.0, 1.0)
        tag = storage._make_version_tag(1.0, 1.0)
        first_at = storage.read_version_meta(song.id)[tag]["accessed_at"]
        storage.touch_version(song.id, 1.0, 1.0)
        second_at = storage.read_version_meta(song.id)[tag]["accessed_at"]
        # Both timestamps are valid ISO strings; second must be >= first
        assert second_at >= first_at

    def test_touch_version_preserves_pinned_flag(self, storage: SongStorage) -> None:
        """touch_version must not overwrite an existing pinned=True flag."""
        song = storage.create_song("song.mp3")
        tag = storage._make_version_tag(3.0, 0.8)
        storage.write_version_meta(song.id, {tag: {"pinned": True}})
        storage.touch_version(song.id, 3.0, 0.8)
        meta = storage.read_version_meta(song.id)
        assert meta[tag]["pinned"] is True


class TestVersionStatus:
    """Tests for version_status."""

    def test_missing_when_no_stems(self, storage: SongStorage) -> None:
        song = storage.create_song("song.mp3")
        assert storage.version_status(song.id, 2.0, 1.0) == VersionStatus.MISSING

    def test_partial_when_some_stems(self, storage: SongStorage) -> None:
        song = storage.create_song("song.mp3")
        storage.processed_path(song.id, StemName.BASS, 2.0, 1.0).write_bytes(b"\x00")
        assert storage.version_status(song.id, 2.0, 1.0) == VersionStatus.PARTIAL

    def test_ready_when_all_stems(self, storage: SongStorage) -> None:
        song = storage.create_song("song.mp3")
        for stem in StemName:
            storage.processed_path(song.id, stem, 2.0, 1.0).write_bytes(b"\x00")
        assert storage.version_status(song.id, 2.0, 1.0) == VersionStatus.READY


class TestEvictGlobalLru:
    """Tests for evict_global_lru."""

    def _make_version(
        self, storage: SongStorage, song_id: str, pitch: float, tempo: float
    ) -> None:
        for stem in StemName:
            storage.processed_path(song_id, stem, pitch, tempo).write_bytes(b"\x00")

    def test_no_eviction_when_within_limit(self, storage: SongStorage) -> None:
        song = storage.create_song("song.mp3")
        self._make_version(storage, song.id, 1.0, 1.0)
        evicted = storage.evict_global_lru(max_total=5)
        assert evicted == []
        assert storage.version_status(song.id, 1.0, 1.0) == VersionStatus.READY

    def test_evicts_globally_oldest_across_songs(self, storage: SongStorage) -> None:
        """The globally oldest accessed_at version is evicted first."""
        song1 = storage.create_song("song1.mp3")
        song2 = storage.create_song("song2.mp3")
        # song1 has the oldest version
        self._make_version(storage, song1.id, 1.0, 1.0)
        self._make_version(storage, song2.id, 2.0, 1.0)
        tag1 = storage._make_version_tag(1.0, 1.0)
        tag2 = storage._make_version_tag(2.0, 1.0)
        storage.write_version_meta(
            song1.id,
            {tag1: {"accessed_at": "2026-01-01T00:00:00+00:00", "pinned": False}},
        )
        storage.write_version_meta(
            song2.id,
            {tag2: {"accessed_at": "2026-01-03T00:00:00+00:00", "pinned": False}},
        )
        evicted = storage.evict_global_lru(max_total=1)
        assert len(evicted) == 1
        assert evicted[0] == (song1.id, 1.0, 1.0)
        assert storage.version_status(song1.id, 1.0, 1.0) == VersionStatus.MISSING
        assert storage.version_status(song2.id, 2.0, 1.0) == VersionStatus.READY

    def test_pinned_versions_not_evicted(self, storage: SongStorage) -> None:
        """Pinned versions must be skipped during global eviction."""
        song = storage.create_song("song.mp3")
        for pitch in [1.0, 2.0]:
            self._make_version(storage, song.id, pitch, 1.0)
        tag1 = storage._make_version_tag(1.0, 1.0)
        tag2 = storage._make_version_tag(2.0, 1.0)
        storage.write_version_meta(
            song.id,
            {
                tag1: {"accessed_at": "2026-01-01T00:00:00+00:00", "pinned": True},
                tag2: {"accessed_at": "2026-01-02T00:00:00+00:00", "pinned": True},
            },
        )
        evicted = storage.evict_global_lru(max_total=1)
        assert evicted == []  # Both are pinned, nothing to evict

    def test_default_version_never_evicted(self, storage: SongStorage) -> None:
        """The default (0.0, 1.0) version is exempt from global eviction."""
        song = storage.create_song("song.mp3")
        self._make_version(storage, song.id, 0.0, 1.0)
        self._make_version(storage, song.id, 1.0, 1.0)
        tag_default = storage._make_version_tag(0.0, 1.0)
        tag_other = storage._make_version_tag(1.0, 1.0)
        storage.write_version_meta(
            song.id,
            {
                tag_default: {
                    "accessed_at": "2025-01-01T00:00:00+00:00",
                    "pinned": False,
                },
                tag_other: {
                    "accessed_at": "2026-01-01T00:00:00+00:00",
                    "pinned": False,
                },
            },
        )
        # max_total=1: the non-default version (1.0, 1.0) counts as 1, which equals the
        # limit, so no eviction needed. The default (0.0, 1.0) is excluded from the count.
        evicted = storage.evict_global_lru(max_total=1)
        assert evicted == []
        assert storage.version_status(song.id, 0.0, 1.0) == VersionStatus.READY

    def test_evicts_multiple_to_reach_limit(self, storage: SongStorage) -> None:
        """Multiple versions across songs may be evicted in one call."""
        song1 = storage.create_song("song1.mp3")
        song2 = storage.create_song("song2.mp3")
        self._make_version(storage, song1.id, 1.0, 1.0)
        self._make_version(storage, song1.id, 2.0, 1.0)
        self._make_version(storage, song2.id, 3.0, 1.0)
        self._make_version(storage, song2.id, 4.0, 1.0)
        for song, pitch, ts in [
            (song1, 1.0, "2026-01-01T00:00:00+00:00"),
            (song1, 2.0, "2026-01-02T00:00:00+00:00"),
            (song2, 3.0, "2026-01-03T00:00:00+00:00"),
            (song2, 4.0, "2026-01-04T00:00:00+00:00"),
        ]:
            tag = storage._make_version_tag(pitch, 1.0)
            meta = storage.read_version_meta(song.id)
            meta[tag] = {"accessed_at": ts, "pinned": False}
            storage.write_version_meta(song.id, meta)

        evicted = storage.evict_global_lru(max_total=2)
        assert len(evicted) == 2
        # The two oldest: song1/1.0 and song1/2.0
        assert (song1.id, 1.0, 1.0) in evicted
        assert (song1.id, 2.0, 1.0) in evicted
