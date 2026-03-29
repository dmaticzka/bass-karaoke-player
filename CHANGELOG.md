# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project setup with FastAPI backend, HTML/JS frontend, Docker support
- Stem splitting using demucs (`htdemucs` model) via background tasks
- Pitch transposition and tempo adjustment using rubberband CLI
- Per-stem volume mixing and mute controls in the web UI
- REST API for song management, stem retrieval, and rubberband processing
- Processed stem caching (avoids re-processing identical pitch/tempo parameters)
- GitHub Actions CI pipeline (lint, test on Python 3.10/3.11/3.12, Docker build)
- GitHub Actions Release pipeline (GitHub Release + Docker image to GHCR on semver tag)
- pytest test suite covering models, storage, audio processor, and API endpoints
- Docker multi-stage build with `rubberband-cli` and `ffmpeg` pre-installed
- Docker Compose configuration for local development and production

[Unreleased]: https://github.com/dmaticzka/bass-karaoke-player/compare/HEAD...HEAD
