import { LitElement, html, css } from 'https://esm.sh/lit@3';

export const EQ_BANDS = [
  { freq: 60,    label: '60 Hz',  type: 'lowshelf' },
  { freq: 250,   label: '250 Hz', type: 'peaking'  },
  { freq: 1000,  label: '1 kHz',  type: 'peaking'  },
  { freq: 4000,  label: '4 kHz',  type: 'peaking'  },
  { freq: 16000, label: '16 kHz', type: 'highshelf' },
];

class BkpEqualizer extends LitElement {
  static properties = {
    gains: { type: Array },
  };

  static styles = css`
    :host { display: block; }
    .card {
      background: var(--c-surface, #16213e);
      border-radius: 10px;
      padding: 1.5rem;
      border: 1px solid var(--c-border, #2a2a4a);
    }
    h3 {
      font-size: 1rem;
      color: var(--c-muted, #888);
      font-weight: 600;
      margin-bottom: 1.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .bands {
      display: flex;
      gap: 0.5rem;
      justify-content: space-around;
      align-items: flex-end;
    }
    .band {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      max-width: 64px;
    }
    .gain-val {
      font-size: 0.78rem;
      font-variant-numeric: tabular-nums;
      color: var(--c-accent, #e94560);
      min-height: 1.2em;
      text-align: center;
      white-space: nowrap;
    }
    input[type='range'] {
      writing-mode: vertical-lr;
      width: 36px;
      height: 130px;
      cursor: ns-resize;
      accent-color: var(--c-accent, #e94560);
      touch-action: none;
    }
    .freq-label {
      font-size: 0.75rem;
      color: var(--c-muted, #888);
      text-align: center;
    }
    .reset-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }
    .reset-btn {
      background: var(--c-accent2, #0f3460);
      color: var(--c-text, #eaeaea);
      border: none;
      border-radius: 6px;
      padding: 0.4rem 1rem;
      min-height: 44px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: opacity 0.2s ease;
    }
    .reset-btn:hover { opacity: 0.8; }
  `;

  constructor() {
    super();
    this.gains = [0, 0, 0, 0, 0];
  }

  _onChange(i, e) {
    const gain = parseFloat(e.target.value);
    this.dispatchEvent(new CustomEvent('eq-change', {
      detail: { band: i, gain },
      bubbles: true, composed: true,
    }));
  }

  _onReset() {
    this.dispatchEvent(new CustomEvent('eq-reset', { bubbles: true, composed: true }));
  }

  render() {
    const gains = this.gains ?? [0, 0, 0, 0, 0];
    return html`
      <div class="card">
        <h3>🎛️ 5-Band Equalizer</h3>
        <div class="bands">
          ${EQ_BANDS.map((band, i) => {
            const g = gains[i] ?? 0;
            const sign = g > 0 ? '+' : '';
            return html`
              <div class="band">
                <div class="gain-val">${sign}${g.toFixed(1)} dB</div>
                <input type="range" min="-15" max="15" step="0.5"
                       .value=${String(g)}
                       @input=${(e) => this._onChange(i, e)}
                       aria-label="${band.label} EQ gain"
                       aria-valuemin="-15" aria-valuemax="15"
                       aria-valuenow="${g}" />
                <div class="freq-label">${band.label}</div>
              </div>
            `;
          })}
        </div>
        <div class="reset-row">
          <button class="reset-btn" @click=${this._onReset}>Reset EQ</button>
        </div>
      </div>
    `;
  }
}

customElements.define('bkp-equalizer', BkpEqualizer);
