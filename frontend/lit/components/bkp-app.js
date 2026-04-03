/**
 * bkp-app.js – Root Lit component for the Bass Karaoke Player
 *
 * Owns all application state and audio logic.  Child components are
 * presentational: they receive data via properties and dispatch Custom Events
 * upward.
 *
 * Audio graph:
 *   [stemSource × N] → [stemGain × N] → [masterGain]
 *     → [eq60Hz] → [eq250Hz] → [eq1kHz] → [eq4kHz] → [eq16kHz]
 *     → AudioContext.destination
 */

import { LitElement, html, css } from 'https://esm.sh/lit@3';
import './bkp-upload.js';
import './bkp-song-list.js';
import './bkp-player.js';
import './bkp-equalizer.js';

/* ---- Constants ---- */
const API_BASE = '/api';
const POLL_INTERVAL_MS = 2000;
const MAX_SONG_STATES = 3;

const EQ_BANDS = [
  { freq: 60,    type: 'lowshelf',  label: '60 Hz'  },
  { freq: 250,   type: 'peaking',   label: '250 Hz' },
  { freq: 1000,  type: 'peaking',   label: '1 kHz'  },
  { freq: 4000,  type: 'peaking',   label: '4 kHz'  },
  { freq: 16000, type: 'highshelf', label: '16 kHz' },
];

