"""Integration-style tests for the FastAPI application."""

from __future__ import annotations

import io
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from backend.app.main import create_app
from backend.app.models import SongStatus, StemName
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
