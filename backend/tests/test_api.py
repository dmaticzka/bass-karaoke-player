"""Integration-style tests for the FastAPI application."""

from __future__ import annotations

import io
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from backend.app.audio_processor import AudioProcessorError
from backend.app.main import create_app
from backend.app.models import Song, SongStatus, StemName
from backend.app.storage import SongStorage
from fastapi.testclient import TestClient


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture()
def test_storage(data_dir: Path) -> SongStorage:
    return SongStorage(data_dir)


@pytest.fixture()
def client(data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Create a test client with an isolated data directory."""
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("FRONTEND_DIR", "/nonexistent")  # skip static mount

    # Re-create app fresh for each test
    import backend.app.main as main_module

    main_module.storage = SongStorage(data_dir)
    main_module.splitter = MagicMock()
    main_module.processor = MagicMock()

    app = create_app()
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestHealth:
    def test_health_ok(self, client: TestClient) -> None:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Song CRUD
# ---------------------------------------------------------------------------


class TestSongList:
    def test_empty_list(self, client: TestClient) -> None:
        resp = client.get("/api/songs")
        assert resp.status_code == 200
        assert resp.json() == {"songs": []}

    def test_list_after_upload(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        song = main_module.storage.create_song("test.mp3")
        resp = client.get("/api/songs")
        assert resp.status_code == 200
        ids = [s["id"] for s in resp.json()["songs"]]
        assert song.id in ids


class TestSongUpload:
    def test_upload_valid_mp3(self, client: TestClient) -> None:
        with patch("backend.app.main._split_song_task"):
            resp = client.post(
                "/api/songs",
                files={"file": ("song.mp3", io.BytesIO(b"\x00" * 100), "audio/mpeg")},
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["filename"] == "song.mp3"
        assert data["status"] == SongStatus.SPLITTING.value

    def test_upload_invalid_extension(self, client: TestClient) -> None:
        resp = client.post(
            "/api/songs",
            files={"file": ("document.pdf", io.BytesIO(b"data"), "application/pdf")},
        )
        assert resp.status_code == 400
        assert "Unsupported file type" in resp.json()["detail"]

    def test_upload_no_filename(self, client: TestClient) -> None:
        resp = client.post(
            "/api/songs",
            files={"file": ("", io.BytesIO(b"data"), "audio/mpeg")},
        )
        # FastAPI returns 400 (our check) or 422 (framework validation) for empty filename
        assert resp.status_code in (400, 422)

    def test_upload_wav(self, client: TestClient) -> None:
        with patch("backend.app.main._split_song_task"):
            resp = client.post(
                "/api/songs",
                files={"file": ("track.wav", io.BytesIO(b"\x00" * 44), "audio/wav")},
            )
        assert resp.status_code == 201
        assert resp.json()["filename"] == "track.wav"


class TestGetSong:
    def test_get_existing(self, client: TestClient) -> None:
        import backend.app.main as main_module

        song = main_module.storage.create_song("track.wav")
        resp = client.get(f"/api/songs/{song.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == song.id

    def test_get_nonexistent(self, client: TestClient) -> None:
        resp = client.get("/api/songs/does-not-exist")
        assert resp.status_code == 404


class TestDeleteSong:
    def test_delete_existing(self, client: TestClient) -> None:
        import backend.app.main as main_module

        song = main_module.storage.create_song("del.mp3")
        resp = client.delete(f"/api/songs/{song.id}")
        assert resp.status_code == 204

        resp2 = client.get(f"/api/songs/{song.id}")
        assert resp2.status_code == 404

    def test_delete_nonexistent(self, client: TestClient) -> None:
        resp = client.delete("/api/songs/ghost")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Stems
# ---------------------------------------------------------------------------


class TestGetStem:
    def _make_ready_song(
        self, data_dir: Path, stem: StemName = StemName.VOCALS
    ) -> Song:  # noqa: F821
        from backend.app.models import Song
        from backend.app.storage import SongStorage

        storage = SongStorage(data_dir)
        song = Song(
            id="ready-song",
            filename="test.mp3",
            status=SongStatus.READY,
            stems=[stem],
        )
        storage.save_song(song)
        # Create the stem file
        stem_path = storage.stem_path(song.id, stem)
        stem_path.parent.mkdir(parents=True, exist_ok=True)
        stem_path.write_bytes(b"RIFF" + b"\x00" * 40)
        return song

    def test_get_stem_ok(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        song = self._make_ready_song(data_dir)
        main_module.storage = SongStorage(data_dir)
        resp = client.get(f"/api/songs/{song.id}/stems/vocals")
        assert resp.status_code == 200

    def test_get_stem_song_not_ready(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        storage = SongStorage(data_dir)
        song = storage.create_song("pending.mp3")
        main_module.storage = storage
        resp = client.get(f"/api/songs/{song.id}/stems/vocals")
        assert resp.status_code == 409

    def test_get_stem_invalid_name(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        self._make_ready_song(data_dir)
        main_module.storage = SongStorage(data_dir)
        resp = client.get("/api/songs/ready-song/stems/guitar")
        assert resp.status_code == 422

    def test_get_stem_not_available(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        self._make_ready_song(data_dir, stem=StemName.VOCALS)
        main_module.storage = SongStorage(data_dir)
        # Request 'bass' but only 'vocals' is available
        resp = client.get("/api/songs/ready-song/stems/bass")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Process stem
# ---------------------------------------------------------------------------


class TestProcessStem:
    def _setup_ready_song(self, data_dir: Path) -> Song:  # noqa: F821
        from backend.app.models import Song
        from backend.app.storage import SongStorage

        storage = SongStorage(data_dir)
        song = Song(
            id="proc-song",
            filename="track.mp3",
            status=SongStatus.READY,
            stems=list(StemName),
        )
        storage.save_song(song)
        for stem in StemName:
            path = storage.stem_path(song.id, stem)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"RIFF" + b"\x00" * 40)
        return song

    def test_process_stem_calls_rubberband(
        self, client: TestClient, data_dir: Path
    ) -> None:
        import backend.app.main as main_module

        self._setup_ready_song(data_dir)
        storage = SongStorage(data_dir)
        main_module.storage = storage

        def fake_process(input_path, output_path, pitch_semitones=0.0, tempo_ratio=1.0):
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"RIFF" + b"\x00" * 40)
            return output_path

        main_module.processor.process.side_effect = fake_process

        resp = client.post(
            "/api/songs/proc-song/stems/vocals/process",
            json={"pitch_semitones": 3.0, "tempo_ratio": 0.9},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["pitch_semitones"] == 3.0
        assert data["tempo_ratio"] == 0.9
        assert data["stem"] == "vocals"

    def test_process_cached_result(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        self._setup_ready_song(data_dir)
        storage = SongStorage(data_dir)
        main_module.storage = storage

        # Pre-create the processed file to simulate a cache hit
        out_path = storage.processed_path("proc-song", StemName.VOCALS, 1.0, 1.0)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"RIFF" + b"\x00" * 40)

        resp = client.post(
            "/api/songs/proc-song/stems/vocals/process",
            json={"pitch_semitones": 1.0, "tempo_ratio": 1.0},
        )
        assert resp.status_code == 200
        # Processor should NOT have been called (cache hit)
        main_module.processor.process.assert_not_called()


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------


class TestFrontend:
    def test_root_serves_index_html(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """GET / must return the frontend index.html when FRONTEND_DIR exists."""
        import backend.app.main as main_module

        frontend_dir = tmp_path / "frontend"
        frontend_dir.mkdir()
        (frontend_dir / "index.html").write_text(
            "<!DOCTYPE html><html><body>Bass Karaoke Player</body></html>"
        )

        monkeypatch.setattr(main_module, "FRONTEND_DIR", frontend_dir)
        data_dir = tmp_path / "data"
        main_module.storage = SongStorage(data_dir)
        main_module.splitter = MagicMock()
        main_module.processor = MagicMock()

        app = create_app()
        test_client = TestClient(app)
        resp = test_client.get("/")
        assert resp.status_code == 200
        assert "html" in resp.headers["content-type"]
        assert "Bass Karaoke Player" in resp.text

    def test_root_not_available_without_frontend_dir(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """GET / must return 404 when FRONTEND_DIR does not exist."""
        import backend.app.main as main_module

        monkeypatch.setattr(main_module, "FRONTEND_DIR", tmp_path / "nonexistent")
        data_dir = tmp_path / "data"
        main_module.storage = SongStorage(data_dir)
        main_module.splitter = MagicMock()
        main_module.processor = MagicMock()

        app = create_app()
        test_client = TestClient(app, raise_server_exceptions=False)
        resp = test_client.get("/")
        assert resp.status_code == 404

    def test_root_returns_404_when_index_missing(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """GET / returns 404 when FRONTEND_DIR exists but index.html is absent."""
        import backend.app.main as main_module

        frontend_dir = tmp_path / "frontend"
        frontend_dir.mkdir()
        # Intentionally do NOT create index.html

        monkeypatch.setattr(main_module, "FRONTEND_DIR", frontend_dir)
        data_dir = tmp_path / "data"
        main_module.storage = SongStorage(data_dir)
        main_module.splitter = MagicMock()
        main_module.processor = MagicMock()

        app = create_app()
        test_client = TestClient(app, raise_server_exceptions=False)
        resp = test_client.get("/")
        assert resp.status_code == 404
        assert "index.html" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


class TestLifespan:
    def test_lifespan_initialises_app_state(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The lifespan context manager must set up storage, splitter and processor."""
        import backend.app.main as main_module

        monkeypatch.setattr(main_module, "DATA_DIR", tmp_path / "data")
        app = create_app()
        with TestClient(app) as client:
            resp = client.get("/api/health")
        assert resp.status_code == 200
        assert isinstance(main_module.storage, SongStorage)


# ---------------------------------------------------------------------------
# Upload edge cases
# ---------------------------------------------------------------------------


class TestSongUploadEdgeCases:
    def test_upload_file_too_large(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import backend.app.main as main_module

        monkeypatch.setattr(main_module, "MAX_UPLOAD_BYTES", 50)
        resp = client.post(
            "/api/songs",
            files={"file": ("big.mp3", io.BytesIO(b"\x00" * 100), "audio/mpeg")},
        )
        assert resp.status_code == 413
        assert "File too large" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# _split_song_task background task
# ---------------------------------------------------------------------------


class TestSplitSongTask:
    """Tests for the _split_song_task background task function."""

    def test_song_not_found_returns_gracefully(self, data_dir: Path) -> None:
        """Non-existent song_id must log an error and return without raising."""
        import backend.app.main as main_module
        from backend.app.main import _split_song_task

        main_module.storage = SongStorage(data_dir)
        _split_song_task("nonexistent")  # must not raise

    def test_no_audio_file_sets_error_status(self, data_dir: Path) -> None:
        """Upload dir with no audio file should set status to ERROR."""
        import backend.app.main as main_module
        from backend.app.main import _split_song_task

        storage = SongStorage(data_dir)
        main_module.storage = storage
        song = storage.create_song("test.mp3")
        # Do NOT write any actual audio file to the upload dir
        _split_song_task(song.id)

        updated = storage.load_song(song.id)
        assert updated is not None
        assert updated.status == SongStatus.ERROR

    def test_stem_splitting_failure_sets_error(self, data_dir: Path) -> None:
        """AudioProcessorError during splitting must set status to ERROR."""
        import backend.app.main as main_module
        from backend.app.main import _split_song_task

        storage = SongStorage(data_dir)
        song = storage.create_song("song.mp3")
        upload_path = storage.upload_path(song.id, "song.mp3")
        upload_path.write_bytes(b"\x00" * 100)

        mock_splitter = MagicMock()
        mock_splitter.split.side_effect = AudioProcessorError("demucs failed")
        main_module.storage = storage
        main_module.splitter = mock_splitter

        _split_song_task(song.id)

        updated = storage.load_song(song.id)
        assert updated is not None
        assert updated.status == SongStatus.ERROR
        assert "demucs failed" in (updated.error_message or "")

    def test_stem_splitting_success_sets_ready_status(
        self, data_dir: Path, tmp_path: Path
    ) -> None:
        """Successful splitting must set status to READY with all stems."""
        import backend.app.main as main_module
        from backend.app.main import _split_song_task

        storage = SongStorage(data_dir)
        song = storage.create_song("song.mp3")
        upload_path = storage.upload_path(song.id, "song.mp3")
        upload_path.write_bytes(b"\x00" * 100)

        # Fake stems at a different location so copy2 is exercised
        fake_dir = tmp_path / "fake_stems"
        fake_dir.mkdir()
        stem_paths: dict[StemName, Path] = {}
        for stem in StemName:
            p = fake_dir / f"{stem.value}.mp3"
            p.write_bytes(b"RIFF" + b"\x00" * 40)
            stem_paths[stem] = p

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = stem_paths
        main_module.storage = storage
        main_module.splitter = mock_splitter

        _split_song_task(song.id)

        updated = storage.load_song(song.id)
        assert updated is not None
        assert updated.status == SongStatus.READY
        assert set(updated.stems) == set(StemName)

    def test_stem_splitting_same_path_skips_copy(self, data_dir: Path) -> None:
        """When splitter returns the final dest paths, no copy should occur."""
        import backend.app.main as main_module
        from backend.app.main import _split_song_task

        storage = SongStorage(data_dir)
        song = storage.create_song("song.mp3")
        upload_path = storage.upload_path(song.id, "song.mp3")
        upload_path.write_bytes(b"\x00" * 100)

        # Return the actual destination paths so src_path == dest
        stem_paths: dict[StemName, Path] = {}
        for stem in StemName:
            dest = storage.stem_path(song.id, stem)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"RIFF" + b"\x00" * 40)
            stem_paths[stem] = dest

        mock_splitter = MagicMock()
        mock_splitter.split.return_value = stem_paths
        main_module.storage = storage
        main_module.splitter = mock_splitter

        _split_song_task(song.id)

        updated = storage.load_song(song.id)
        assert updated is not None
        assert updated.status == SongStatus.READY


# ---------------------------------------------------------------------------
# get_stem edge cases
# ---------------------------------------------------------------------------


class TestGetStemEdgeCases:
    def _make_ready_song_no_file(self, data_dir: Path, stem: StemName) -> Song:
        storage = SongStorage(data_dir)
        song = Song(
            id="no-file-song",
            filename="test.mp3",
            status=SongStatus.READY,
            stems=[stem],
        )
        storage.save_song(song)
        # Intentionally do NOT create the stem file on disk
        return song

    def test_get_stem_song_not_found(self, client: TestClient) -> None:
        resp = client.get("/api/songs/does-not-exist/stems/vocals")
        assert resp.status_code == 404

    def test_get_stem_file_missing_on_disk(
        self, client: TestClient, data_dir: Path
    ) -> None:
        """Stem listed in song.stems but actual WAV file is absent → 404."""
        import backend.app.main as main_module

        self._make_ready_song_no_file(data_dir, StemName.VOCALS)
        main_module.storage = SongStorage(data_dir)
        resp = client.get("/api/songs/no-file-song/stems/vocals")
        assert resp.status_code == 404
        assert "missing" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# process_stem edge cases
# ---------------------------------------------------------------------------


class TestProcessStemEdgeCases:
    def _make_ready_song(
        self,
        data_dir: Path,
        song_id: str = "ps-song",
        stems: list[StemName] | None = None,
    ) -> Song:
        storage = SongStorage(data_dir)
        chosen = stems if stems is not None else list(StemName)
        song = Song(
            id=song_id,
            filename="track.mp3",
            status=SongStatus.READY,
            stems=chosen,
        )
        storage.save_song(song)
        for stem in chosen:
            path = storage.stem_path(song.id, stem)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"RIFF" + b"\x00" * 40)
        return song

    def test_process_stem_song_not_found(self, client: TestClient) -> None:
        resp = client.post(
            "/api/songs/ghost/stems/vocals/process",
            json={"pitch_semitones": 0.0, "tempo_ratio": 1.0},
        )
        assert resp.status_code == 404

    def test_process_stem_not_available(
        self, client: TestClient, data_dir: Path
    ) -> None:
        """Request a stem that is not in song.stems → 404."""
        import backend.app.main as main_module

        self._make_ready_song(data_dir, stems=[StemName.VOCALS])
        main_module.storage = SongStorage(data_dir)
        resp = client.post(
            "/api/songs/ps-song/stems/bass/process",
            json={"pitch_semitones": 0.0, "tempo_ratio": 1.0},
        )
        assert resp.status_code == 404

    def test_process_stem_file_missing_on_disk(
        self, client: TestClient, data_dir: Path
    ) -> None:
        """Stem in song.stems but WAV missing on disk → 404."""
        import backend.app.main as main_module

        storage = SongStorage(data_dir)
        song = Song(
            id="ps-missing",
            filename="t.mp3",
            status=SongStatus.READY,
            stems=[StemName.VOCALS],
        )
        storage.save_song(song)
        # Do NOT create the stem file
        main_module.storage = storage
        resp = client.post(
            "/api/songs/ps-missing/stems/vocals/process",
            json={"pitch_semitones": 0.0, "tempo_ratio": 1.0},
        )
        assert resp.status_code == 404

    def test_process_stem_audio_processor_error(
        self, client: TestClient, data_dir: Path
    ) -> None:
        """AudioProcessorError from processor.process → 500."""
        import backend.app.main as main_module

        self._make_ready_song(data_dir)
        main_module.storage = SongStorage(data_dir)
        main_module.processor.process.side_effect = AudioProcessorError(
            "rubberband failed"
        )
        resp = client.post(
            "/api/songs/ps-song/stems/vocals/process",
            json={"pitch_semitones": 0.0, "tempo_ratio": 1.0},
        )
        assert resp.status_code == 500
        assert "rubberband failed" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# get_processed_stem endpoint
