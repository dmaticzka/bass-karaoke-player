# GitHub Copilot Instructions – Bass Karaoke Player

## Project overview

Bass Karaoke Player is a self-hosted web application that:
- Accepts audio uploads (MP3, WAV, FLAC, OGG, M4A, AAC)
- Splits audio into four stems (vocals, bass, drums, other) using [demucs](https://github.com/adefossez/demucs) (`htdemucs` model)
- Applies pitch transposition (±12 semitones) and tempo changes (25–400 %) via [rubberband](https://breakfastquay.com/rubberband/)
- Streams the processed stems to a browser-based player with per-stem volume controls

## Architecture

```
bass-karaoke-player/
├── backend/app/
│   ├── main.py            # FastAPI app factory + REST endpoints
│   ├── audio_processor.py # Demucs (StemSplitter) + Rubberband (RubberbandProcessor) wrappers
│   ├── models.py          # Pydantic v2 data models (Song, StemName, SongStatus, …)
│   └── storage.py         # SongStorage – manages DATA_DIR layout on disk
├── backend/tests/         # pytest integration + unit tests (mirrors app/ structure)
├── frontend/              # Vanilla HTML/CSS/JS (no build step)
└── .github/workflows/     # ci.yml (lint+test+docker), release.yml, auto-release.yml
```

**Runtime environment variables:**
| Variable | Default | Description |
|---|---|---|
| `DATA_DIR` | `data` | Root directory for uploads, stems, and processed files |
| `FRONTEND_DIR` | `frontend` | Directory served as static files |

## Tech stack & key libraries

| Layer | Library / Tool | Version constraint |
|---|---|---|
| Backend | FastAPI | ≥ 0.111 |
| Backend | Pydantic | v2 (≥ 2.7) |
| Backend | aiofiles | ≥ 23.2 |
| Backend | demucs | ≥ 4.0 (htdemucs model) |
| System | rubberband-cli | any recent |
| System | ffmpeg | any recent |
| Runtime | Python | ≥ 3.13 |
| Test | pytest + pytest-asyncio | asyncio_mode = auto |
| Lint | ruff | ≥ 0.4 |
| Type-check | mypy | strict mode |

## Coding conventions

### Python
- Python ≥ 3.13; use `from __future__ import annotations` at the top of every module.
- **Type hints everywhere** – mypy is run in strict mode (`mypy backend/app/ --ignore-missing-imports`).
- Use `pathlib.Path` instead of `os.path` string manipulation.
- Use `aiofiles` for async file I/O in endpoint handlers; use synchronous file I/O only inside background tasks or CPU-bound functions.
- Pydantic **v2** – use `model_validator`, `field_validator`, `model_dump()` etc. (not v1 syntax).
- Logging: use `logger = logging.getLogger(__name__)` at module level; never use `print()` in production code.
- Error handling: raise `fastapi.HTTPException` with appropriate status codes in route handlers; raise custom `AudioProcessorError` inside `audio_processor.py`.
- Format: `ruff format` (88-char line length, compatible with Black). **Always run `ruff format <file>` after editing any Python file**, and verify with `ruff format --check backend/` before committing.
- Lint rules: E, F, I, N, W, UP (see `pyproject.toml [tool.ruff.lint]`).

### Commit messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance (deps, CI, tooling)
- `docs:` documentation only
- `test:` tests only
- `refactor:` code restructuring without behaviour change

### Versioning
[Semantic Versioning](https://semver.org/) – `MAJOR.MINOR.PATCH`. Releases are triggered by pushing a `v*.*.*` tag.

## Testing

- Tests live in `backend/tests/`; file names mirror `backend/app/` (e.g. `test_api.py` ↔ `main.py`).
- Run tests: `PYTHONPATH=. pytest backend/tests/ -v`
- Use `pytest.fixture` with `tmp_path` to isolate file system state.
- Mock external processes (`StemSplitter`, `RubberbandProcessor`) with `unittest.mock.MagicMock`.
- The `TestClient` fixture creates a fresh `create_app()` for every test class.
- Prefer `class`-based test organisation (e.g. `class TestSongUpload:`).
- `asyncio_mode = "auto"` is configured in `pyproject.toml` – no explicit `@pytest.mark.asyncio` needed.
- **Coverage requirement: the project must maintain >95 % line coverage.** This is enforced via `--cov-fail-under=95` in `pyproject.toml` and measured with `pytest-cov`. Every new feature or bug-fix must include tests that keep total coverage above this threshold.

## REST API conventions

- All endpoints are prefixed with `/api`.
- Success responses use 2xx status codes with JSON bodies matching Pydantic response models.
- Errors return `{"detail": "<message>"}` (FastAPI default) or `ErrorResponse` where typed.
- File uploads use `UploadFile` (multipart/form-data).
- Long-running operations (stem splitting, rubberband) run as `BackgroundTasks`.
- Stem names are the `StemName` enum: `vocals`, `bass`, `drums`, `other`.
- Song lifecycle: `uploading` → `splitting` → `ready` | `error`.

## Data directory layout

```
DATA_DIR/
└── songs/
    └── {song_id}/
        ├── meta.json           # serialised Song model
        ├── original/
        │   └── {filename}      # uploaded file
        ├── stems/
        │   ├── vocals.wav
        │   ├── bass.wav
        │   ├── drums.wav
        │   └── other.wav
        └── processed/
            └── {stem}_{pitch}_{tempo}.wav   # rubberband output cache
```

## How to run locally (without Docker)

```bash
pip install -r requirements-dev.txt
FRONTEND_DIR=frontend DATA_DIR=data \
  PYTHONPATH=. uvicorn backend.app.main:app --reload
```

## How to run tests

```bash
PYTHONPATH=. pytest backend/tests/ -v
```

## How to run E2E tests

E2E tests require:
1. Playwright browsers: `uv run playwright install --with-deps chromium`
2. A built frontend: `cd frontend && npm ci && npm run build`
3. System dependencies: `ffmpeg` and `ffprobe` (for backend metadata extraction)

```bash
PYTHONPATH=. pytest e2e/ -v --no-cov
```

The e2e suite spins up a real `uvicorn` server against a temporary data directory
and exercises both the headless API (via `APIRequestContext`) and a real Chromium
browser (via pytest-playwright).

### E2E test writing rules

* **Never call external tools (`ffmpeg`, `rubberband`, `demucs`, …) from test
  fixtures.** These tools are available in the Copilot agent environment (via
  `copilot-setup-steps.yml`) but are NOT pre-installed in the CI e2e runner.
  Use the pre-existing sample files in `e2e/media/` or generate data with
  pure-Python helpers (e.g. `wave.open`).
* When multiple session-scoped fixtures populate the same `e2e_data_dir`,
  locators that match multiple elements will trigger Playwright's strict-mode
  violation.  Use `.first` or scope locators with `data-id` attributes.
* The frontend must be built (`npm run build`) before running UI tests.  The
  `live_server` fixture prefers `frontend/dist/` if it exists, falling back to
  `frontend/` for local development.

## How to lint & format

```bash
ruff check backend/
ruff format backend/          # auto-format (fixes formatting in-place)
ruff format --check backend/  # verify formatting without changing files
mypy backend/app/ --ignore-missing-imports
```

> **Important:** both `ruff check` *and* `ruff format --check` must pass. CI fails if either reports errors. Always run `ruff format backend/` after editing Python files.

## Docker

The multi-stage `Dockerfile` has two targets:
- `builder`: installs Python wheels
- `runtime`: minimal image with `rubberband-cli`, `ffmpeg`, `libsndfile1`

Build: `docker compose up --build`
