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

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

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
COPY --from=builder /install /usr/local

# Copy application source
WORKDIR /app
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY pyproject.toml ./

# Create data directory
RUN mkdir -p /data/uploads /data/stems /data/processed

# Non-root user for security
RUN useradd -m -u 1000 player && chown -R player:player /app /data
USER player

ENV DATA_DIR=/data \
    FRONTEND_DIR=/app/frontend \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
