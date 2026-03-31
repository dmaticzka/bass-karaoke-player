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

# Copy dependency manifest first (Docker cache layer)
COPY pyproject.toml ./

# Install production dependencies (including gpu extras) into the system Python so
# the runtime stage can COPY --from=builder /usr/local/lib and /usr/local/bin.
RUN pip install --no-cache-dir ".[gpu]"

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

# Create data directory and models cache directory
RUN mkdir -p /data/uploads /data/stems /data/processed /models

# Non-root user for security
RUN useradd -m -u 1000 player && chown -R player:player /app /data /models
USER player

ENV DATA_DIR=/data \
    FRONTEND_DIR=/app/frontend \
    TORCH_HOME=/models \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
