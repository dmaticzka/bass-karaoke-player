"""Audio processing using demucs (stem splitting) and rubberband (pitch/tempo)."""

from __future__ import annotations

import logging
import shlex
import subprocess
from pathlib import Path

from backend.app.models import StemName

logger = logging.getLogger(__name__)

DEMUCS_MODEL = "mdx"
RUBBERBAND_BIN = "rubberband"


class AudioProcessorError(RuntimeError):
    """Raised when an audio processing command fails."""


def _run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Run a subprocess command and return the result."""
    logger.debug("Running: %s", shlex.join(cmd))
    result = subprocess.run(  # noqa: S603
        cmd,
        capture_output=True,
        text=True,
        check=False,
    )
    if check and result.returncode != 0:
        raise AudioProcessorError(
            f"Command failed (exit {result.returncode}):\n"
            f"  cmd : {shlex.join(cmd)}\n"
            f"  stdout: {result.stdout}\n"
            f"  stderr: {result.stderr}"
        )
    return result


class StemSplitter:
    """Wraps the demucs CLI to split an audio file into stems."""

    def __init__(self, model: str = DEMUCS_MODEL, jobs: int = 4) -> None:
        self.model = model
        self.jobs = jobs

    def split(self, input_path: Path, output_dir: Path) -> dict[StemName, Path]:
        """Split *input_path* into stems using demucs.

        Returns a mapping from :class:`StemName` to the produced WAV file path.
        Raises :class:`AudioProcessorError` on failure.
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            "python",
            "-m",
            "demucs",
            "--name",
            self.model,
            "--mp3",
            "--jobs",
            str(self.jobs),
            "--out",
            str(output_dir),
            str(input_path),
        ]
        _run(cmd)

        # demucs writes to <output_dir>/<model>/<track_name>/<stem>.mp3
        track_name = input_path.stem
        stem_dir = output_dir / self.model / track_name

        stems: dict[StemName, Path] = {}
        for stem in StemName:
            candidate = stem_dir / f"{stem.value}.mp3"
            if candidate.exists():
                stems[stem] = candidate
            else:
                raise AudioProcessorError(f"Expected stem file not found: {candidate}")
        return stems


class RubberbandProcessor:
    """Wraps the rubberband CLI for pitch and tempo adjustment."""

    def __init__(self, rubberband_bin: str = RUBBERBAND_BIN) -> None:
        self.rubberband_bin = rubberband_bin

    def process(
        self,
        input_path: Path,
        output_path: Path,
        pitch_semitones: float = 0.0,
        tempo_ratio: float = 1.0,
    ) -> Path:
        """Process *input_path* with rubberband and write to *output_path*.

        Args:
            input_path: Source WAV file.
            output_path: Destination WAV file.
            pitch_semitones: Semitone shift (negative = lower, positive = higher).
            tempo_ratio: Speed multiplier (< 1 = slower, > 1 = faster).

        Returns:
            The *output_path* after successful processing.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            self.rubberband_bin,
            "--threads",
            "--fine",
            "--formant",
            "--centre-focus",
            "--pitch",
            str(pitch_semitones),
            "--tempo",
            str(tempo_ratio),
            str(input_path),
            str(output_path),
        ]
        _run(cmd)
        return output_path

    def is_available(self) -> bool:
        """Return True if the rubberband binary is accessible."""
        result = _run([self.rubberband_bin, "--version"], check=False)
        return result.returncode == 0
