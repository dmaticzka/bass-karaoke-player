# syntax=docker/dockerfile:1
# =============================================================================
# Bass Karaoke Player – Dockerfile
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: builder – install Python dependencies into a virtual environment
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.11.3@sha256:90bbb3c16635e9627f49eec6539f956d70746c409209041800a0280b93152823 /uv /uvx /bin/

WORKDIR /app

# Install build dependencies (needed for compiled extension packages)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy locked dependency manifests first (Docker cache layer)
COPY pyproject.toml uv.lock ./

# Install production dependencies (including gpu extras) into /app/.venv.
# --frozen: use uv.lock as-is; --no-dev: skip dev group; --no-install-project:
# skip installing the app itself (it runs from source via PYTHONPATH).
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra gpu --no-install-project

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS runtime

LABEL org.opencontainers.image.title="Bass Karaoke Player"
LABEL org.opencontainers.image.description="Web-based music player with stem splitting and pitch/tempo control"
LABEL org.opencontainers.image.source="https://github.com/dmaticzka/bass-karaoke-player"

# Install system runtime dependencies:
#  - rubberband-cli: pitch/tempo processing
#  - ffmpeg: audio format conversion (used by demucs)
#  - libsndfile1: audio file I/O
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        rubberband-cli \
        ffmpeg \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy the virtual environment from the builder stage
COPY --from=builder /app/.venv /app/.venv

# Register the NVIDIA CUDA library directory with the dynamic linker so that
# torchcodec (CUDA-enabled wheel) can resolve libnppicc.so.13 provided by the
# nvidia-npp Python package.
RUN /app/.venv/bin/python -c "import sysconfig; print(sysconfig.get_paths()['purelib'] + '/nvidia/cu13/lib')" \
        > /etc/ld.so.conf.d/nvidia-cu13.conf \
    && ldconfig

# Copy application source
WORKDIR /app
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY pyproject.toml ./

# Create data directory and models cache directory
RUN mkdir -p /data/uploads /data/stems /data/processed /models

# Non-root user for security
RUN useradd -m -u 1000 player && chown -R player:player /app /data /models
USER player

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    DATA_DIR=/data \
    FRONTEND_DIR=/app/frontend \
    TORCH_HOME=/models \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ---------------------------------------------------------------------------
# Stage 3: smoketest – start the server and verify the health endpoint.
# Built in CI (docker-build job targets this stage) so that startup
# regressions – wrong imports, broken config, missing env vars, etc. – are
# caught during `docker build` rather than only during the nightly smoke run.
# ---------------------------------------------------------------------------
FROM runtime AS smoketest

USER root
RUN mkdir -p /tmp/smoke-data && chown player:player /tmp/smoke-data
USER player

RUN python - <<'PYEOF'
import os, subprocess, sys, time, urllib.request

TIMEOUT_SECONDS = 30
env = {**os.environ, "DATA_DIR": "/tmp/smoke-data"}
srv = subprocess.Popen(
    [
        "python", "-m", "uvicorn", "backend.app.main:app",
        "--host", "127.0.0.1", "--port", "8765",
    ],
    env=env,
)
try:
    for _ in range(TIMEOUT_SECONDS):
        try:
            urllib.request.urlopen("http://127.0.0.1:8765/api/health")
            break
        except OSError:
            time.sleep(1)
    else:
        sys.exit(f"ERROR: server did not become ready within {TIMEOUT_SECONDS} s")
    r = urllib.request.urlopen("http://127.0.0.1:8765/api/health")
    body = r.read().decode()
    assert r.status == 200 and '"ok"' in body, f"unexpected response: {body}"
    print("Smoke test passed:", body)
finally:
    srv.terminate()
    srv.wait()
PYEOF
