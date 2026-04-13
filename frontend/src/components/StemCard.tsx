import type { StemName } from "../types";
import { STEM_COLORS } from "../types";

interface Props {
  stem: StemName;
  volume: number; // 0–2
  muted: boolean;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
}

export function StemCard({ stem, volume, muted, onVolumeChange, onMuteToggle }: Props) {
  const color = STEM_COLORS[stem];
  const pct = Math.round(volume * 100);

  return (
    <div
      className="stem-card"
      data-testid={`stem-card-${stem}`}
      style={{ borderColor: muted ? undefined : color }}
    >
      <div className="stem-header">
        <span className="stem-label" style={{ color }}>
          {stem}
        </span>
        <button
          className={`btn btn-sm btn-icon stem-mute-btn${muted ? " muted" : ""}`}
          data-stem={stem}
          title={muted ? "Unmute" : "Mute"}
          onClick={onMuteToggle}
          aria-label={muted ? `Unmute ${stem}` : `Mute ${stem}`}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      <div className="stem-volume-row">
        <span className="vol-label">Vol</span>
        <input
          type="range"
          className="stem-vol-slider"
          data-stem={stem}
          min={0}
          max={200}
          step={1}
          value={pct}
          style={{ accentColor: color }}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          aria-label={`${stem} volume`}
        />
        <output className="stem-vol-output" data-stem={stem}>
          {pct}%
        </output>
      </div>
    </div>
  );
}
