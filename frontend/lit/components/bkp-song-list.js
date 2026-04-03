import { LitElement, html, css } from 'https://esm.sh/lit@3';

class BkpSongList extends LitElement {
  static properties = {
    songs:          { type: Array  },
    activeSongId:   { type: String },
    loadedSongIds:  { type: Array  },
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
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .refresh-btn {
      background: var(--c-accent2, #0f3460);
      color: var(--c-text, #eaeaea);
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.7rem;
      cursor: pointer;
      font-size: 0.95rem;
      min-height: 44px;
      min-width: 44px;
      transition: opacity 0.2s ease;
    }
    .refresh-btn:hover { opacity: 0.8; }
    ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .empty {
      color: var(--c-muted, #888);
      font-style: italic;
      padding: 0.5rem 0;
    }
    .song-item {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      background: var(--c-bg, #0d0d1a);
      border: 1px solid var(--c-border, #2a2a4a);
      gap: 0.5rem 0.75rem;
      transition: border-color 0.2s ease;
    }
    .song-item:hover { border-color: var(--c-accent, #e94560); }
    .song-item.active {
      border-color: var(--c-accent, #e94560);
      background: rgba(233, 69, 96, 0.08);
    }
    .song-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
      color: var(--c-text, #eaeaea);
    }
    .badge {
      font-size: 0.8rem;
      padding: 0.2rem 0.6rem;
      border-radius: 20px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .badge-uploaded  { background: #555;    color: #ccc;    }
    .badge-splitting { background: #854d0e; color: #fef9c3; }
    .badge-ready     { background: #166534; color: #dcfce7; }
    .badge-error     { background: #7f1d1d; color: #fee2e2; }
    .actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
    .btn-load {
      background: var(--c-accent, #e94560);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.75rem;
      min-height: 44px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .btn-load:hover { opacity: 0.85; transform: translateY(-1px); }
    .btn-del {
      background: transparent;
      border: 1px solid var(--c-border, #2a2a4a);
      border-radius: 6px;
      color: var(--c-text, #eaeaea);
      padding: 0.35rem 0.65rem;
      min-height: 44px;
      min-width: 44px;
      cursor: pointer;
      font-size: 1rem;
      transition: border-color 0.2s ease, color 0.2s ease;
    }
    .btn-del:hover { border-color: var(--c-accent, #e94560); color: var(--c-accent, #e94560); }
  `;

  constructor() {
    super();
    this.songs = [];
    this.activeSongId = null;
    this.loadedSongIds = [];
  }

  _statusLabel(status) {
    return { uploaded: 'Uploaded', splitting: 'Splitting…', ready: 'Ready', error: 'Error' }[status] ?? status;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="card">
        <h2>
          Songs
          <button class="refresh-btn" @click=${() => this._emit('refresh')} title="Refresh song list">↻</button>
        </h2>
        <ul>
          ${this.songs.length === 0
            ? html`<li class="empty">No songs uploaded yet.</li>`
            : this.songs.map(song => {
                const isActive = song.id === this.activeSongId;
                const isLoaded = (this.loadedSongIds ?? []).includes(song.id) && !isActive;
                return html`
                  <li class="song-item ${isActive ? 'active' : ''}">
                    <span class="song-name" title="${song.filename}">
                      ${isLoaded ? '🎵 ' : ''}${song.filename}
                    </span>
                    <span class="badge badge-${song.status}">${this._statusLabel(song.status)}</span>
                    <div class="actions">
                      ${song.status === 'ready' ? html`
                        <button class="btn-load" @click=${() => this._emit('song-load', { song })}>
                          ${isLoaded ? 'Switch To' : 'Load'}
                        </button>
                      ` : ''}
                      <button class="btn-del" @click=${() => this._emit('song-delete', { songId: song.id })}
                              title="Delete song">🗑</button>
                    </div>
                  </li>
                `;
              })
          }
        </ul>
      </div>
    `;
  }
}

customElements.define('bkp-song-list', BkpSongList);
