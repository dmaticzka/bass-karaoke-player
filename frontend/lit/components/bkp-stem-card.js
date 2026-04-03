import { LitElement, html, css } from 'https://esm.sh/lit@3';

const STEM_COLORS = {
  drums: '#f97316',
  bass: '#3b82f6',
  vocals: '#a855f7',
  other: '#22c55e',
};

class BkpStemCard extends LitElement {
  static properties = {
    stem: { type: String },
    volume: { type: Number },
    muted: { type: Boolean },
  };

  static styles = css`
    :host { display: block; }
    .card {
      background: var(--c-bg, #0d0d1a);
      border-radius: 10px;
      padding: 1rem;
      border: 2px solid var(--c-border, #2a2a4a);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      transition: border-color 0.2s ease;
    }
    .card:hover { border-color: var(--stem-clr, #e94560); }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .label {
      font-weight: 700;
      font-size: 1.1rem;
      text-transform: capitalize;
      color: var(--stem-clr, #eaeaea);
    }
    .mute-btn {
      background: transparent;
      border: 1px solid var(--c-border, #2a2a4a);
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
      padding: 0.3rem 0.6rem;
      min-height: 44px;
      min-width: 44px;
      color: var(--c-text, #eaeaea);
      transition: opacity 0.2s ease;
    }
    .mute-btn:hover { opacity: 0.7; }
    .mute-btn.muted { opacity: 0.4; }
    .vol-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--c-muted, #888);
    }
    input[type='range'] {
      flex: 1;
      min-width: 0;
      accent-color: var(--stem-clr, #e94560);
      height: 6px;
      cursor: ew-resize;
      touch-action: none;
    }
    output {
      min-width: 2.75rem;
      text-align: right;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
      color: var(--c-text, #eaeaea);
    }
  `;

  constructor() {
    super();
    this.stem = '';
    this.volume = 1.0;
    this.muted = false;
  }

  _onVolume(e) {
    const volume = parseFloat(e.target.value) / 100;
    this.dispatchEvent(new CustomEvent('volume-change', {
      detail: { stem: this.stem, volume },
      bubbles: true, composed: true,
    }));
  }

  _onMute() {
    this.dispatchEvent(new CustomEvent('mute-toggle', {
      detail: { stem: this.stem },
      bubbles: true, composed: true,
    }));
  }

  render() {
    const color = STEM_COLORS[this.stem] ?? '#e94560';
    const volPct = Math.round(this.volume * 100);
    return html`
      <div class="card" style="--stem-clr:${color}">
        <div class="header">
          <span class="label">${this.stem}</span>
          <button class="mute-btn ${this.muted ? 'muted' : ''}"
                  @click=${this._onMute}
                  title="${this.muted ? 'Unmute' : 'Mute'}"
                  aria-label="${this.muted ? 'Unmute' : 'Mute'} ${this.stem}">
            ${this.muted ? '🔇' : '🔊'}
          </button>
        </div>
        <div class="vol-row">
          <span>Vol</span>
          <input type="range" min="0" max="200" step="1" .value=${String(volPct)}
                 @input=${this._onVolume}
                 aria-label="Volume for ${this.stem}" />
          <output>${volPct}%</output>
        </div>
      </div>
    `;
  }
}

customElements.define('bkp-stem-card', BkpStemCard);
