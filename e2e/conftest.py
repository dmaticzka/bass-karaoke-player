"""E2E test configuration and shared session fixtures.

These fixtures:
- Pre-populate a temporary data directory with a "ready" song (including
  pre-built stems and identity-transform processed stems) so that the
  full player flow can be exercised without running demucs or rubberband.
- Start a real uvicorn subprocess pointing at that data directory.
- Override pytest-playwright's ``base_url`` fixture to point at the live
  server, so that both ``page.goto("/")`` and ``api_context.get("/api/…")``
  use relative paths automatically.
"""

from __future__ import annotations

import io
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
import wave
from collections.abc import Generator
from pathlib import Path

import pytest
from playwright.sync_api import APIRequestContext, Playwright

# Backend imports — safe to do here because storage/models have no
# import-time side effects that touch the file system or OS environment.
from backend.app.models import SongStatus, StemName
from backend.app.storage import SongStorage

_REPO_ROOT = Path(__file__).parent.parent.resolve()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_tiny_wav(path: Path) -> None:
    """Write a minimal 0.1-second silent mono WAV to *path*."""
    path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * 4410)  # 0.1 s of silence
    path.write_bytes(buf.getvalue())


def _find_free_port() -> int:
    """Return an available TCP port on 127.0.0.1."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ---------------------------------------------------------------------------
# Data fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def e2e_data_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Return an isolated data directory shared across the whole test session."""
    return tmp_path_factory.mktemp("e2e_data")


@pytest.fixture(scope="session")
def ready_song_id(e2e_data_dir: Path) -> str:
    """Pre-populate *e2e_data_dir* with a ready song; return its ID.

    The fixture creates:
    - ``original/test_song.mp3``  – placeholder bytes
    - ``stems/{vocals,bass,drums,other}.mp3``  – tiny silent placeholder files
    - processed stems for the identity transform (pitch=0, tempo=1.0),
      derived via ``SongStorage.processed_path()`` — the authoritative
      path logic lives in ``backend/app/storage.py``.
    """
    storage = SongStorage(e2e_data_dir)

    # Create the Song record; use the auto-generated ID
    song = storage.create_song("test_song.mp3")
    song_id = song.id

    # original placeholder
    orig_dir = storage.original_dir(song_id)
    orig_dir.mkdir(parents=True, exist_ok=True)
    (orig_dir / "test_song.mp3").write_bytes(b"\xff\xfb" + b"\x00" * 100)

    # stems
    for stem in StemName:
        _make_tiny_wav(storage.stem_path(song_id, stem))

    # processed stems for the identity transform (pitch=0.0, tempo=1.0)
    # Path is computed by storage.processed_path() — single source of truth.
    for stem in StemName:
        proc_path = storage.processed_path(song_id, stem, pitch=0.0, tempo=1.0)
        _make_tiny_wav(proc_path)

    # Mark the song as ready
    storage.update_status(song_id, SongStatus.READY, stems=list(StemName))

    return song_id


# ---------------------------------------------------------------------------
# Server fixture
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def live_server(e2e_data_dir: Path, ready_song_id: str) -> Generator[str, None, None]:
    """Start a uvicorn server for the test session; yield its base URL.

    ``ready_song_id`` is requested here (even though its value is unused in
    the body) to guarantee the data directory is fully populated *before*
    the server process starts.
    """
    port = _find_free_port()
    env = {
        **os.environ,
        "DATA_DIR": str(e2e_data_dir),
        "FRONTEND_DIR": str(_REPO_ROOT / "frontend"),
        "PYTHONPATH": str(_REPO_ROOT),
    }
    proc = subprocess.Popen(
        [
            "uvicorn",
            "backend.app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        env=env,
    )

    base_url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(f"{base_url}/api/health", timeout=1)
            break
        except (urllib.error.URLError, OSError):
            time.sleep(0.3)
    else:
        proc.terminate()
        pytest.fail("E2E server did not start within 30 s")

    yield base_url

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


# ---------------------------------------------------------------------------
# pytest-playwright overrides
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def base_url(live_server: str) -> str:
    """Override pytest-playwright's base_url with the live server URL."""
    return live_server


@pytest.fixture(scope="session")
def api_context(
    playwright: Playwright, base_url: str
) -> Generator[APIRequestContext, None, None]:
    """Session-scoped Playwright APIRequestContext for headless API tests."""
    ctx = playwright.request.new_context(base_url=base_url)
    yield ctx
    ctx.dispose()


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def silence_wav_bytes() -> bytes:
    """Return bytes of a minimal 0.1-second silent WAV for upload tests."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * 4410)
    return buf.getvalue()
