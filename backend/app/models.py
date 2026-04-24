"""Pydantic data models for the Bass Karaoke Player API."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class StemName(StrEnum):
    """Available stem names produced by demucs htdemucs model."""

    DRUMS = "drums"
    BASS = "bass"
    OTHER = "other"
    VOCALS = "vocals"


ALL_STEMS: list[StemName] = list(StemName)


class SongStatus(StrEnum):
    """Processing status of an uploaded song."""

    UPLOADED = "uploaded"
    QUEUED = "queued"
    SPLITTING = "splitting"
    READY = "ready"
    ERROR = "error"


class StemVolume(BaseModel):
    """Volume setting for a single stem (0.0 to 2.0, default 1.0)."""

    stem: StemName
    volume: float = Field(default=1.0, ge=0.0, le=2.0)


class ProcessingParams(BaseModel):
    """Parameters for rubberband audio processing."""

    pitch_semitones: float = Field(
        default=0.0,
        ge=-12.0,
        le=12.0,
        description="Pitch shift in semitones (-12 to +12)",
    )
    tempo_ratio: float = Field(
        default=1.0,
        ge=0.25,
        le=4.0,
        description="Tempo ratio (0.25 = quarter speed, 4.0 = quadruple speed)",
    )
    stem_volumes: list[StemVolume] = Field(
        default_factory=lambda: [StemVolume(stem=s) for s in ALL_STEMS],
        description="Volume settings per stem",
    )


class Song(BaseModel):
    """Metadata for an uploaded song."""

    id: str
    filename: str
    artist: str | None = None
    title: str | None = None
    status: SongStatus = SongStatus.UPLOADED
    stems: list[StemName] = Field(default_factory=list)
    error_message: str | None = None
    created_at: datetime | None = None


class SongListResponse(BaseModel):
    """Response containing a list of songs."""

    songs: list[Song]


class ProcessRequest(BaseModel):
    """Request body for processing a song with rubberband."""

    pitch_semitones: float = Field(default=0.0, ge=-12.0, le=12.0)
    tempo_ratio: float = Field(default=1.0, ge=0.25, le=4.0)


class ProcessResponse(BaseModel):
    """Response after triggering rubberband processing."""

    song_id: str
    stem: StemName
    pitch_semitones: float
    tempo_ratio: float
    output_path: str


class VersionStatus(StrEnum):
    """Readiness state of a pre-calculated version."""

    READY = "ready"
    PARTIAL = "partial"
    MISSING = "missing"


class Version(BaseModel):
    """A pre-calculated pitch/tempo version of a song."""

    pitch_semitones: float
    tempo_ratio: float
    is_default: bool = False
    status: VersionStatus = VersionStatus.READY


class VersionListResponse(BaseModel):
    """Response containing a list of pre-calculated versions."""

    versions: list[Version]


class BulkProcessRequest(BaseModel):
    """Request body for bulk-processing all stems at a given pitch/tempo."""

    pitch_semitones: float = Field(default=0.0, ge=-12.0, le=12.0)
    tempo_ratio: float = Field(default=1.0, ge=0.25, le=4.0)


class BulkProcessResponse(BaseModel):
    """Response after triggering a bulk version pre-cache."""

    song_id: str
    pitch_semitones: float
    tempo_ratio: float
    status: Literal["processing", "ready"]


class ErrorResponse(BaseModel):
    """Standard error response body."""

    detail: str
