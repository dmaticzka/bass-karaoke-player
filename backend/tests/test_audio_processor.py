"""Tests for audio_processor module (StemSplitter and RubberbandProcessor)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from backend.app.audio_processor import (
    AudioProcessorError,
    RubberbandProcessor,
    StemSplitter,
    _run,
)
from backend.app.models import StemName

# ---------------------------------------------------------------------------
# _run helper
# ---------------------------------------------------------------------------


class TestRun:
    def test_success(self, tmp_path: Path) -> None:
        result = _run(["echo", "hello"])
        assert result.returncode == 0

    def test_failure_raises(self) -> None:
        with pytest.raises(AudioProcessorError):
            _run(["false"])

    def test_failure_no_check(self) -> None:
        result = _run(["false"], check=False)
        assert result.returncode != 0


# ---------------------------------------------------------------------------
# StemSplitter
# ---------------------------------------------------------------------------


class TestStemSplitter:
    @pytest.fixture()
    def splitter(self) -> StemSplitter:
        return StemSplitter(model="mdx")

    def test_split_success(self, splitter: StemSplitter, tmp_path: Path) -> None:
        input_wav = tmp_path / "song.wav"
        input_wav.write_bytes(b"\x00" * 100)

        # Create mock demucs output files
        model_dir = tmp_path / "stems" / "mdx" / "song"
        model_dir.mkdir(parents=True)
        for stem in StemName:
            (model_dir / f"{stem.value}.mp3").write_bytes(b"\x00" * 100)

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = splitter.split(input_wav, tmp_path / "stems")

        assert set(result.keys()) == set(StemName)
        for stem, path in result.items():
            assert path.exists()
            assert path.name == f"{stem.value}.mp3"

    def test_split_missing_stem(self, splitter: StemSplitter, tmp_path: Path) -> None:
        input_wav = tmp_path / "song.wav"
        input_wav.write_bytes(b"\x00" * 100)

        # Only create some stems (missing vocals)
        model_dir = tmp_path / "stems" / "mdx" / "song"
        model_dir.mkdir(parents=True)
        for stem in [StemName.BASS, StemName.DRUMS, StemName.OTHER]:
            (model_dir / f"{stem.value}.mp3").write_bytes(b"\x00" * 100)
        # vocals is intentionally missing

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            with pytest.raises(AudioProcessorError, match="vocals"):
                splitter.split(input_wav, tmp_path / "stems")

    def test_split_demucs_failure(self, splitter: StemSplitter, tmp_path: Path) -> None:
        input_wav = tmp_path / "song.wav"
        input_wav.write_bytes(b"\x00" * 100)

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.side_effect = AudioProcessorError("demucs failed")
            with pytest.raises(AudioProcessorError, match="demucs failed"):
                splitter.split(input_wav, tmp_path / "stems")

    def test_split_command_suppresses_resource_warning(
        self, splitter: StemSplitter, tmp_path: Path
    ) -> None:
        """Python 3.14 resource_tracker flags leaked multiprocessing semaphores
        created by demucs --jobs workers.  The invocation must pass
        ``-W ignore::ResourceWarning`` so that warning is suppressed in the
        child process and does not cause a non-zero exit code."""
        input_wav = tmp_path / "song.wav"
        input_wav.write_bytes(b"\x00" * 100)

        model_dir = tmp_path / "stems" / "mdx" / "song"
        model_dir.mkdir(parents=True)
        for stem in StemName:
            (model_dir / f"{stem.value}.mp3").write_bytes(b"\x00" * 100)

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            splitter.split(input_wav, tmp_path / "stems")
            called_cmd = mock_run.call_args[0][0]

        assert "-W" in called_cmd
        w_idx = called_cmd.index("-W")
        assert called_cmd[w_idx + 1] == "ignore::ResourceWarning"
        # The flag must appear before the module invocation
        m_idx = called_cmd.index("-m")
        assert w_idx < m_idx, "-W must precede -m demucs"

    def test_split_command_contains_model(
        self, splitter: StemSplitter, tmp_path: Path
    ) -> None:
        input_wav = tmp_path / "song.wav"
        input_wav.write_bytes(b"\x00" * 100)

        model_dir = tmp_path / "stems" / "mdx" / "song"
        model_dir.mkdir(parents=True)
        for stem in StemName:
            (model_dir / f"{stem.value}.mp3").write_bytes(b"\x00" * 100)

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            splitter.split(input_wav, tmp_path / "stems")
            called_cmd = mock_run.call_args[0][0]
            assert "mdx" in called_cmd
            assert "--mp3" in called_cmd
            assert str(input_wav) in called_cmd
            assert "--jobs" not in called_cmd


# ---------------------------------------------------------------------------
# RubberbandProcessor
# ---------------------------------------------------------------------------


class TestRubberbandProcessor:
    @pytest.fixture()
    def proc(self) -> RubberbandProcessor:
        return RubberbandProcessor(rubberband_bin="rubberband")

    def test_process_success(self, proc: RubberbandProcessor, tmp_path: Path) -> None:
        input_wav = tmp_path / "vocals.wav"
        input_wav.write_bytes(b"\x00" * 100)
        output_wav = tmp_path / "out.wav"

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            # Simulate rubberband writing output
            output_wav.write_bytes(b"\x00" * 100)
            result = proc.process(
                input_wav, output_wav, pitch_semitones=2.0, tempo_ratio=0.8
            )

        assert result == output_wav
        call_cmd = mock_run.call_args[0][0]
        assert "--threads" in call_cmd
        assert "--fine" in call_cmd
        assert "--formant" in call_cmd
        assert "--centre-focus" in call_cmd
        assert "--pitch" in call_cmd
        assert "2.0" in call_cmd
        assert "--tempo" in call_cmd
        assert "0.8" in call_cmd

    def test_process_failure_raises(
        self, proc: RubberbandProcessor, tmp_path: Path
    ) -> None:
        input_wav = tmp_path / "vocals.wav"
        input_wav.write_bytes(b"\x00" * 100)
        output_wav = tmp_path / "out.wav"

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.side_effect = AudioProcessorError("rubberband failed")
            with pytest.raises(AudioProcessorError):
                proc.process(input_wav, output_wav)

    def test_is_available_true(self, proc: RubberbandProcessor) -> None:
        mock_result = MagicMock()
        mock_result.returncode = 0
        with patch("backend.app.audio_processor._run", return_value=mock_result):
            assert proc.is_available() is True

    def test_is_available_false(self, proc: RubberbandProcessor) -> None:
        mock_result = MagicMock()
        mock_result.returncode = 1
        with patch("backend.app.audio_processor._run", return_value=mock_result):
            assert proc.is_available() is False

    def test_creates_output_directory(
        self, proc: RubberbandProcessor, tmp_path: Path
    ) -> None:
        input_wav = tmp_path / "vocals.wav"
        input_wav.write_bytes(b"\x00" * 100)
        output_wav = tmp_path / "nested" / "dir" / "out.wav"

        with patch("backend.app.audio_processor._run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            output_wav.parent.mkdir(parents=True, exist_ok=True)
            output_wav.write_bytes(b"\x00" * 100)
            proc.process(input_wav, output_wav)

        assert output_wav.parent.exists()
