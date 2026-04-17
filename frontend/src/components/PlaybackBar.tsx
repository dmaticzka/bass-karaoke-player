import { LoaderCircle, Pause, Play, Square } from "lucide-react";
import { usePlayerStore } from "../store/playerStore";

interface Props {
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (val: number) => void;
  onSeekRelative: (delta: number) => void;
  onLoopToggle: () => void;
  onLoopSetA: () => void;
  onLoopSetB: () => void;
  onLoopClear: () => void;
}

function SkipBackIcon({ seconds }: { seconds: number }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <text
        x="13"
        y="16"
        textAnchor="middle"
        fontSize="7"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
        fontWeight="bold"
      >
        {seconds}
      </text>
    </svg>
  );
}

function SkipForwardIcon({ seconds }: { seconds: number }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <polyline points="21 3 21 8 16 8" />
      <text
        x="11"
        y="16"
        textAnchor="middle"
        fontSize="7"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
        fontWeight="bold"
      >
        {seconds}
      </text>
    </svg>
  );
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
  onSeekRelative,
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
          className="btn btn-secondary"
          onClick={() => onSeekRelative(-30)}
          aria-label="Skip back 30 seconds"
          title="Skip back 30 s"
        >
          <SkipBackIcon seconds={30} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onSeekRelative(-15)}
          aria-label="Skip back 15 seconds"
          title="Skip back 15 s"
        >
          <SkipBackIcon seconds={15} />
        </button>
        <button
          id="play-pause-btn"
          className="btn btn-primary btn-lg"
          disabled={isLoading}
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play all stems"}
        >
          {isLoading ? (
            <>
              <LoaderCircle size={22} className="icon-spin" aria-hidden="true" />
              <span className="sr-only">Loading…</span>
            </>
          ) : isPlaying ? (
            <Pause size={22} />
          ) : (
            <Play size={22} />
          )}
        </button>
        <button
          id="stop-btn"
          className="btn btn-secondary btn-lg"
          onClick={onStop}
          aria-label="Stop playback"
        >
          <Square size={22} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onSeekRelative(15)}
          aria-label="Skip forward 15 seconds"
          title="Skip forward 15 s"
        >
          <SkipForwardIcon seconds={15} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onSeekRelative(30)}
          aria-label="Skip forward 30 seconds"
          title="Skip forward 30 s"
        >
          <SkipForwardIcon seconds={30} />
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
