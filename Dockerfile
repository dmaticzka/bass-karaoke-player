# =============================================================================
# Bass Karaoke Player – Dockerfile
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: builder – install Python dependencies
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reproducible dependency installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency manifests first (Docker cache layer)
COPY pyproject.toml uv.lock ./

# Install production dependencies (including gpu extras) using the locked versions.
# --no-install-project skips installing the project itself (not needed at runtime).
# --system installs into the system Python so the runtime stage can COPY --from=builder.
RUN uv sync --frozen --no-dev --extra gpu --no-install-project --system

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
RUN apt-get update && apt-get install -y --no-install-recommends \
        rubberband-cli \
        ffmpeg \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /usr/local/lib /usr/local/lib
COPY --from=builder /usr/local/bin /usr/local/bin

# Register the NVIDIA CUDA library directory with the dynamic linker so that
# torchcodec (CUDA-enabled wheel) can resolve libnppicc.so.13 provided by the
# nvidia-npp Python package.
RUN python3 -c "import sysconfig; print(sysconfig.get_paths()['purelib'] + '/nvidia/cu13/lib')" \
        > /etc/ld.so.conf.d/nvidia-cu13.conf \
    && ldconfig

# Copy application source
WORKDIR /app
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY pyproject.toml ./

# Pre-download the htdemucs model weights into the image so that demucs never
# needs internet access at runtime (avoids failures in environments with custom
# TLS certificates or no outbound connectivity).
RUN TORCH_HOME=/opt/torch_cache \
    python -c "from demucs.pretrained import get_model; get_model('htdemucs')" \
    && chmod -R a+rX /opt/torch_cache

# Create data directory
RUN mkdir -p /data/uploads /data/stems /data/processed

# Non-root user for security
RUN useradd -m -u 1000 player && chown -R player:player /app /data
USER player

ENV DATA_DIR=/data \
    FRONTEND_DIR=/app/frontend \
    TORCH_HOME=/opt/torch_cache \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
