import { useState } from "react";
import { usePlayerStore } from "../store/playerStore";

interface Props {
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
  onLoopShift: () => void;
  onAddCurrentToHistory: () => void;
  onRemoveCurrentInterval: () => void;
  onRestoreHistoryItem: (index: number) => void;
  onRemoveHistoryItem: (index: number) => void;
  onClearLoopHistory: () => void;
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

export function LoopSection({
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
  onLoopShift,
  onAddCurrentToHistory,
  onRemoveCurrentInterval,
  onRestoreHistoryItem,
  onRemoveHistoryItem,
  onClearLoopHistory,
}: Props) {
  const duration = usePlayerStore((s) => s.duration);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopStart = usePlayerStore((s) => s.loopStart);
  const loopEnd = usePlayerStore((s) => s.loopEnd);
  const loopHistory = usePlayerStore((s) => s.loopHistory);

  const effectiveA = loopStart ?? 0;
  const effectiveB = loopEnd ?? duration;

  const [loopCollapsed, setLoopCollapsed] = useState(false);

  return (
    <div className="loop-section">
      <div
        className="collapsible-header"
        onClick={() => setLoopCollapsed(!loopCollapsed)}
      >
        <h3 className="sub-section-heading">AB Loop</h3>
        <button
          className="collapsible-toggle"
          aria-label={loopCollapsed ? "Expand AB loop" : "Collapse AB loop"}
        >
          <span className={`chevron${loopCollapsed ? " collapsed" : ""}`}>▼</span>
        </button>
      </div>
      <div className={`collapsible-body ${loopCollapsed ? "collapsed" : "expanded"}`}>
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
          <button
            id="loop-shift-btn"
            className="btn btn-sm btn-secondary"
            title="Shift loop: A←B, B←song end"
            aria-label="Shift loop: A to old B, B to song end"
            disabled={!loopEnabled}
            onClick={onLoopShift}
          >
            A&lt;B&lt;Ω
          </button>
        </div>

        {/* A point slider row */}
        <div className="ab-point-row" id="loop-a-row">
          <span className="ab-point-label">A: {fmtTime(effectiveA)}</span>
          <div className="ab-adjust-neg">
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
          </div>
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
          <div className="ab-adjust-pos">
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
        </div>

        {/* B point slider row */}
        <div className="ab-point-row" id="loop-b-row">
          <span className="ab-point-label">B: {fmtTime(effectiveB)}</span>
          <div className="ab-adjust-neg">
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
          </div>
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
          <div className="ab-adjust-pos">
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
        </div>

        {/* Loop interval history */}
        <div className="loop-history" id="loop-history">
          <div className="loop-history-header">
            <span className="loop-history-title">Loop Intervals</span>
            <div className="loop-history-header-actions">
              <button
                className="btn btn-xs btn-secondary"
                id="loop-history-add-btn"
                title="Add current interval to history"
                onClick={onAddCurrentToHistory}
              >
                Add
              </button>
              <button
                className="btn btn-xs btn-secondary"
                id="loop-history-clear-btn"
                title="Clear all saved intervals"
                disabled={loopHistory.length === 0}
                onClick={onClearLoopHistory}
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Current interval */}
          <div className="loop-history-item current" id="loop-history-current">
            <span className="loop-history-label">Now</span>
            <span className="loop-history-range">
              {loopStart !== null ? fmtTime(loopStart) : "—"}
              {" \u2013 "}
              {loopEnd !== null ? fmtTime(loopEnd) : "—"}
            </span>
            <button
              className="loop-history-remove"
              aria-label="Remove current interval"
              title="Remove current interval"
              onClick={onRemoveCurrentInterval}
            >
              &times;
            </button>
          </div>

          {/* Archived intervals */}
          {loopHistory.map((item, i) => (
            <div
              key={i}
              className="loop-history-item"
              id={`loop-history-item-${i}`}
              onClick={() => onRestoreHistoryItem(i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onRestoreHistoryItem(i); }}
              aria-label={`Restore interval ${i + 1}`}
            >
              <span className="loop-history-label">#{i + 1}</span>
              <button
                className="loop-history-restore"
                aria-hidden="true"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onRestoreHistoryItem(i); }}
              >
                {item.a !== null ? fmtTime(item.a) : "—"}
                {" \u2013 "}
                {item.b !== null ? fmtTime(item.b) : "—"}
              </button>
              <button
                className="loop-history-remove"
                aria-label={`Remove interval ${i + 1}`}
                title={`Remove interval ${i + 1}`}
                onClick={(e) => { e.stopPropagation(); onRemoveHistoryItem(i); }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
