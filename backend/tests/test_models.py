"""Tests for Pydantic data models."""

from __future__ import annotations

import pytest
from backend.app.models import (
    ProcessRequest,
    ProcessResponse,
    Song,
    SongStatus,
    StemName,
    StemVolume,
    Version,
    VersionListResponse,
)
from pydantic import ValidationError


class TestStemName:
    def test_all_values_present(self) -> None:
        values = {s.value for s in StemName}
        assert values == {"drums", "bass", "other", "vocals"}

    def test_from_string(self) -> None:
        assert StemName("bass") is StemName.BASS
        assert StemName("vocals") is StemName.VOCALS

    def test_invalid_stem_raises(self) -> None:
        with pytest.raises(ValueError):
            StemName("guitar")


class TestStemVolume:
    def test_default_volume(self) -> None:
        sv = StemVolume(stem=StemName.BASS)
        assert sv.volume == 1.0

    def test_custom_volume(self) -> None:
        sv = StemVolume(stem=StemName.VOCALS, volume=0.5)
        assert sv.volume == 0.5

    def test_volume_too_high(self) -> None:
        with pytest.raises(ValidationError):
            StemVolume(stem=StemName.BASS, volume=3.0)

    def test_volume_negative(self) -> None:
        with pytest.raises(ValidationError):
            StemVolume(stem=StemName.BASS, volume=-0.1)


class TestProcessRequest:
    def test_defaults(self) -> None:
        req = ProcessRequest()
        assert req.pitch_semitones == 0.0
        assert req.tempo_ratio == 1.0

    def test_valid_pitch(self) -> None:
        req = ProcessRequest(pitch_semitones=7.0)
        assert req.pitch_semitones == 7.0

    def test_pitch_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            ProcessRequest(pitch_semitones=13.0)

    def test_pitch_negative_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            ProcessRequest(pitch_semitones=-13.0)

    def test_valid_tempo(self) -> None:
        req = ProcessRequest(tempo_ratio=0.5)
        assert req.tempo_ratio == 0.5

    def test_tempo_too_fast(self) -> None:
        with pytest.raises(ValidationError):
            ProcessRequest(tempo_ratio=5.0)

    def test_tempo_too_slow(self) -> None:
        with pytest.raises(ValidationError):
            ProcessRequest(tempo_ratio=0.1)


class TestSong:
    def test_default_status(self) -> None:
        song = Song(id="abc", filename="test.mp3")
        assert song.status is SongStatus.UPLOADED
        assert song.stems == []
        assert song.error_message is None

    def test_ready_song(self) -> None:
        song = Song(
            id="abc",
            filename="test.mp3",
            status=SongStatus.READY,
            stems=[StemName.BASS, StemName.DRUMS],
        )
        assert StemName.BASS in song.stems
        assert StemName.DRUMS in song.stems

    def test_json_round_trip(self) -> None:
        song = Song(
            id="xyz", filename="song.wav", status=SongStatus.ERROR, error_message="fail"
        )
        restored = Song.model_validate_json(song.model_dump_json())
        assert restored == song


class TestProcessResponse:
    def test_valid_response(self) -> None:
        resp = ProcessResponse(
            song_id="abc",
            stem=StemName.VOCALS,
            pitch_semitones=2.0,
            tempo_ratio=0.9,
            output_path="/data/processed/abc/vocals_p2d0_t0d9.wav",
        )
        assert resp.stem is StemName.VOCALS
        assert resp.pitch_semitones == 2.0


class TestVersion:
    def test_default_version(self) -> None:
        ver = Version(pitch_semitones=0.0, tempo_ratio=1.0, is_default=True)
        assert ver.is_default is True
        assert ver.pitch_semitones == 0.0
        assert ver.tempo_ratio == 1.0

    def test_non_default_version(self) -> None:
        ver = Version(pitch_semitones=2.0, tempo_ratio=0.8)
        assert ver.is_default is False
        assert ver.pitch_semitones == 2.0
        assert ver.tempo_ratio == 0.8

    def test_is_default_defaults_to_false(self) -> None:
        ver = Version(pitch_semitones=-3.0, tempo_ratio=1.25)
        assert ver.is_default is False


class TestVersionListResponse:
    def test_empty_versions(self) -> None:
        resp = VersionListResponse(versions=[])
        assert resp.versions == []

    def test_multiple_versions(self) -> None:
        default = Version(pitch_semitones=0.0, tempo_ratio=1.0, is_default=True)
        modified = Version(pitch_semitones=2.0, tempo_ratio=1.5)
        resp = VersionListResponse(versions=[default, modified])
        assert len(resp.versions) == 2
        assert resp.versions[0].is_default is True
        assert resp.versions[1].is_default is False
