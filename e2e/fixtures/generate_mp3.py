"""Generate a minimal silent MP3 file.

Can be used both as an importable helper and as a standalone script::

    python3 e2e/fixtures/generate_mp3.py /tmp/smoke_test.mp3 10.0

Arguments:
    output_path  – destination file path (default: /tmp/silence.mp3)
    duration     – duration in seconds   (default: 10.0)
    channels     – number of audio channels; 2 = stereo (default: 2)
    rate         – sample rate in Hz (default: 44100)
"""

from __future__ import annotations

import os
import subprocess
import sys


def generate_mp3(
    path: str,
    *,
    channels: int = 2,
    rate: int = 44100,
    duration: float = 10.0,
) -> None:
    """Write a silent MP3 file to *path* using ffmpeg."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    channel_layout = "stereo" if channels == 2 else "mono"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r={rate}:cl={channel_layout}",
            "-t",
            str(duration),
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "9",
            path,
        ],
        check=True,
        capture_output=True,
    )


if __name__ == "__main__":
    output_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/silence.mp3"
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
    generate_mp3(output_path, duration=dur)
    print(f"Created {output_path} ({os.path.getsize(output_path)} bytes)")
