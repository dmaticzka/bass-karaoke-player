"""Generate a minimal silent WAV file.

Can be used both as an importable helper and as a standalone script::

    python3 e2e/fixtures/generate_wav.py /tmp/smoke_test.wav 3.0

Arguments:
    output_path  – destination file path (default: /tmp/silence.wav)
    duration     – duration in seconds   (default: 3.0)
    channels     – number of audio channels; 2 = stereo (default: 2)
    rate         – sample rate in Hz (default: 44100)
"""

from __future__ import annotations

import os
import sys
import wave


def generate_wav(
    path: str,
    *,
    channels: int = 2,
    rate: int = 44100,
    duration: float = 3.0,
) -> None:
    """Write a silent WAV file to *path*."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with wave.open(path, "wb") as f:
        f.setnchannels(channels)
        f.setsampwidth(2)
        f.setframerate(rate)
        frames = int(rate * duration)
        # channels * 2 bytes of silence per frame
        f.writeframes(b"\x00\x00" * channels * frames)


if __name__ == "__main__":
    output_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/silence.wav"
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
    generate_wav(output_path, duration=dur)
    print(f"Created {output_path} ({os.path.getsize(output_path)} bytes)")
