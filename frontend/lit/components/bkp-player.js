import { LitElement, html, css } from 'https://esm.sh/lit@3';
import './bkp-stem-card.js';

function fmtTime(secs) {
  if (!isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function fmtRelTime(isoStr) {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

class BkpPlayer extends LitElement {
  static properties = {
    song:          { type: Object  },
    isPlaying:     { type: Boolean },
    isLoading:     { type: Boolean },
    pitch:         { type: Number  },
    tempo:         { type: Number  },
    versions:      { type: Array   },
    activeVersion: { type: Object  },
    stemVolumes:   { type: Object  },
    stemMuted:     { type: Object  },
    loopEnabled:   { type: Boolean },
    loopStart:     { type: Number  },
    loopEnd:       { type: Number  },
    duration:      { type: Number  },
    currentTime:   { type: Number  },
    serverConfig:  { type: Object  },
  };

  static styles = css`
    :host { display: block; }
    .card {
      background: var(--c-surface, #16213e);
      border-radius: 10px;
      padding: 1.5rem;
      border: 1px solid var(--c-border, #2a2a4a);
    }
    h2 {
      font-size: 1.25rem;
      color: var(--c-accent, #e94560);
      margin-bottom: 1rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty-msg {
      color: var(--c-muted, #888);
      font-style: italic;
      text-align: center;
      padding: 2rem 0;
    }

    /* ---- Shared button styles ---- */
    .btn-primary {
      background: var(--c-accent, #e94560);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.625rem 1.4rem;
      min-height: 44px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .btn-primary:not(:disabled):hover { opacity: 0.85; transform: translateY(-1px); }
    .btn-primary:not(:disabled):active { opacity: 1; transform: none; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary.active-btn {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .btn-secondary {
      background: var(--c-accent2, #0f3460);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.625rem 1.4rem;
      min-height: 44px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .btn-secondary:not(:disabled):hover { opacity: 0.85; transform: translateY(-1px); }
    .btn-secondary:not(:disabled):active { opacity: 1; transform: none; }
    .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-sm {
      padding: 0.4rem 0.8rem;
      font-size: 0.9rem;
      min-height: 44px;
      min-width: 44px;
      border-radius: 6px;
    }
    .btn-lg { padding: 0.875rem 2rem; font-size: 1.1rem; flex: 1; }

    /* ---- Global controls ---- */
    .controls {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--c-border, #2a2a4a);
    }
    .ctrl-group { display: flex; flex-direction: column; gap: 0.4rem; }
    .ctrl-group label { font-size: 0.9rem; color: var(--c-muted, #888); font-weight: 600; }
    .slider-row { display: flex; align-items: center; gap: 0.6rem; }
    .slider-row input[type='range'] {
      flex: 1;
      min-width: 0;
      accent-color: var(--c-accent, #e94560);
      height: 6px;
      cursor: ew-resize;
      touch-action: none;
    }
    .slider-row output {
      min-width: 3.5rem;
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-size: 0.95rem;
      flex-shrink: 0;
      color: var(--c-text, #eaeaea);
    }
    .action-btns { display: flex; gap: 0.75rem; flex-wrap: wrap; }

    @media (min-width: 600px) {
      .controls {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 0.75rem 1.25rem;
      }
      .ctrl-group { flex: 1; min-width: 140px; }
      .ctrl-group--actions { flex: 0 0 auto; margin-top: 0; align-items: flex-end; }
    }

    /* ---- Versions ---- */
    .versions-section {
      margin-bottom: 1.25rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--c-border, #2a2a4a);
    }
    .section-title {
      font-size: 0.85rem;
      color: var(--c-muted, #888);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.6rem;
    }
    .versions-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .versions-list.loading { pointer-events: none; opacity: 0.6; }
    .ver-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.7rem;
      border-radius: 20px;
      border: 1px solid var(--c-border, #2a2a4a);
      background: var(--c-bg, #0d0d1a);
      font-size: 0.85rem;
      cursor: pointer;
      transition: border-color 0.2s ease, background 0.2s ease;
      white-space: nowrap;
      color: var(--c-text, #eaeaea);
    }
    .ver-item:hover { border-color: var(--c-accent, #e94560); }
    .ver-item.active-ver {
      border-color: var(--c-accent, #e94560);
      background: rgba(233, 69, 96, 0.12);
      font-weight: 600;
    }
    .ver-item.default-ver { border-style: dashed; }
    .ver-del-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--c-muted, #888);
      font-size: 0.8rem;
      padding: 0 0.15rem;
      line-height: 1;
      transition: color 0.2s ease;
    }
    .ver-del-btn:hover { color: var(--c-accent, #e94560); }
    .ver-badge {
      font-size: 0.75rem;
      padding: 0.1rem 0.4rem;
      border-radius: 10px;
      font-weight: 600;
    }
    .ver-badge-processing { background: #854d0e; color: #fef9c3; }
    .ver-badge-partial    { background: #713f12; color: #fef9c3; }
    .ver-time { font-size: 0.72rem; color: var(--c-muted, #888); }

    /* ---- Stems grid ---- */
    .stems-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 600px) {
      .stems-grid { grid-template-columns: repeat(4, 1fr); }
    }
    .stems-grid.loading {
      pointer-events: none;
      animation: stem-pulse 1.2s ease-in-out infinite;
    }
    @keyframes stem-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ---- Playback ---- */
    .playback {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .pb-btns { display: flex; gap: 0.75rem; }
    .seek-row { display: flex; align-items: center; gap: 0.75rem; }
    .seek-row input[type='range'] {
      flex: 1;
      accent-color: var(--c-accent, #e94560);
      height: 6px;
      cursor: ew-resize;
      touch-action: none;
    }
    .time-disp {
      font-size: 0.9rem;
      color: var(--c-muted, #888);
      white-space: nowrap;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    /* ---- A-B loop ---- */
    .loop-controls {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }
    .loop-display {
      font-size: 0.85rem;
      color: var(--c-accent, #e94560);
      font-variant-numeric: tabular-nums;
    }

    /* ---- Cache stats ---- */
    .cache-stats {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-top: 0.75rem;
      font-size: 0.8rem;
      color: var(--c-muted, #888);
    }
    .stats-bar {
      flex: 1;
      height: 4px;
      background: var(--c-border, #2a2a4a);
      border-radius: 2px;
      overflow: hidden;
    }
    .stats-fill {
      height: 100%;
      background: var(--c-accent2, #0f3460);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .stats-fill.full { background: var(--c-accent, #e94560); }

    @media (min-width: 600px) {
      .playback {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
      }
      .pb-btns { flex: 0 0 auto; }
      .seek-row { flex: 1; min-width: 200px; }
    }
  `;

  constructor() {
    super();
    this.song = null;
    this.isPlaying = false;
    this.isLoading = false;
    this.pitch = 0;
    this.tempo = 100;
    this.versions = [];
    this.activeVersion = { pitch: 0, tempo: 1.0 };
    this.stemVolumes = {};
    this.stemMuted = {};
    this.loopEnabled = false;
    this.loopStart = null;
    this.loopEnd = null;
    this.duration = 0;
    this.currentTime = 0;
    this.serverConfig = { max_versions_per_song: 5, max_versions_global: 50 };
  }

  _emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  _onSeek(e) {
    this._emit('seek', { time: parseFloat(e.target.value) });
  }

  _renderVersions() {
    const vers = this.versions ?? [];
    let readyCount = 0;
    const items = vers.map(ver => {
      if (!ver.is_default) readyCount++;
      const pitchStr = ver.pitch_semitones > 0 ? `+${ver.pitch_semitones}` : String(ver.pitch_semitones);
      const tempoStr = `${Math.round(ver.tempo_ratio * 100)}%`;
      const label = ver.is_default ? `Original (${tempoStr})` : `${pitchStr} st, ${tempoStr}`;
      const isActive = this.activeVersion?.pitch === ver.pitch_semitones &&
                       this.activeVersion?.tempo === ver.tempo_ratio;
      const clickable = ver.status !== 'processing';
      return html`
        <li class="ver-item
                   ${ver.is_default ? 'default-ver' : ''}
                   ${isActive ? 'active-ver' : ''}"
            title="Pitch: ${pitchStr} semitones, Tempo: ${tempoStr}"
            @click=${clickable ? () => this._emit('version-select', { pitch: ver.pitch_semitones, tempo: ver.tempo_ratio }) : null}>
          <span>${label}</span>
          ${!ver.is_default && ver.status === 'processing' ? html`
            <span class="ver-badge ver-badge-processing">⏳</span>
          ` : ''}
          ${!ver.is_default && ver.status === 'partial' ? html`
            <span class="ver-badge ver-badge-partial">partial</span>
          ` : ''}
          ${!ver.is_default && ver.accessed_at ? html`
            <span class="ver-time">${fmtRelTime(ver.accessed_at)}</span>
          ` : ''}
          ${!ver.is_default && ver.status !== 'processing' ? html`
            <button class="ver-del-btn"
                    title="Delete this version"
                    @click=${(e) => { e.stopPropagation(); this._emit('version-delete', { pitch: ver.pitch_semitones, tempo: ver.tempo_ratio }); }}>
              ✕
            </button>
          ` : ''}
        </li>
      `;
    });
    const maxV = this.serverConfig?.max_versions_per_song ?? 5;
    const pct = Math.min(100, (readyCount / maxV) * 100);
    const full = readyCount >= maxV;
    return { items, readyCount, maxV, pct, full };
  }

  render() {
    if (!this.song) {
      return html`
        <div class="card">
          <h2>Player</h2>
          <p class="empty-msg">Select a song from the library to start playing.</p>
        </div>
      `;
    }

    const stems = this.song.stems ?? [];
    const { items: verItems, readyCount, maxV, pct, full } = this._renderVersions();
    const hasLoop = this.loopEnabled;
    const showLoopDisplay = hasLoop && this.loopStart !== null && this.loopEnd !== null;

    return html`
      <div class="card">
        <h2>🎵 ${this.song.filename}</h2>

        <!-- Global controls: pitch, tempo, action buttons -->
        <div class="controls">
          <div class="ctrl-group">
            <label for="pitch-range">Pitch (semitones)</label>
            <div class="slider-row">
              <input id="pitch-range" type="range" min="-12" max="12" step="1"
                     .value=${String(this.pitch)}
                     @input=${(e) => this._emit('pitch-input', { value: parseInt(e.target.value, 10) })}
                     aria-label="Pitch adjustment in semitones" />
              <output>${this.pitch > 0 ? '+' : ''}${this.pitch}</output>
            </div>
          </div>

          <div class="ctrl-group">
            <label for="tempo-range">Tempo (%)</label>
            <div class="slider-row">
              <input id="tempo-range" type="range" min="25" max="200" step="5"
                     .value=${String(this.tempo)}
                     @input=${(e) => this._emit('tempo-input', { value: parseInt(e.target.value, 10) })}
                     aria-label="Tempo percentage" />
              <output>${this.tempo}%</output>
            </div>
          </div>

          <div class="ctrl-group ctrl-group--actions action-btns">
            <button class="btn-primary btn-sm"
                    ?disabled=${this.isLoading}
                    @click=${() => this._emit('apply')}>
              ${this.isLoading ? '⏳ Processing…' : 'Apply'}
            </button>
            <button class="btn-primary btn-sm"
                    ?disabled=${this.isLoading}
                    @click=${() => this._emit('cache')}>Cache Version</button>
            <button class="btn-secondary btn-sm"
                    ?disabled=${this.isLoading}
                    @click=${() => this._emit('reset')}>Reset</button>
          </div>
        </div>

        <!-- Versions -->
        <div class="versions-section">
          <div class="section-title">Versions</div>
          <ul class="versions-list ${this.isLoading ? 'loading' : ''}">${verItems}</ul>
          <div class="cache-stats">
            <span>Versions: ${readyCount} / ${maxV}</span>
            <div class="stats-bar">
              <div class="stats-fill ${full ? 'full' : ''}" style="width:${pct}%"></div>
            </div>
          </div>
        </div>

        <!-- Stem cards -->
        <div class="stems-grid ${this.isLoading ? 'loading' : ''}">
          ${stems.map(stem => html`
            <bkp-stem-card
              stem=${stem}
              .volume=${this.stemVolumes?.[stem] ?? 1.0}
              .muted=${this.stemMuted?.[stem] ?? false}
              @volume-change=${(e) => this._emit('volume-change', e.detail)}
              @mute-toggle=${(e) => this._emit('mute-toggle', e.detail)}>
            </bkp-stem-card>
          `)}
        </div>

        <!-- Playback controls -->
        <div class="playback">
          <div class="pb-btns">
            <button class="btn-primary btn-lg"
                    ?disabled=${this.isLoading}
                    @click=${() => this._emit('play-pause')}
                    aria-label="${this.isPlaying ? 'Pause' : 'Play'}">
              ${this.isLoading ? '⏳ Loading…' : this.isPlaying ? '⏸ Pause' : '▶ Play All'}
            </button>
            <button class="btn-secondary btn-lg"
                    @click=${() => this._emit('stop')}
                    aria-label="Stop playback">■ Stop</button>
          </div>

          <div class="seek-row">
            <input type="range" min="0" .max=${String(this.duration || 100)}
                   step="0.1" .value=${String(this.currentTime)}
                   @input=${this._onSeek}
                   aria-label="Seek" />
            <span class="time-disp">${fmtTime(this.currentTime)} / ${fmtTime(this.duration)}</span>
          </div>
        </div>

        <!-- A-B loop -->
        <div class="loop-controls">
          <button class="${hasLoop ? 'btn-primary' : 'btn-secondary'} btn-sm"
                  @click=${() => this._emit('loop-toggle')}
                  title="Toggle A-B loop">⟳ A↔B</button>
          <button class="btn-secondary btn-sm" ?disabled=${!hasLoop}
                  @click=${() => this._emit('loop-set-a')} title="Set loop start">Set A</button>
          <button class="btn-secondary btn-sm" ?disabled=${!hasLoop}
                  @click=${() => this._emit('loop-set-b')} title="Set loop end">Set B</button>
          <button class="btn-secondary btn-sm" ?disabled=${!hasLoop}
                  @click=${() => this._emit('loop-clear')} title="Clear loop">Clear</button>
          ${showLoopDisplay ? html`
            <span class="loop-display">
              A: ${fmtTime(this.loopStart)} – B: ${fmtTime(this.loopEnd)}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('bkp-player', BkpPlayer);
