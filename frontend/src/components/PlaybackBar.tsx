import { usePlayerStore } from "../store/playerStore";

interface Props {
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (val: number) => void;
  onLoopToggle: () => void;
  onLoopSetA: () => void;
  onLoopSetB: () => void;
  onLoopClear: () => void;
}

function fmtTime(secs: number): string {
  if (!isFinite(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function PlaybackBar({
  onPlayPause,
  onStop,
  onSeek,
  onLoopToggle,
  onLoopSetA,
  onLoopSetB,
  onLoopClear,
}: Props) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const duration = usePlayerStore((s) => s.duration);
  const startOffset = usePlayerStore((s) => s.startOffset);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopStart = usePlayerStore((s) => s.loopStart);
  const loopEnd = usePlayerStore((s) => s.loopEnd);

  const pos = Math.min(startOffset, duration || startOffset);

  const loopLabel =
    loopEnabled && loopStart !== null && loopEnd !== null
      ? `A: ${fmtTime(loopStart)} – B: ${fmtTime(loopEnd)}`
      : null;

  return (
    <div className="playback-controls">
      <div className="playback-buttons">
        <button
          id="play-pause-btn"
          className="btn btn-primary btn-lg"
          disabled={isLoading}
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play all stems"}
        >
          {isLoading ? "⏳ Loading…" : isPlaying ? "⏸ Pause" : "▶ Play All"}
        </button>
        <button
          id="stop-btn"
          className="btn btn-secondary btn-lg"
          onClick={onStop}
          aria-label="Stop playback"
        >
          ■ Stop
        </button>
      </div>

      <div className="seek-row">
        <input
          id="seek-slider"
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={pos}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek"
        />
        <span id="time-display">
          {fmtTime(pos)} / {fmtTime(duration)}
        </span>
      </div>

      <div className="loop-controls" id="loop-controls">
        <button
          id="loop-toggle-btn"
          className={`btn btn-sm ${loopEnabled ? "btn-primary" : "btn-secondary"}`}
          title="Toggle A-B loop"
          onClick={onLoopToggle}
        >
          ⟳ A↔B
        </button>
        <button
          id="loop-a-btn"
          className="btn btn-sm btn-secondary"
          title="Set loop start"
          disabled={!loopEnabled}
          onClick={onLoopSetA}
        >
          Set A
        </button>
        <button
          id="loop-b-btn"
          className="btn btn-sm btn-secondary"
          title="Set loop end"
          disabled={!loopEnabled}
          onClick={onLoopSetB}
        >
          Set B
        </button>
        <button
          id="loop-clear-btn"
          className="btn btn-sm btn-secondary"
          title="Clear loop"
          disabled={!loopEnabled}
          onClick={onLoopClear}
        >
          Clear
        </button>
        {loopLabel && (
          <span className="loop-display" id="loop-display">
            {loopLabel}
          </span>
        )}
      </div>

      {/* A-B loop indicator on seek slider */}
      {loopEnabled && loopStart !== null && loopEnd !== null && duration > 0 && (
        <div
          className="loop-range-indicator"
          style={{
            left: `${(loopStart / duration) * 100}%`,
            width: `${((loopEnd - loopStart) / duration) * 100}%`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