# ---------------------------------------------------------------------------


class TestGetProcessedStem:
    def _make_ready_song(
        self,
        data_dir: Path,
        song_id: str = "gps-song",
        stems: list[StemName] | None = None,
    ) -> Song:
        storage = SongStorage(data_dir)
        chosen = stems if stems is not None else list(StemName)
        song = Song(
            id=song_id,
            filename="track.mp3",
            status=SongStatus.READY,
            stems=chosen,
        )
        storage.save_song(song)
        for stem in chosen:
            path = storage.stem_path(song.id, stem)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"RIFF" + b"\x00" * 40)
        return song

    def test_song_not_ready(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        storage = SongStorage(data_dir)
        song = storage.create_song("pending.mp3")
        main_module.storage = storage
        resp = client.get(f"/api/songs/{song.id}/stems/vocals/processed")
        assert resp.status_code == 409

    def test_song_not_found(self, client: TestClient) -> None:
        resp = client.get("/api/songs/does-not-exist/stems/vocals/processed")
        assert resp.status_code == 404

    def test_invalid_stem_name(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        self._make_ready_song(data_dir)
        main_module.storage = SongStorage(data_dir)
        resp = client.get("/api/songs/gps-song/stems/guitar/processed")
        assert resp.status_code == 422

    def test_stem_not_available(self, client: TestClient, data_dir: Path) -> None:
        import backend.app.main as main_module

        self._make_ready_song(data_dir, stems=[StemName.VOCALS])
        main_module.storage = SongStorage(data_dir)
        resp = client.get("/api/songs/gps-song/stems/bass/processed")
        assert resp.status_code == 404

    def test_stem_file_missing_on_disk(
        self, client: TestClient, data_dir: Path
    ) -> None:
        import backend.app.main as main_module

        storage = SongStorage(data_dir)
        song = Song(
            id="gps-no-file",
            filename="t.mp3",
            status=SongStatus.READY,
            stems=[StemName.VOCALS],
        )
        storage.save_song(song)
        # Do NOT create the stem WAV file
        main_module.storage = storage
        resp = client.get("/api/songs/gps-no-file/stems/vocals/processed")
        assert resp.status_code == 404

    def test_process_and_stream(self, client: TestClient, data_dir: Path) -> None:
        """Stem is processed on-the-fly when output doesn't exist yet."""
        import backend.app.main as main_module

        self._make_ready_song(data_dir)
        main_module.storage = SongStorage(data_dir)

        def fake_process(
            input_path: Path,
            output_path: Path,
            pitch_semitones: float = 0.0,
            tempo_ratio: float = 1.0,
        ) -> Path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"RIFF" + b"\x00" * 40)
            return output_path

        main_module.processor.process.side_effect = fake_process
        resp = client.get(
            "/api/songs/gps-song/stems/vocals/processed?pitch=2.0&tempo=0.9"
        )
        assert resp.status_code == 200

    def test_cached_result_skips_processing(
        self, client: TestClient, data_dir: Path
    ) -> None:
        """Pre-existing output file is served directly without calling processor."""
        import backend.app.main as main_module

        self._make_ready_song(data_dir)
        storage = SongStorage(data_dir)
        main_module.storage = storage

        out_path = storage.processed_path("gps-song", StemName.VOCALS, 0.0, 1.0)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"RIFF" + b"\x00" * 40)

        resp = client.get("/api/songs/gps-song/stems/vocals/processed")
        assert resp.status_code == 200
        main_module.processor.process.assert_not_called()

    def test_audio_processor_error_returns_500(
        self, client: TestClient, data_dir: Path
    ) -> None:
        import backend.app.main as main_module

        self._make_ready_song(data_dir)
        main_module.storage = SongStorage(data_dir)
        main_module.processor.process.side_effect = AudioProcessorError(
            "rubberband crashed"
        )
        resp = client.get("/api/songs/gps-song/stems/vocals/processed")
        assert resp.status_code == 500
        assert "rubberband crashed" in resp.json()["detail"]
