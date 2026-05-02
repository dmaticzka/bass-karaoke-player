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
  onLoopClearA: () => void;
  onLoopClearB: () => void;
  onLoopSetAValue: (val: number) => void;
  onLoopSetBValue: (val: number) => void;
  onLoopAdjustA: (delta: number) => void;
  onLoopAdjustB: (delta: number) => void;
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

const AB_ADJUST_STEPS = [-10, -5, -1, 1, 5, 10] as const;

export function PlaybackBar({
  onPlayPause,
  onStop,
  onSeek,
  onSeekRelative,
  onLoopToggle,
  onLoopSetA,
  onLoopSetB,
  onLoopClear,
  onLoopClearA,
  onLoopClearB,
  onLoopSetAValue,
  onLoopSetBValue,
  onLoopAdjustA,
  onLoopAdjustB,
}: Props) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const duration = usePlayerStore((s) => s.duration);
  const startOffset = usePlayerStore((s) => s.startOffset);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopStart = usePlayerStore((s) => s.loopStart);
  const loopEnd = usePlayerStore((s) => s.loopEnd);

  const pos = Math.min(startOffset, duration || startOffset);

  // Effective A/B values for display and slider positioning
  const effectiveA = loopStart ?? 0;
  const effectiveB = loopEnd ?? duration;

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
          title="Set loop start to current position"
          disabled={!loopEnabled}
          onClick={onLoopSetA}
        >
          Set A
        </button>
        <button
          id="loop-clear-a-btn"
          className="btn btn-sm btn-secondary"
          title="Reset loop start to beginning"
          disabled={!loopEnabled}
          onClick={onLoopClearA}
        >
          Clear A
        </button>
        <button
          id="loop-b-btn"
          className="btn btn-sm btn-secondary"
          title="Set loop end to current position"
          disabled={!loopEnabled}
          onClick={onLoopSetB}
        >
          Set B
        </button>
        <button
          id="loop-clear-b-btn"
          className="btn btn-sm btn-secondary"
          title="Reset loop end to song end"
          disabled={!loopEnabled}
          onClick={onLoopClearB}
        >
          Clear B
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

      {/* A point slider row */}
      <div className="ab-point-row" id="loop-a-row">
        <span className="ab-point-label">A</span>
        {AB_ADJUST_STEPS.filter((s) => s < 0).map((delta) => (
          <button
            key={delta}
            className="btn btn-xs btn-secondary ab-adjust-btn"
            title={`Move A point ${delta}s`}
            aria-label={`Move A point ${delta} seconds`}
            disabled={!loopEnabled}
            onClick={() => onLoopAdjustA(delta)}
          >
            {delta}s
          </button>
        ))}
        <input
          id="loop-a-slider"
          type="range"
          className="ab-point-slider"
          min={0}
          max={duration || 100}
          step={0.1}
          value={effectiveA}
          disabled={!loopEnabled}
          onChange={(e) => onLoopSetAValue(Number(e.target.value))}
          aria-label="Loop start (A point)"
        />
        <span className="ab-point-time">{fmtTime(effectiveA)}</span>
        {AB_ADJUST_STEPS.filter((s) => s > 0).map((delta) => (
          <button
            key={delta}
            className="btn btn-xs btn-secondary ab-adjust-btn"
            title={`Move A point +${delta}s`}
            aria-label={`Move A point +${delta} seconds`}
            disabled={!loopEnabled}
            onClick={() => onLoopAdjustA(delta)}
          >
            +{delta}s
          </button>
        ))}
      </div>

      {/* B point slider row */}
      <div className="ab-point-row" id="loop-b-row">
        <span className="ab-point-label">B</span>
        {AB_ADJUST_STEPS.filter((s) => s < 0).map((delta) => (
          <button
            key={delta}
            className="btn btn-xs btn-secondary ab-adjust-btn"
            title={`Move B point ${delta}s`}
            aria-label={`Move B point ${delta} seconds`}
            disabled={!loopEnabled}
            onClick={() => onLoopAdjustB(delta)}
          >
            {delta}s
          </button>
        ))}
        <input
          id="loop-b-slider"
          type="range"
          className="ab-point-slider"
          min={0}
          max={duration || 100}
          step={0.1}
          value={effectiveB}
          disabled={!loopEnabled}
          onChange={(e) => onLoopSetBValue(Number(e.target.value))}
          aria-label="Loop end (B point)"
        />
        <span className="ab-point-time">{fmtTime(effectiveB)}</span>
        {AB_ADJUST_STEPS.filter((s) => s > 0).map((delta) => (
          <button
            key={delta}
            className="btn btn-xs btn-secondary ab-adjust-btn"
            title={`Move B point +${delta}s`}
            aria-label={`Move B point +${delta} seconds`}
            disabled={!loopEnabled}
            onClick={() => onLoopAdjustB(delta)}
          >
            +{delta}s
          </button>
        ))}
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
