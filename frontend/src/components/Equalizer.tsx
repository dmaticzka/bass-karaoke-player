import { useRef, useEffect } from "react";
import { usePlayerStore } from "../store/playerStore";
import {
  applyEqBand,
  applyGlobalEqBand,
  getStemNodes,
} from "../audio/engine";
import { EQ_PRESETS } from "../types";
import type { EqBand, StemName } from "../types";

// Draw a rough frequency response curve on a canvas element.
function drawCurve(canvas: HTMLCanvasElement, bands: EqBand[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Frequency range: 20 Hz – 20 kHz, log scale
  const freqToX = (f: number) =>
    (Math.log10(f / 20) / Math.log10(20000 / 20)) * W;

  // Gain range: -14 to +14 dB → y (0 at centre)
  const gainToY = (g: number) => H / 2 - (g / 14) * (H / 2 - 4);

  ctx.strokeStyle = "#e94560";
  ctx.lineWidth = 2;
  ctx.beginPath();

  const steps = W;
  for (let i = 0; i <= steps; i++) {
    const f = 20 * Math.pow(10000, i / steps);
    let totalGain = 0;
    for (const band of bands) {
      // Simplified: apply gain as a Gaussian bump around the centre frequency
      const sigma = band.type === "peaking" ? 0.5 : 1.2;
      const dist = Math.log10(f) - Math.log10(band.freq);
      totalGain += band.gain * Math.exp(-(dist * dist) / (2 * sigma * sigma));
    }
    const x = freqToX(f);
    const y = gainToY(totalGain);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Zero line
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
}

export function Equalizer() {
  const activeSong = usePlayerStore((s) => s.activeSong);
  const eqMode = usePlayerStore((s) => s.eqMode);
  const activeStemForEq = usePlayerStore((s) => s.activeStemForEq);
  const globalEq = usePlayerStore((s) => s.globalEq);
  const stemEq = usePlayerStore((s) => s.stemEq);
  const setEqMode = usePlayerStore((s) => s.setEqMode);
  const setActiveStemForEq = usePlayerStore((s) => s.setActiveStemForEq);
  const setGlobalEqBand = usePlayerStore((s) => s.setGlobalEqBand);
  const setStemEqBand = usePlayerStore((s) => s.setStemEqBand);
  const applyEqPreset = usePlayerStore((s) => s.applyEqPreset);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stems = activeSong?.stems ?? [];

  // Which bands to display
  const displayBands: EqBand[] =
    eqMode === "global"
      ? globalEq
      : (stemEq[activeStemForEq ?? ""] ?? globalEq);

  // Redraw curve when bands change
  useEffect(() => {
    if (canvasRef.current) drawCurve(canvasRef.current, displayBands);
  }, [displayBands]);

  const handleBandChange = (bandIndex: number, gain: number) => {
    const stemNodes = getStemNodes();
    const loadedStems = Object.keys(stemNodes) as StemName[];

    if (eqMode === "global") {
      setGlobalEqBand(bandIndex, gain);
      applyGlobalEqBand(loadedStems, bandIndex, gain);
      // Also keep per-stem EQ in sync
      for (const stem of stems) {
        setStemEqBand(stem, bandIndex, gain);
      }
    } else {
      const target = activeStemForEq ?? "";
      setStemEqBand(target, bandIndex, gain);
      applyEqBand(target as StemName, bandIndex, gain);
    }
  };

  const handlePreset = (name: string) => {
    const bands = EQ_PRESETS[name];
    if (!bands) return;
    applyEqPreset(bands);
    // Apply to audio engine
    const stemNodes = getStemNodes();
    const loadedStems = Object.keys(stemNodes) as StemName[];
    for (let i = 0; i < bands.length; i++) {
      applyGlobalEqBand(loadedStems, i, bands[i]?.gain ?? 0);
    }
  };

  return (
    <section className="card" id="eq-section" aria-label="Equalizer">
      <h2>🎚 Equalizer</h2>

      {/* Frequency response curve */}
      <canvas
        ref={canvasRef}
        className="eq-curve"
        width={600}
        height={80}
        aria-hidden="true"
      />

      {/* Mode toggle */}
      <div className="eq-mode-row">
        <button
          className={`btn btn-sm ${eqMode === "global" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setEqMode("global")}
        >
          Global
        </button>
        <button
          className={`btn btn-sm ${eqMode === "per-stem" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setEqMode("per-stem")}
        >
          Per Stem
        </button>

        {eqMode === "per-stem" && stems.length > 0 && (
          <div className="eq-stem-tabs">
            {stems.map((stem) => (
              <button
                key={stem}
                className={`btn btn-sm ${activeStemForEq === stem ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveStemForEq(stem)}
              >
                {stem}
              </button>
            ))}
          </div>
        )}

        {/* Presets */}
        <select
          className="eq-preset-select"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) handlePreset(e.target.value);
            e.target.value = "";
          }}
          aria-label="EQ preset"
        >
          <option value="" disabled>
            Preset…
          </option>
          {Object.keys(EQ_PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Band sliders */}
      <div className="eq-bands">
        {displayBands.map((band, i) => (
          <div key={band.freq} className="eq-band">
            <output className="eq-gain-value">
              {band.gain > 0 ? "+" : ""}
              {band.gain} dB
            </output>
            <input
              type="range"
              className="eq-slider"
              min={-12}
              max={12}
              step={0.5}
              value={band.gain}
              aria-label={`${band.label} EQ`}
              onChange={(e) => handleBandChange(i, Number(e.target.value))}
            />
            <span className="eq-freq-label">{band.label}</span>
            <span className="eq-freq-hz">
              {band.freq >= 1000 ? `${band.freq / 1000}k` : band.freq} Hz
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