/* ---- API helpers ---- */
async function apiGet(path) {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail ?? r.statusText);
  }
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(API_BASE + path, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${path} → ${r.status}`);
}
function stemUrl(songId, stem) {
  return `${API_BASE}/songs/${songId}/stems/${stem}`;
}
function processedStemUrl(songId, stem, pitch, tempoRatio) {
  return `${API_BASE}/songs/${songId}/stems/${stem}/processed?pitch=${pitch}&tempo=${tempoRatio}`;
}

/* ===========================================================================
   BkpApp – root component
   =========================================================================== */

class BkpApp extends LitElement {
  /* ---- Reactive properties ---- */
  static properties = {
    songs:         { type: Array   },
    activeSong:    { type: Object  },
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
    eqGains:       { type: Array   },
    activeTab:     { type: String  },
    serverConfig:  { type: Object  },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--c-bg, #1a1a2e);
      color: var(--c-text, #eaeaea);
      font-family: "Segoe UI", system-ui, sans-serif;
    }

    /* ---- Header ---- */
    .app-header {
      background: var(--c-accent2, #0f3460);
      padding: 1rem 1.5rem;
      text-align: center;
      border-bottom: 3px solid var(--c-accent, #e94560);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .app-header h1 {
      font-size: 1.5rem;
      letter-spacing: 0.03em;
      color: #fff;
      margin: 0;
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .classic-link {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.65);
      text-decoration: none;
      padding: 0.2rem 0.5rem;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      transition: color 0.2s ease, border-color 0.2s ease;
    }
    .classic-link:hover { color: #fff; border-color: rgba(255,255,255,0.6); }

    /* ---- Main ---- */
    .app-main {
      flex: 1;
      max-width: 960px;
      width: 100%;
      margin: 0 auto;
      padding: 1rem 1rem calc(70px + 1rem);  /* room for bottom tab bar */
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* ---- Tab sections (mobile: show only active) ---- */
    .tab-section { display: none; }
    .tab-section.active { display: contents; }

    /* ---- Bottom tab bar (mobile) ---- */
    .tab-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      background: var(--c-surface, #16213e);
      border-top: 1px solid var(--c-border, #2a2a4a);
      z-index: 100;
    }
    .tab-btn {
      flex: 1;
      background: none;
      border: none;
      color: var(--c-muted, #888);
      cursor: pointer;
      padding: 0.75rem 0.5rem 0.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.2rem;
      font-size: 0.75rem;
      min-height: 60px;
      transition: color 0.2s ease;
    }
    .tab-btn .tab-icon { font-size: 1.4rem; }
    .tab-btn.active { color: var(--c-accent, #e94560); }
    .tab-btn:hover:not(.active) { color: var(--c-text, #eaeaea); }

    /* ---- Desktop: show everything, hide tab bar ---- */
    @media (min-width: 768px) {
      .app-main { padding-bottom: 1.5rem; }
      .tab-section { display: contents; }
      .tab-bar { display: none; }
    }

    /* ---- Footer ---- */
    footer {
      text-align: center;
      padding: 1rem;
      font-size: 0.85rem;
      color: var(--c-muted, #888);
      border-top: 1px solid var(--c-border, #2a2a4a);
    }
    footer a { color: var(--c-accent, #e94560); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  `;

  constructor() {
    super();
    /* Reactive state */
    this.songs = [];
    this.activeSong = null;
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
    this.eqGains = [0, 0, 0, 0, 0];
    this.activeTab = 'library';
    this.serverConfig = { max_versions_per_song: 5, max_versions_global: 50 };

    /* Non-reactive audio state */
    this._audioCtx = null;
    this._masterGain = null;
    this._eqNodes = [];       // BiquadFilterNode × 5
    this._stemNodes = {};     // { stem: { buffer, gainNode, source } }
    this._startOffset = 0;
    this._startTime = 0;
    this._seekTimer = null;
    this._pollTimer = null;
    this._versionPollTimer = null;
    /* LRU song-state cache */
    this._songStates = {};     // { id: { buffers, pitch, tempo, volumes, mutes, offset, loop* } }
    this._songStatesOrder = [];
  }

  /* =========================================================================
     Lifecycle
     ========================================================================= */

  async connectedCallback() {
    super.connectedCallback();
    try { this.serverConfig = await apiGet('/config'); } catch { /* use defaults */ }
    await this._refreshSongList();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopSeekTimer();
    if (this._pollTimer) clearInterval(this._pollTimer);
    if (this._versionPollTimer) clearInterval(this._versionPollTimer);
  }

  /* =========================================================================
     Audio chain helpers
     ========================================================================= */

  _ensureAudioChain() {
    if (!this._audioCtx) {
      this._audioCtx = new AudioContext();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    if (!this._masterGain) {
      this._masterGain = this._audioCtx.createGain();
      this._eqNodes = EQ_BANDS.map((band, i) => {
        const f = this._audioCtx.createBiquadFilter();
        f.type = band.type;
        f.frequency.value = band.freq;
        f.gain.value = this.eqGains[i] ?? 0;
        if (band.type === 'peaking') f.Q.value = 1.0;
        return f;
      });
      // Chain: masterGain → eq0 → … → eq4 → destination
      let prev = this._masterGain;
      for (const node of this._eqNodes) { prev.connect(node); prev = node; }
      prev.connect(this._audioCtx.destination);
    }
  }

  /* =========================================================================
     Audio: loading & decoding
     ========================================================================= */

  async _fetchAndDecodeStems(song, pitchSemitones, tempoRatio) {
    this._ensureAudioChain();
    const useProcessed = pitchSemitones !== 0 || tempoRatio !== 1;

    const results = await Promise.all(song.stems.map(async (stem) => {
      let url;
      if (useProcessed) {
        try {
          await apiPost(`/songs/${song.id}/stems/${stem}/process`, {
            pitch_semitones: pitchSemitones,
            tempo_ratio: tempoRatio,
          });
          url = processedStemUrl(song.id, stem, pitchSemitones, tempoRatio);
        } catch (err) {
          console.warn(`Processing stem ${stem} failed:`, err);
          url = stemUrl(song.id, stem);
        }
      } else {
        url = stemUrl(song.id, stem);
      }
      const resp  = await fetch(url);
      const buf   = await resp.arrayBuffer();
      const audio = await this._audioCtx.decodeAudioData(buf);
      return { stem, audio };
    }));

    this._stemNodes = {};
    for (const { stem, audio } of results) {
      const gainNode = this._audioCtx.createGain();
      gainNode.gain.value = this.stemMuted[stem] ? 0 : (this.stemVolumes[stem] ?? 1.0);
      gainNode.connect(this._masterGain);
      this._stemNodes[stem] = { buffer: audio, gainNode, source: null };
    }
    this.duration = Math.max(...results.map(r => r.audio.duration), 0);
  }

  async _restoreStemNodes(song, saved) {
    this._ensureAudioChain();
    this._stemNodes = {};
    for (const stem of song.stems) {
      const buffer = saved.buffers[stem];
      if (!buffer) continue;
      const gainNode = this._audioCtx.createGain();
      gainNode.gain.value = this.stemMuted[stem] ? 0 : (this.stemVolumes[stem] ?? 1.0);
      gainNode.connect(this._masterGain);
      this._stemNodes[stem] = { buffer, gainNode, source: null };
    }
    this.duration = Math.max(...Object.values(this._stemNodes).map(n => n.buffer?.duration ?? 0), 0);
  }

  /* =========================================================================
     Audio: playback
     ========================================================================= */

  _playAll(offset = 0) {
    this._ensureAudioChain();
    const loopRegion = this.loopEnabled && this.loopStart !== null && this.loopEnd !== null;
    for (const [stem, node] of Object.entries(this._stemNodes)) {
      const source = this._audioCtx.createBufferSource();
      source.buffer = node.buffer;
      source.connect(node.gainNode);
      if (loopRegion) {
        source.loop = true;
        source.loopStart = this.loopStart;
        source.loopEnd = this.loopEnd;
        const startFrom = Math.max(this.loopStart, Math.min(offset, this.loopEnd));
        source.start(0, startFrom);
      } else {
        source.start(0, offset);
      }
      source.onended = () => {
        if (stem === Object.keys(this._stemNodes)[0]) this._onPlaybackEnded();
      };
      node.source = source;
    }
    this._startOffset = loopRegion
      ? Math.max(this.loopStart, Math.min(offset, this.loopEnd ?? this.duration))
      : offset;
    this._startTime = this._audioCtx.currentTime;
    this.isPlaying = true;
    this._startSeekTimer();
  }

  _pauseAll() {
    this._startOffset += this._audioCtx.currentTime - this._startTime;
    this._stopSources();
    this.isPlaying = false;
    this._stopSeekTimer();
  }

  _stopAll() {
    this._stopSources();
    this.isPlaying = false;
    this._startOffset = 0;
    this.currentTime = 0;
    this._stopSeekTimer();
  }

  _stopSources() {
    for (const node of Object.values(this._stemNodes)) {
      try { node.source?.stop(); } catch { /* already stopped */ }
      node.source = null;
    }
  }

  _onPlaybackEnded() {
    if (!this.isPlaying) return;
    this._stopAll();
  }

  /* ---- Seek timer ---- */
  _startSeekTimer() {
    this._stopSeekTimer();
    this._seekTimer = setInterval(() => {
      if (!this.isPlaying) return;
      const elapsed = this._startOffset + (this._audioCtx.currentTime - this._startTime);
      if (this.loopEnabled && this.loopEnd !== null && elapsed >= this.loopEnd) {
        this.currentTime = this.loopEnd;
        return;
      }
      this.currentTime = Math.min(elapsed, this.duration);
    }, 250);
  }

  _stopSeekTimer() {
    if (this._seekTimer) { clearInterval(this._seekTimer); this._seekTimer = null; }
  }

  /* ---- Gain ---- */
  _applyGain(stem, value) {
    const node = this._stemNodes[stem];
    if (node?.gainNode) {
      node.gainNode.gain.setTargetAtTime(value, this._audioCtx.currentTime, 0.05);
    }
  }

  /* =========================================================================
     Versions
     ========================================================================= */

  async _fetchVersions(songId) {
    try {
      const data = await apiGet(`/songs/${songId}/versions`);
      this.versions = data.versions;
      this._maybeStartVersionPolling(songId);
    } catch (err) {
      console.error('Failed to load versions:', err);
    }
  }

  _maybeStartVersionPolling(songId) {
    const hasProcessing = this.versions.some(v => v.status === 'processing' || v.status === 'partial');
    if (hasProcessing && !this._versionPollTimer) {
      this._versionPollTimer = setInterval(async () => {
        try {
          const data = await apiGet(`/songs/${songId}/versions`);
          this.versions = data.versions;
          const still = data.versions.some(v => v.status === 'processing' || v.status === 'partial');
          if (!still) { clearInterval(this._versionPollTimer); this._versionPollTimer = null; }
        } catch (err) { console.error('Version poll error:', err); }
      }, POLL_INTERVAL_MS);
    } else if (!hasProcessing && this._versionPollTimer) {
      clearInterval(this._versionPollTimer);
      this._versionPollTimer = null;
    }
  }

  async _selectVersion(pitch, tempo) {
    if (!this.activeSong || this.isLoading) return;
    if (this.activeVersion?.pitch === pitch && this.activeVersion?.tempo === tempo) return;
    const wasPlaying = this.isPlaying;
    const savedOffset = wasPlaying
      ? this._startOffset + (this._audioCtx.currentTime - this._startTime)
      : this._startOffset;
    this._stopAll();
    this.pitch = pitch;
    this.tempo = Math.round(tempo * 100);
    this.activeVersion = { pitch, tempo };
    this.isLoading = true;
    try {
      await this._fetchAndDecodeStems(this.activeSong, pitch, tempo);
      this.versions = [...this.versions]; // trigger re-render
      if (wasPlaying) this._playAll(savedOffset);
    } catch (err) {
      console.error('Failed to load version:', err);
    } finally {
      this.isLoading = false;
    }
  }

  async _deleteVersion(songId, pitch, tempo) {
    const isActive = this.activeVersion?.pitch === pitch && this.activeVersion?.tempo === tempo;
    try {
      const params = new URLSearchParams({ pitch: String(pitch), tempo: String(tempo) });
      await fetch(`${API_BASE}/songs/${songId}/versions?${params}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete version:', err);
      return;
    }
    if (isActive) await this._selectVersion(0, 1.0);
    await this._fetchVersions(songId);
  }

  /* =========================================================================
     Song list
     ========================================================================= */

  async _refreshSongList() {
    try {
      const data = await apiGet('/songs');
      this.songs = data.songs;
    } catch (err) {
      console.error('Failed to load songs:', err);
    }
  }

  _startPolling(songId) {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(async () => {
      try {
        const song = await apiGet(`/songs/${songId}`);
        this.songs = this.songs.map(s => s.id === songId ? song : s);
        if (song.status === 'ready' || song.status === 'error') {
          clearInterval(this._pollTimer);
          this._pollTimer = null;
        }
      } catch (err) { console.error('Polling error:', err); }
    }, POLL_INTERVAL_MS);
  }

  /* =========================================================================
     Per-song LRU state
     ========================================================================= */

  _saveSongState(songId) {
    if (!songId) return;
    const buffers = {};
    for (const [stem, node] of Object.entries(this._stemNodes)) {
      buffers[stem] = node.buffer;
    }
    const currentOffset = this.isPlaying
      ? this._startOffset + ((this._audioCtx?.currentTime ?? 0) - this._startTime)
      : this._startOffset;
    this._songStates[songId] = {
      buffers,
      pitch: this.activeVersion.pitch,
      tempo: this.activeVersion.tempo,
      volumes: { ...this.stemVolumes },
      mutes:   { ...this.stemMuted   },
      playbackOffset: currentOffset,
      loopEnabled: this.loopEnabled,
      loopStart: this.loopStart,
      loopEnd:   this.loopEnd,
    };
    const idx = this._songStatesOrder.indexOf(songId);
    if (idx >= 0) this._songStatesOrder.splice(idx, 1);
    this._songStatesOrder.push(songId);
    while (this._songStatesOrder.length > MAX_SONG_STATES) {
      const oldest = this._songStatesOrder.shift();
      if (oldest !== this.activeSong?.id) delete this._songStates[oldest];
    }
  }

  /* =========================================================================
     Load song
     ========================================================================= */

  async _loadSong(song) {
    if (this.activeSong && this.activeSong.id !== song.id) {
      this._saveSongState(this.activeSong.id);
      this._stopAll();
    } else if (!this.activeSong) {
      this._stopAll();
    }
    if (this._versionPollTimer) { clearInterval(this._versionPollTimer); this._versionPollTimer = null; }

    this.activeSong = song;
    // Switch to player tab on mobile after selecting a song
    if (window.innerWidth < 768) this.activeTab = 'player';

    const saved = this._songStates[song.id];
    if (saved?.buffers && Object.keys(saved.buffers).length > 0) {
      /* Restore from saved state */
      this.activeVersion = { pitch: saved.pitch, tempo: saved.tempo };
      this.pitch = saved.pitch;
      this.tempo = Math.round(saved.tempo * 100);
      this._startOffset = saved.playbackOffset;
      this.loopEnabled = saved.loopEnabled;
      this.loopStart   = saved.loopStart;
      this.loopEnd     = saved.loopEnd;
      this.stemVolumes = { ...saved.volumes };
      this.stemMuted   = { ...saved.mutes   };
      this.isLoading = true;
      try {
        await this._restoreStemNodes(song, saved);
        await this._fetchVersions(song.id);
      } finally { this.isLoading = false; }
      return;
    }

    /* Fresh load */
    this.activeVersion = { pitch: 0, tempo: 1.0 };
    this.pitch = 0;
    this.tempo = 100;
    this.loopEnabled = false;
    this.loopStart = null;
    this.loopEnd = null;
    this.stemVolumes = Object.fromEntries((song.stems ?? []).map(s => [s, 1.0]));
    this.stemMuted   = Object.fromEntries((song.stems ?? []).map(s => [s, false]));
    this.isLoading = true;
    try {
      await this._fetchAndDecodeStems(song, 0, 1);
      await this._fetchVersions(song.id);
    } finally { this.isLoading = false; }
  }

  /* =========================================================================
     Event handlers (from child components)
     ========================================================================= */

  /* ---- Upload ---- */
  _onUploadStarted(e) {
    const { songId } = e.detail;
    this._refreshSongList();
    this._startPolling(songId);
  }

  /* ---- Song list ---- */
  async _onSongLoad(e) {
    await this._loadSong(e.detail.song);
  }

  async _onSongDelete(e) {
    const { songId } = e.detail;
    if (!confirm('Delete this song and all its stems?')) return;
    await apiDelete(`/songs/${songId}`);
    if (this.activeSong?.id === songId) {
      this._stopAll();
      this.activeSong = null;
    }
    await this._refreshSongList();
  }

  /* ---- Player: pitch / tempo / apply / cache / reset ---- */
  _onPitchInput(e) { this.pitch = e.detail.value; }
  _onTempoInput(e) { this.tempo = e.detail.value; }

  async _onApply() {
    if (!this.activeSong || this.isLoading) return;
    const wasPlaying = this.isPlaying;
    const savedOffset = wasPlaying
      ? this._startOffset + (this._audioCtx.currentTime - this._startTime)
      : this._startOffset;
    this._stopAll();
    this.isLoading = true;
    try {
      const pitchSemitones = this.pitch;
      const tempoRatio = this.tempo / 100;
      await this._fetchAndDecodeStems(this.activeSong, pitchSemitones, tempoRatio);
      this.activeVersion = { pitch: pitchSemitones, tempo: tempoRatio };
      await this._fetchVersions(this.activeSong.id);
      if (wasPlaying) this._playAll(savedOffset);
    } catch (err) {
      alert(`Processing failed: ${err.message}`);
    } finally {
      this.isLoading = false;
    }
  }

  async _onCache() {
    if (!this.activeSong || this.isLoading) return;
    const pitchSemitones = this.pitch;
    const tempoRatio = this.tempo / 100;
    try {
      const result = await apiPost(`/songs/${this.activeSong.id}/versions`, {
        pitch_semitones: pitchSemitones, tempo_ratio: tempoRatio,
      });
      if (result.status === 'ready') {
        await this._fetchVersions(this.activeSong.id);
        await this._selectVersion(pitchSemitones, tempoRatio);
      } else {
        const optimistic = {
          pitch_semitones: pitchSemitones, tempo_ratio: tempoRatio,
          is_default: false, status: 'processing', stem_count: 0, accessed_at: null,
        };
        this.versions = [
          ...this.versions.filter(v => !(v.pitch_semitones === pitchSemitones && v.tempo_ratio === tempoRatio)),
          optimistic,
        ];
        this._maybeStartVersionPolling(this.activeSong.id);
      }
    } catch (err) {
      alert(`Caching failed: ${err.message}`);
    }
  }

  async _onReset() {
    this.pitch = 0;
    this.tempo = 100;
    if (!this.activeSong || this.isLoading) return;
    const wasPlaying = this.isPlaying;
    const savedOffset = wasPlaying
      ? this._startOffset + (this._audioCtx.currentTime - this._startTime)
      : this._startOffset;
    this._stopAll();
    this.activeVersion = { pitch: 0, tempo: 1.0 };
    this.isLoading = true;
    try {
      await this._fetchAndDecodeStems(this.activeSong, 0, 1);
      this.versions = [...this.versions];
      if (wasPlaying) this._playAll(savedOffset);
    } finally { this.isLoading = false; }
  }

  /* ---- Player: playback ---- */
  _onPlayPause() {
    if (this.isPlaying) this._pauseAll();
    else this._playAll(this._startOffset);
  }

  _onStop() { this._stopAll(); }

  _onSeek(e) {
    const time = e.detail.time;
    if (this.isPlaying) {
      this._pauseAll();
      this._startOffset = time;
      this._playAll(this._startOffset);
    } else {
      this._startOffset = time;
      this.currentTime = time;
    }
  }

  /* ---- Player: A-B loop ---- */
  _onLoopToggle() {
    this.loopEnabled = !this.loopEnabled;
    if (this.loopEnabled && this.loopStart === null) {
      this.loopStart = 0;
      this.loopEnd = this.duration;
    }
    if (this.isPlaying) {
      const offset = this._startOffset + (this._audioCtx.currentTime - this._startTime);
      this._stopSources();
      this._startOffset = offset;
      this._startTime = this._audioCtx?.currentTime ?? 0;
      this._playAll(offset);
    }
  }

  _onLoopSetA() {
    const pos = this.isPlaying
      ? this._startOffset + (this._audioCtx.currentTime - this._startTime)
      : this._startOffset;
    this.loopStart = Math.min(pos, this.loopEnd ?? this.duration);
    if (this.isPlaying) { this._stopSources(); this._playAll(this.loopStart); }
  }

  _onLoopSetB() {
    const pos = this.isPlaying
      ? this._startOffset + (this._audioCtx.currentTime - this._startTime)
      : this._startOffset;
    this.loopEnd = Math.max(pos, this.loopStart ?? 0);
    if (this.isPlaying) {
      const offset = Math.min(this._startOffset, this.loopEnd);
      this._stopSources();
      this._playAll(offset);
    }
  }

  _onLoopClear() {
    this.loopEnabled = false;
    this.loopStart = null;
    this.loopEnd = null;
    if (this.isPlaying) {
      const offset = this._startOffset + (this._audioCtx.currentTime - this._startTime);
      this._stopSources();
      this._startOffset = offset;
      this._startTime = this._audioCtx?.currentTime ?? 0;
      this._playAll(offset);
    }
  }

  /* ---- Player: versions ---- */
  async _onVersionSelect(e) {
    await this._selectVersion(e.detail.pitch, e.detail.tempo);
  }

  async _onVersionDelete(e) {
    if (!this.activeSong) return;
    await this._deleteVersion(this.activeSong.id, e.detail.pitch, e.detail.tempo);
  }

  /* ---- Player: stems ---- */
  _onVolumeChange(e) {
    const { stem, volume } = e.detail;
    this.stemVolumes = { ...this.stemVolumes, [stem]: volume };
    this._applyGain(stem, this.stemMuted[stem] ? 0 : volume);
  }

  _onMuteToggle(e) {
    const { stem } = e.detail;
    const muted = !this.stemMuted[stem];
    this.stemMuted = { ...this.stemMuted, [stem]: muted };
    this._applyGain(stem, muted ? 0 : (this.stemVolumes[stem] ?? 1.0));
  }

  /* ---- EQ ---- */
  _onEqChange(e) {
    const { band, gain } = e.detail;
    const newGains = [...this.eqGains];
    newGains[band] = gain;
    this.eqGains = newGains;
    if (this._eqNodes[band] && this._audioCtx) {
      this._eqNodes[band].gain.setTargetAtTime(gain, this._audioCtx.currentTime, 0.05);
    }
  }

  _onEqReset() {
    this.eqGains = [0, 0, 0, 0, 0];
    if (this._audioCtx) {
      for (const node of this._eqNodes) {
        node.gain.setTargetAtTime(0, this._audioCtx.currentTime, 0.05);
      }
    }
  }

  /* =========================================================================
     Render
     ========================================================================= */

  render() {
    const loadedSongIds = Object.keys(this._songStates);

    return html`
      <header class="app-header">
        <div class="header-row">
          <h1>🎵 Bass Karaoke Player</h1>
          <a class="classic-link" href="/">← Classic UI</a>
        </div>
      </header>

      <main class="app-main">
        <!-- Library tab: upload + song list -->
        <div class="tab-section ${this.activeTab === 'library' ? 'active' : ''}">
          <bkp-upload
            @upload-started=${this._onUploadStarted}>
          </bkp-upload>
          <bkp-song-list
            .songs=${this.songs}
            .activeSongId=${this.activeSong?.id ?? null}
            .loadedSongIds=${loadedSongIds}
            @song-load=${this._onSongLoad}
            @song-delete=${this._onSongDelete}
            @refresh=${() => this._refreshSongList()}>
          </bkp-song-list>
        </div>

        <!-- Player tab -->
        <div class="tab-section ${this.activeTab === 'player' ? 'active' : ''}">
          <bkp-player
            .song=${this.activeSong}
            .isPlaying=${this.isPlaying}
            .isLoading=${this.isLoading}
            .pitch=${this.pitch}
            .tempo=${this.tempo}
            .versions=${this.versions}
            .activeVersion=${this.activeVersion}
            .stemVolumes=${this.stemVolumes}
            .stemMuted=${this.stemMuted}
            .loopEnabled=${this.loopEnabled}
            .loopStart=${this.loopStart}
            .loopEnd=${this.loopEnd}
            .duration=${this.duration}
            .currentTime=${this.currentTime}
            .serverConfig=${this.serverConfig}
            @play-pause=${this._onPlayPause}
            @stop=${this._onStop}
            @seek=${this._onSeek}
            @pitch-input=${this._onPitchInput}
            @tempo-input=${this._onTempoInput}
            @apply=${this._onApply}
            @cache=${this._onCache}
            @reset=${this._onReset}
            @loop-toggle=${this._onLoopToggle}
            @loop-set-a=${this._onLoopSetA}
            @loop-set-b=${this._onLoopSetB}
            @loop-clear=${this._onLoopClear}
            @version-select=${this._onVersionSelect}
            @version-delete=${this._onVersionDelete}
            @volume-change=${this._onVolumeChange}
            @mute-toggle=${this._onMuteToggle}>
          </bkp-player>
        </div>

        <!-- EQ tab -->
        <div class="tab-section ${this.activeTab === 'eq' ? 'active' : ''}">
          <bkp-equalizer
            .gains=${this.eqGains}
            @eq-change=${this._onEqChange}
            @eq-reset=${this._onEqReset}>
          </bkp-equalizer>
        </div>
      </main>

      <!-- Mobile bottom tab bar -->
      <nav class="tab-bar" aria-label="Navigation">
        <button class="tab-btn ${this.activeTab === 'library' ? 'active' : ''}"
                @click=${() => { this.activeTab = 'library'; }}>
          <span class="tab-icon">📁</span>
          <span>Library</span>
        </button>
        <button class="tab-btn ${this.activeTab === 'player' ? 'active' : ''}"
                @click=${() => { this.activeTab = 'player'; }}>
          <span class="tab-icon">🎵</span>
          <span>Player</span>
        </button>
        <button class="tab-btn ${this.activeTab === 'eq' ? 'active' : ''}"
                @click=${() => { this.activeTab = 'eq'; }}>
          <span class="tab-icon">🎛️</span>
          <span>EQ</span>
        </button>
      </nav>

      <footer>
        <p>Bass Karaoke Player — powered by
          <a href="https://github.com/adefossez/demucs" target="_blank" rel="noopener">demucs</a>
          &amp;
          <a href="https://github.com/breakfastquay/rubberband" target="_blank" rel="noopener">rubberband</a>
        </p>
      </footer>
    `;
  }
}

customElements.define('bkp-app', BkpApp);
