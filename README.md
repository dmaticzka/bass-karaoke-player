# Bass Karaoke Player

A web-based music player that lets you split songs into individual stems (voice, bass, drums, other), transpose pitch, adjust tempo, and control per-stem volume — all in your browser.

> [!CAUTION]
> This project is an experiment in Vibe Coding and in early alpha "works for me" stage.

## Features

- 🎵 **Stem splitting** – powered by [demucs](https://github.com/adefossez/demucs) (`mdx` model, MP3 output)
- 🎹 **Pitch transposition** – shift songs up/down by up to ±12 semitones via [rubberband](https://github.com/breakfastquay/rubberband) (with `--threads --fine --formant --centre-focus` for best quality)
- ⏩ **Tempo control** – slow down or speed up (25%–400%) without changing pitch
- 🎚️ **Per-stem volume mixing** – independently adjust volume for drums, bass, vocals, and other instruments
- 💾 **MP3 throughout** – stems and processed files are stored as MP3 to save disk space and improve responsiveness
- 🌐 **Web interface** – clean, responsive UI; no native app required
- 🐳 **Docker** – single-command deployment

## Quick Start

### With Docker (recommended)

Pull the pre-built image from the GitHub Container Registry and start immediately — no clone required:

```bash
docker run -d \
  -p 8000:8000 \
  -v karaoke_data:/data \
  --name bass-karaoke-player \
  ghcr.io/dmaticzka/bass-karaoke-player:latest

# Open in your browser
open http://localhost:8000
```

Or clone the repo and use `docker compose`, which pulls the published image by default:

```bash
git clone https://github.com/dmaticzka/bass-karaoke-player.git
cd bass-karaoke-player

# Pull the published image and start
docker compose up

# — or — build the image locally instead
docker compose up --build

# Open in your browser
open http://localhost:8000
```

### Without Docker

**Prerequisites:**
- Python ≥ 3.14
- [uv](https://docs.astral.sh/uv/) package manager
- [rubberband](https://github.com/breakfastquay/rubberband) CLI (`rubberband` command)
- ffmpeg (required by demucs)

```bash
# Install Python dependencies
uv sync

# Start the server
FRONTEND_DIR=frontend DATA_DIR=data DEMUCS_JOBS=4 \
  uv run uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# Open in your browser
open http://localhost:8000
```

## Usage

1. **Upload a song** – drag & drop or browse for an MP3, WAV, FLAC, OGG, M4A, or AAC file
2. **Wait for stem splitting** – demucs runs in the background (may take a few minutes depending on song length)
3. **Load the song** – click "Load" once the status shows "Ready"
4. **Adjust controls:**
   - **Pitch** slider: shift semitones (−12 to +12)
   - **Tempo** slider: speed percentage (25%–200%)
   - Click **Apply Pitch & Tempo** to trigger rubberband processing
   - Each stem card has an individual **volume** slider and **mute** button
5. Click **▶ Play All** to start playback

## Configuration

The following environment variables control the application's behaviour:

| Variable | Default | Description |
|---|---|---|
| `DATA_DIR` | `data` | Directory used to store uploaded songs, stems, and processed files |
| `FRONTEND_DIR` | `frontend` | Directory from which the frontend static files are served |
| `MAX_SPLIT_WORKERS` | `1` | Maximum number of demucs stem-splitting jobs that run concurrently. Uploaded songs that cannot start immediately are queued (status `queued`) and processed in order as workers become free. Increase only if the host has enough CPU cores and RAM for parallel demucs runs. |
| `DEMUCS_JOBS` | `4` | Number of parallel CPU jobs used *within* a single demucs run |
| `TORCH_HOME` | *(PyTorch default)* | Cache directory for PyTorch / demucs model weights |

## API Reference

The backend exposes a REST API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/health` | Health check |
| `GET`  | `/api/songs` | List all songs |
| `POST` | `/api/songs` | Upload a new song (multipart form) |
| `GET`  | `/api/songs/{id}` | Get song metadata |
| `DELETE` | `/api/songs/{id}` | Delete a song |
| `GET`  | `/api/songs/{id}/stems/{stem}` | Stream raw stem MP3 |
| `POST` | `/api/songs/{id}/stems/{stem}/process` | Apply pitch/tempo via rubberband |
| `GET`  | `/api/songs/{id}/stems/{stem}/processed?pitch=&tempo=` | Stream processed stem MP3 |

Interactive API docs are available at `http://localhost:8000/docs`.

## Development

### Setup

```bash
# Install dev dependencies
uv sync --group dev

# Run tests
uv run pytest backend/tests/ -v

# Lint & format check
uv run ruff check backend/
uv run ruff format --check backend/
```

### Project structure

```
bass-karaoke-player/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI application
│   │   ├── audio_processor.py  # demucs + rubberband wrappers
│   │   ├── models.py        # Pydantic data models
│   │   └── storage.py       # File storage management
│   ├── tests/
│   │   ├── test_api.py
│   │   ├── test_audio_processor.py
│   │   ├── test_models.py
│   │   └── test_storage.py
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint, test, docker build on every push/PR
│       ├── release.yml         # Publish GitHub release + Docker image on tag
│       └── auto-release.yml    # Auto-bump version + publish on push to main
├── Dockerfile
├── docker-compose.yml
├── GHCR_SETUP.md
└── pyproject.toml
```

### Branching & commits

- All work is done in **feature branches** (`feature/…`) and merged via **Pull Requests**
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)
- Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`)
- Releases are triggered by pushing a tag: `git tag v1.0.0 && git push --tags`

### CI/CD

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci.yml` | Push / PR | Lint (ruff, mypy) → Test → Docker build |
| `release.yml` | Tag `v*.*.*` | Validate → Test → GitHub Release → Push Docker image to `ghcr.io` |
| `auto-release.yml` | Push to `main` | Auto-bump version tag → GitHub Release → Push Docker image to `ghcr.io` |

The Docker image is published to `ghcr.io/dmaticzka/bass-karaoke-player` and tagged as `latest`, plus the full, minor, and major semver versions.
See [GHCR_SETUP.md](GHCR_SETUP.md) for the one-time GitHub settings you need to enable.

## License

MIT – see [LICENSE](LICENSE).
