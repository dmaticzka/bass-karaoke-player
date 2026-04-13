import { usePlayerStore } from "../store/playerStore";

interface Props {
  onApply: () => Promise<void>;
  onReset: () => Promise<void>;
  onCache: () => Promise<void>;
}

export function GlobalControls({ onApply, onReset, onCache }: Props) {
  const pitch = usePlayerStore((s) => s.pitch);
  const tempo = usePlayerStore((s) => s.tempo);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const activeSong = usePlayerStore((s) => s.activeSong);
  const setPitch = usePlayerStore((s) => s.setPitch);
  const setTempo = usePlayerStore((s) => s.setTempo);

  const disabled = !activeSong || isLoading;

  return (
    <div className="global-controls">
      <div className="control-group">
        <label htmlFor="pitch-slider">Pitch (semitones)</label>
        <div className="slider-row">
          <input
            id="pitch-slider"
            type="range"
            min={-12}
            max={12}
            step={1}
            value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))}
            aria-label="Pitch in semitones"
          />
          <output id="pitch-value">{pitch}</output>
        </div>
      </div>

      <div className="control-group">
        <label htmlFor="tempo-slider">Tempo (%)</label>
        <div className="slider-row">
          <input
            id="tempo-slider"
            type="range"
            min={25}
            max={200}
            step={1}
            value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
            aria-label="Tempo percentage"
          />
          <output id="tempo-value">{tempo}%</output>
        </div>
      </div>

      <div className="control-group control-group--actions">
        <button
          id="apply-btn"
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => void onApply()}
        >
          Apply
        </button>
        <button
          id="cache-btn"
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => void onCache()}
        >
          Cache Version
        </button>
        <button
          id="reset-btn"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => void onReset()}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
