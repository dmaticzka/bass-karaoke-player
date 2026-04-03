import { LitElement, html, css } from 'https://esm.sh/lit@3';

const API_BASE = '/api';

class BkpUpload extends LitElement {
  static properties = {
    _progress:  { type: Number,  state: true },
    _status:    { type: String,  state: true },
    _uploading: { type: Boolean, state: true },
    _dragOver:  { type: Boolean, state: true },
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
    }
    .drop-zone {
      border: 2px dashed var(--c-border, #2a2a4a);
      border-radius: 10px;
      padding: 2rem 1rem;
      text-align: center;
      transition: border-color 0.2s ease, background 0.2s ease;
      cursor: pointer;
    }
    .drop-zone.drag-over {
      border-color: var(--c-accent, #e94560);
      background: rgba(233, 69, 96, 0.07);
    }
    .drop-zone p {
      color: var(--c-muted, #888);
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
    }
    .browse-btn {
      background: var(--c-accent, #e94560);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.625rem 1.4rem;
      min-height: 44px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 0.75rem;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .browse-btn:hover { opacity: 0.85; transform: translateY(-1px); }
    .progress-row {
      margin-top: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    progress {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      accent-color: var(--c-accent, #e94560);
    }
    .pct {
      font-size: 0.85rem;
      color: var(--c-muted, #888);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .status {
      font-size: 0.9rem;
      color: var(--c-muted, #888);
      margin-top: 0.6rem;
    }
  `;

  constructor() {
    super();
    this._progress = 0;
    this._status = '';
    this._uploading = false;
    this._dragOver = false;
  }

  _fileInput() {
    return this.shadowRoot.querySelector('#file-input');
  }

  _onDrop(e) {
    e.preventDefault();
    this._dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this._upload(file);
  }

  _onDragOver(e) { e.preventDefault(); this._dragOver = true; }
  _onDragLeave() { this._dragOver = false; }

  _onZoneClick() { this._fileInput().click(); }
  _onBrowse(e) { e.stopPropagation(); this._fileInput().click(); }

  _onFileChange(e) {
    const file = e.target.files?.[0];
    if (file) this._upload(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  async _upload(file) {
    this._uploading = true;
    this._progress = 0;
    this._status = `Uploading ${file.name}…`;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const song = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/songs`);
        xhr.upload.addEventListener('progress', (ev) => {
          if (ev.lengthComputable) this._progress = Math.round((ev.loaded / ev.total) * 100);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status === 201) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(`Upload failed: ${xhr.status} – ${xhr.responseText}`));
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(formData);
      });
      this._status = `✅ Uploaded! Splitting stems for "${song.filename}"…`;
      this.dispatchEvent(new CustomEvent('upload-started', {
        detail: { songId: song.id },
        bubbles: true, composed: true,
      }));
    } catch (e) {
      this._status = `❌ ${e.message}`;
    } finally {
      this._uploading = false;
    }
  }

  render() {
    return html`
      <div class="card">
        <h2>Upload Song</h2>
        <div class="drop-zone ${this._dragOver ? 'drag-over' : ''}"
             @click=${this._onZoneClick}
             @dragover=${this._onDragOver}
             @dragleave=${this._onDragLeave}
             @drop=${this._onDrop}>
          <p>Drag &amp; drop an audio file here, or click to select</p>
          <p>Supported: MP3, WAV, FLAC, OGG, M4A, AAC · Max 300 MB</p>
          <input id="file-input" type="file"
                 accept=".mp3,.wav,.flac,.ogg,.m4a,.aac" hidden
                 @change=${this._onFileChange} />
          <button class="browse-btn" @click=${this._onBrowse}>Browse Files</button>
        </div>
        ${this._status ? html`
          ${this._uploading ? html`
            <div class="progress-row">
              <progress value=${this._progress} max="100"></progress>
              <span class="pct">${this._progress}%</span>
            </div>
          ` : ''}
          <p class="status">${this._status}</p>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('bkp-upload', BkpUpload);
