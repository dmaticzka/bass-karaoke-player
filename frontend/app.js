/**
 * Bass Karaoke Player – frontend application logic
 *
 * Architecture:
 *  - Song management (upload, list, delete) via REST API calls
 *  - Per-stem Web Audio API nodes for real-time volume control
 *  - Pitch & tempo applied server-side (rubberband) on demand,
 *    then the processed WAV is fetched and replayed
 */

/* ---------- Constants ---------- */
const API_BASE = "/api";
const POLL_INTERVAL_MS = 2000;
const MAX_SONG_STATES = 3;   // max songs kept in memory
const STEM_COLORS = {
  drums:  "--stem-drums",
  bass:   "--stem-bass",
  vocals: "--stem-vocals",
  other:  "--stem-other",
};

/* ---------- State ---------- */
const state = {
  songs: [],
  activeSong: null,    // Song object currently loaded in the player
  audioCtx: null,      // AudioContext
  stemNodes: {},       // { stemName: { source, gainNode, buffer } }
  isPlaying: false,
  isLoading: false,    // true while stems are being fetched/decoded
  startOffset: 0,      // seconds into the track we started at
  startTime: 0,        // audioCtx.currentTime when play was pressed
  duration: 0,         // seconds
  seekTimer: null,
  pollTimer: null,
  versionPollTimer: null,  // polls for version processing completion
  pitch: 0,
  tempo: 100,
  stemVolumes: {},     // { stemName: float 0-2 }
  stemMuted: {},       // { stemName: bool }
  pendingProcess: false,
  activeVersion: { pitch: 0, tempo: 1.0 },  // currently loaded version
  versions: [],        // list of Version objects from API
  // A-B loop
  loopEnabled: false,
  loopStart: null,     // seconds
  loopEnd: null,       // seconds
  // Per-song state persistence (LRU, max 3 songs)
  songStates: {},      // { song_id: { buffers, pitch, tempo, volumes, mutes, offset, loop* } }
  songStatesOrder: [], // LRU order of song IDs (most recent last)
};

/* ---------- DOM references ---------- */
const $ = (id) => document.getElementById(id);
const dropZone      = $("drop-zone");
const fileInput     = $("file-input");
const browseBtn     = $("browse-btn");
const uploadProgress = $("upload-progress");
const uploadBar     = $("upload-bar");
const uploadStatus  = $("upload-status");
const refreshBtn    = $("refresh-btn");
const songList      = $("song-list");
const playerSection = $("player-section");
const playerTitle   = $("player-title");
const pitchSlider   = $("pitch-slider");
const pitchValue    = $("pitch-value");
const tempoSlider   = $("tempo-slider");
const tempoValue    = $("tempo-value");
const applyBtn      = $("apply-btn");
const resetBtn      = $("reset-btn");
const stemsGrid     = $("stems-grid");
const playPauseBtn  = $("play-pause-btn");
const stopBtn       = $("stop-btn");
const seekSlider    = $("seek-slider");
const timeDisplay   = $("time-display");

const versionsSection = $("versions-section");
const versionsList    = $("versions-list");

// Cache version & loop controls
const cacheBtn        = $("cache-btn");
const loopToggleBtn   = $("loop-toggle-btn");
const loopABtn        = $("loop-a-btn");
const loopBBtn        = $("loop-b-btn");
const loopClearBtn    = $("loop-clear-btn");
const loopDisplay     = $("loop-display");
const cacheStats      = $("cache-stats");
const cacheStatsLabel = $("cache-stats-label");
const cacheStatsFill  = $("cache-stats-fill");

/* ==========================================================================
   API helpers
   ========================================================================== */

async function apiGet(path) {
  const resp = await fetch(API_BASE + path);
  if (!resp.ok) throw new Error(`GET ${path} → ${resp.status}`);
  return resp.json();
}

async function apiPost(path, body) {
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || resp.statusText);
  }
  return resp.json();
}

async function apiDelete(path) {
  const resp = await fetch(API_BASE + path, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) throw new Error(`DELETE ${path} → ${resp.status}`);
}

function stemUrl(songId, stemName) {
  return `${API_BASE}/songs/${songId}/stems/${stemName}`;
}

function processedStemUrl(songId, stemName, pitch, tempoRatio) {
  return `${API_BASE}/songs/${songId}/stems/${stemName}/processed?pitch=${pitch}&tempo=${tempoRatio}`;
}

async function apiDelete(path) {
  const resp = await fetch(API_BASE + path, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) throw new Error(`DELETE ${path} → ${resp.status}`);
}

/* ==========================================================================
   Loading state
   ========================================================================== */

function setLoadingState(isLoading) {
  state.isLoading = isLoading;
  playPauseBtn.disabled = isLoading;
  playPauseBtn.textContent = isLoading
    ? "⏳ Loading…"
    : state.isPlaying ? "⏸ Pause" : "▶ Play All";
  stemsGrid.classList.toggle("loading", isLoading);
  versionsList.classList.toggle("loading", isLoading);
  resetBtn.disabled = isLoading;
}

/* ==========================================================================
   Versions
   ========================================================================== */

async function fetchVersions(songId) {
  try {
    const data = await apiGet(`/songs/${songId}/versions`);
    state.versions = data.versions;
    renderVersions();
  } catch (e) {
    console.error("Failed to load versions:", e);
  }
}

function startVersionPolling(songId) {
  if (!songId || state.versionPollTimer) return;
  state.versionPollTimer = setInterval(async () => {
    try {
      const data = await apiGet(`/songs/${songId}/versions`);
      state.versions = data.versions;
      renderVersions();
      const hasProcessing = data.versions.some((v) => v.status === "processing" || v.status === "partial");
      if (!hasProcessing) {
        clearInterval(state.versionPollTimer);
        state.versionPollTimer = null;
      }
    } catch (e) {
      console.error("Version polling error:", e);
    }
  }, POLL_INTERVAL_MS);
}

function updateCacheStats(cachedCount) {
  if (!cacheStats) return;
  const maxVersions = 5; // matches MAX_VERSIONS_PER_SONG default
  cacheStatsLabel.textContent = `Versions: ${cachedCount} / ${maxVersions}`;
  const pct = Math.min(100, (cachedCount / maxVersions) * 100);
  cacheStatsFill.style.width = `${pct}%`;
  cacheStatsFill.className = "cache-stats-fill" + (cachedCount >= maxVersions ? " full" : "");
}

function renderVersions() {
  versionsList.innerHTML = "";
  let readyCount = 0;
  for (const ver of state.versions) {
    if (!ver.is_default) readyCount++;
    const pitchStr  = ver.pitch_semitones > 0 ? `+${ver.pitch_semitones}` : String(ver.pitch_semitones);
    const tempoStr  = `${Math.round(ver.tempo_ratio * 100)}%`;
    const label     = ver.is_default ? `Original (${tempoStr})` : `${pitchStr} st, ${tempoStr}`;

    const isActive =
      state.activeVersion.pitch === ver.pitch_semitones &&
      state.activeVersion.tempo === ver.tempo_ratio;

    const li = document.createElement("li");
    li.className = "version-item" +
      (ver.is_default ? " default-version" : "") +
      (isActive ? " active" : "");
    li.title = `Pitch: ${pitchStr} semitones, Tempo: ${tempoStr}`;

    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    li.appendChild(labelSpan);

    // Status badge for non-default versions
    if (!ver.is_default) {
      const badge = document.createElement("span");
      const statusText = ver.status === "processing" ? "⏳" : ver.status === "partial" ? "partial" : "";
      if (statusText) {
        badge.className = `version-status-badge status-${ver.status}`;
        badge.textContent = statusText;
        li.appendChild(badge);
      }
      if (ver.accessed_at) {
        const relTime = document.createElement("span");
        relTime.className = "version-accessed";
        relTime.textContent = fmtRelTime(ver.accessed_at);
        li.appendChild(relTime);
      }
    }

    if (!ver.is_default && ver.status !== "processing") {
      const delBtn = document.createElement("button");
      delBtn.className = "version-delete-btn";
      delBtn.textContent = "✕";
      delBtn.title = "Delete this version";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteVersion(state.activeSong.id, ver.pitch_semitones, ver.tempo_ratio);
      });
      li.appendChild(delBtn);
    }

    if (ver.status !== "processing") {
      li.addEventListener("click", () => {
        selectVersion(ver.pitch_semitones, ver.tempo_ratio);
      });
    }

    versionsList.appendChild(li);
  }

  // Update cache stats bar
  updateCacheStats(readyCount);
  // Start version polling if any version is still processing
  const hasProcessing = state.versions.some((v) => v.status === "processing" || v.status === "partial");
  if (hasProcessing && !state.versionPollTimer) {
    startVersionPolling(state.activeSong?.id);
  } else if (!hasProcessing && state.versionPollTimer) {
    clearInterval(state.versionPollTimer);
    state.versionPollTimer = null;
  }
}

async function selectVersion(pitch, tempo) {
  if (!state.activeSong) return;
  if (state.activeVersion.pitch === pitch && state.activeVersion.tempo === tempo) return;
  if (state.isLoading) return;

  const wasPlaying = state.isPlaying;
  const savedOffset = wasPlaying
    ? state.startOffset + (state.audioCtx.currentTime - state.startTime)
    : state.startOffset;
  stopAll();

  // Update sliders to reflect the selected version
  pitchSlider.value = pitch;
  pitchValue.textContent = String(pitch);
  tempoSlider.value = Math.round(tempo * 100);
  tempoValue.textContent = `${Math.round(tempo * 100)}%`;
  state.pitch = pitch;
  state.tempo = Math.round(tempo * 100);

  state.activeVersion = { pitch, tempo };
  renderVersions();

  setLoadingState(true);
  try {
    await fetchAndDecodeStems(state.activeSong, pitch, tempo);
    if (wasPlaying) playAll(savedOffset);
  } catch (e) {
    console.error("Failed to load version:", e);
  } finally {
    setLoadingState(false);
  }
}

async function deleteVersion(songId, pitch, tempo) {
  const isActive = state.activeVersion.pitch === pitch && state.activeVersion.tempo === tempo;
  try {
    const params = new URLSearchParams({ pitch: String(pitch), tempo: String(tempo) });
    const resp = await fetch(`${API_BASE}/songs/${songId}/versions?${params}`, { method: "DELETE" });
    if (!resp.ok && resp.status !== 404) throw new Error(`Delete version failed: ${resp.status}`);
  } catch (e) {
    console.error("Failed to delete version:", e);
    return;
  }
  // If deleted version was active, fall back to default
  if (isActive) {
    await selectVersion(0, 1.0);
  }
  await fetchVersions(songId);
}

/* ==========================================================================
   Song list
   ========================================================================== */

async function refreshSongList() {
  try {
    const data = await apiGet("/songs");
    state.songs = data.songs;
    renderSongList();
  } catch (e) {
    console.error("Failed to load songs:", e);
  }
}

function renderSongList() {
  songList.innerHTML = "";
  if (state.songs.length === 0) {
    songList.innerHTML = '<li class="empty-msg">No songs uploaded yet.</li>';
    return;
  }
  for (const song of state.songs) {
    const li = document.createElement("li");
    li.className = "song-item" + (state.activeSong?.id === song.id ? " active" : "");
    li.dataset.id = song.id;

    const nameEl = document.createElement("span");
    nameEl.className = "song-name";
    nameEl.title = song.filename;
    // Show 🎵 indicator for songs loaded in memory (but not the currently active one)
    const isLoaded = song.id in state.songStates && song.id !== state.activeSong?.id;
    nameEl.textContent = (isLoaded ? "🎵 " : "") + song.filename;

    const badge = document.createElement("span");
    badge.className = `song-status-badge status-${song.status}`;
    badge.textContent = statusLabel(song.status);

    const actions = document.createElement("div");
    actions.className = "song-actions";

    if (song.status === "ready") {
      const isLoaded = song.id in state.songStates;
      const loadBtn = document.createElement("button");
      loadBtn.className = "btn btn-sm btn-primary";
      loadBtn.textContent = isLoaded ? "Switch To" : "Load";
      if (isLoaded && song.id !== state.activeSong?.id) {
        loadBtn.title = "Switch back to this loaded song";
      }
      loadBtn.addEventListener("click", () => loadSong(song));
      actions.appendChild(loadBtn);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-icon";
    delBtn.title = "Delete song";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", () => deleteSong(song.id));
    actions.appendChild(delBtn);

    li.append(nameEl, badge, actions);
    songList.appendChild(li);
  }
}

function statusLabel(status) {
  return { uploaded: "Uploaded", splitting: "Splitting…", ready: "Ready", error: "Error" }[status] ?? status;
}

async function deleteSong(id) {
  if (!confirm("Delete this song and all its stems?")) return;
  await apiDelete(`/songs/${id}`);
  if (state.activeSong?.id === id) stopAll();
  await refreshSongList();
}

/* ==========================================================================
   Upload
   ========================================================================== */

browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) uploadFile(fileInput.files[0]);
});

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) uploadFile(file);
});

async function uploadFile(file) {
  uploadProgress.classList.remove("hidden");
  uploadBar.value = 0;
  uploadStatus.textContent = `Uploading ${file.name}…`;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const resp = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/songs`);
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) uploadBar.value = Math.round((e.loaded / e.total) * 100);
      });
      xhr.addEventListener("load", () => {
        if (xhr.status === 201) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      });
      xhr.addEventListener("error", () => reject(new Error("Network error")));
      xhr.send(formData);
    });

    uploadStatus.textContent = `✅ Uploaded! Splitting stems for "${resp.filename}"…`;
    await refreshSongList();
    startPolling(resp.id);
  } catch (e) {
    uploadStatus.textContent = `❌ ${e.message}`;
  }
}

function startPolling(songId) {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const song = await apiGet(`/songs/${songId}`);
      const idx = state.songs.findIndex((s) => s.id === songId);
      if (idx >= 0) state.songs[idx] = song;
      else state.songs.push(song);
      renderSongList();
      if (song.status === "ready" || song.status === "error") {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        uploadProgress.classList.add("hidden");
        if (song.status === "error") {
          uploadStatus.textContent = `❌ Stem splitting failed: ${song.error_message}`;
          uploadProgress.classList.remove("hidden");
        }
      }
    } catch (e) {
      console.error("Polling error:", e);
    }
  }, POLL_INTERVAL_MS);
}

/* ==========================================================================
   Per-song state persistence
   ========================================================================== */

function _saveSongState(songId) {
  if (!songId) return;
  const buffers = {};
  for (const [stem, node] of Object.entries(state.stemNodes)) {
    buffers[stem] = node.buffer;
  }
  const currentOffset = state.isPlaying
    ? state.startOffset + (state.audioCtx?.currentTime ?? 0) - state.startTime
    : state.startOffset;
  state.songStates[songId] = {
    buffers,
    pitch: state.activeVersion.pitch,
    tempo: state.activeVersion.tempo,
    volumes: { ...state.stemVolumes },
    mutes: { ...state.stemMuted },
    playbackOffset: currentOffset,
    loopEnabled: state.loopEnabled,
    loopStart: state.loopStart,
    loopEnd: state.loopEnd,
  };
  // Maintain LRU order
  const idx = state.songStatesOrder.indexOf(songId);
  if (idx >= 0) state.songStatesOrder.splice(idx, 1);
  state.songStatesOrder.push(songId);
  // Evict oldest if over limit
  while (state.songStatesOrder.length > MAX_SONG_STATES) {
    const oldest = state.songStatesOrder.shift();
    if (oldest !== state.activeSong?.id) {
      delete state.songStates[oldest];
    }
  }
}

async function _restoreStemNodes(song, saved) {
  if (!state.audioCtx) {
    state.audioCtx = new AudioContext();
  }
  state.stemNodes = {};
  for (const stem of song.stems) {
    const buffer = saved.buffers[stem];
    if (!buffer) continue;
    const gainNode = state.audioCtx.createGain();
    gainNode.gain.value = state.stemMuted[stem] ? 0 : state.stemVolumes[stem];
    gainNode.connect(state.audioCtx.destination);
    state.stemNodes[stem] = { buffer, gainNode, source: null };
  }
  const durations = Object.values(state.stemNodes).map((n) => n.buffer?.duration ?? 0);
  state.duration = Math.max(...durations, 0);
  seekSlider.max = state.duration;
}

/* ==========================================================================
   Player – loading
   ========================================================================== */

async function loadSong(song) {
  // Save current song state before switching
  if (state.activeSong && state.activeSong.id !== song.id) {
    _saveSongState(state.activeSong.id);
    stopAll();
  } else if (!state.activeSong) {
    stopAll();
  }

  // Stop version polling for previous song
  if (state.versionPollTimer) {
    clearInterval(state.versionPollTimer);
    state.versionPollTimer = null;
  }

  state.activeSong = song;
  playerTitle.textContent = song.filename;
  playerSection.classList.remove("hidden");

  // Check if we have saved state for this song
  const saved = state.songStates[song.id];
  if (saved && saved.buffers && Object.keys(saved.buffers).length > 0) {
    // Restore from saved state
    state.activeVersion = { pitch: saved.pitch, tempo: saved.tempo };
    state.pitch = saved.pitch;
    state.tempo = Math.round(saved.tempo * 100);
    pitchSlider.value = saved.pitch;
    pitchValue.textContent = String(saved.pitch);
    tempoSlider.value = Math.round(saved.tempo * 100);
    tempoValue.textContent = `${Math.round(saved.tempo * 100)}%`;
    state.startOffset = saved.playbackOffset;
    state.loopEnabled = saved.loopEnabled;
    state.loopStart = saved.loopStart;
    state.loopEnd = saved.loopEnd;

    renderStemCards(song.stems);
    // Restore volumes & mutes
    for (const stem of song.stems) {
      state.stemVolumes[stem] = saved.volumes[stem] ?? 1.0;
      state.stemMuted[stem] = saved.mutes[stem] ?? false;
      const slider = stemsGrid.querySelector(`.stem-vol-slider[data-stem="${stem}"]`);
      const output = stemsGrid.querySelector(`.stem-vol-output[data-stem="${stem}"]`);
      const muteBtn = stemsGrid.querySelector(`.stem-mute-btn[data-stem="${stem}"]`);
      if (slider) slider.value = Math.round(state.stemVolumes[stem] * 100);
      if (output) output.textContent = `${Math.round(state.stemVolumes[stem] * 100)}%`;
      if (muteBtn) {
        muteBtn.textContent = state.stemMuted[stem] ? "🔇" : "🔊";
        muteBtn.classList.toggle("muted", state.stemMuted[stem]);
      }
    }

    renderSongList();
    updateLoopUI();
    setLoadingState(true);
    try {
      // Re-wire audio nodes from saved buffers
      await _restoreStemNodes(song, saved);
      await fetchVersions(song.id);
    } finally {
      setLoadingState(false);
    }
    return;
  }

  // Fresh load
  state.activeVersion = { pitch: 0, tempo: 1.0 };
  pitchSlider.value = 0;
  pitchValue.textContent = "0";
  tempoSlider.value = 100;
  tempoValue.textContent = "100%";
  state.pitch = 0;
  state.tempo = 100;
  state.loopEnabled = false;
  state.loopStart = null;
  state.loopEnd = null;
  updateLoopUI();

  renderStemCards(song.stems);
  renderSongList();

  setLoadingState(true);
  try {
    await fetchAndDecodeStems(song, 0, 1);
    await fetchVersions(song.id);
  } finally {
    setLoadingState(false);
  }
}

function renderStemCards(stems) {
  stemsGrid.innerHTML = "";
  state.stemVolumes = {};
  state.stemMuted   = {};

  for (const stem of stems) {
    state.stemVolumes[stem] = 1.0;
    state.stemMuted[stem]   = false;

    const card = document.createElement("div");
    card.className = "stem-card";
    card.id = `stem-card-${stem}`;
    card.style.setProperty("--stem-color", `var(${STEM_COLORS[stem] ?? "--color-accent"})`);

    card.innerHTML = `
      <div class="stem-header">
        <span class="stem-label">${stem}</span>
        <button class="btn btn-sm btn-icon stem-mute-btn" data-stem="${stem}" title="Mute/unmute">🔊</button>
      </div>
      <div class="stem-volume-row">
        <span>Vol</span>
        <input type="range" class="stem-vol-slider" data-stem="${stem}"
               min="0" max="200" step="1" value="100" />
        <output class="stem-vol-output" data-stem="${stem}">100%</output>
      </div>
    `;

    stemsGrid.appendChild(card);
  }

  // Attach volume listeners
  stemsGrid.querySelectorAll(".stem-vol-slider").forEach((slider) => {
    slider.addEventListener("input", (e) => {
      const stem = e.target.dataset.stem;
      const vol  = parseFloat(e.target.value) / 100;
      state.stemVolumes[stem] = vol;
      stemsGrid.querySelector(`.stem-vol-output[data-stem="${stem}"]`).textContent = `${e.target.value}%`;
      applyGain(stem, vol);
    });
  });

  // Attach mute listeners
  stemsGrid.querySelectorAll(".stem-mute-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const stem = e.target.dataset.stem;
      state.stemMuted[stem] = !state.stemMuted[stem];
      e.target.textContent = state.stemMuted[stem] ? "🔇" : "🔊";
      e.target.classList.toggle("muted", state.stemMuted[stem]);
      applyGain(stem, state.stemMuted[stem] ? 0 : state.stemVolumes[stem]);
    });
  });
}

/* ==========================================================================
   Player – Audio loading & decoding
   ========================================================================== */

async function fetchAndDecodeStems(song, pitchSemitones, tempoRatio) {
  if (!state.audioCtx) {
    state.audioCtx = new AudioContext();
  }

  const useProcessed = pitchSemitones !== 0 || tempoRatio !== 1;

  const fetches = song.stems.map(async (stem) => {
    let url;
    if (useProcessed) {
      // Trigger server-side processing
      try {
        await apiPost(`/songs/${song.id}/stems/${stem}/process`, {
          pitch_semitones: pitchSemitones,
          tempo_ratio: tempoRatio,
        });
        url = processedStemUrl(song.id, stem, pitchSemitones, tempoRatio);
      } catch (e) {
        console.warn(`Processing stem ${stem} failed:`, e);
        url = stemUrl(song.id, stem);
      }
    } else {
      url = stemUrl(song.id, stem);
    }

    const resp  = await fetch(url);
    const buf   = await resp.arrayBuffer();
    const audio = await state.audioCtx.decodeAudioData(buf);
    return { stem, audio };
  });

  const results = await Promise.all(fetches);

  // Wire up gain nodes
  state.stemNodes = {};
  for (const { stem, audio } of results) {
    const gainNode = state.audioCtx.createGain();
    gainNode.gain.value = state.stemMuted[stem] ? 0 : state.stemVolumes[stem];
    gainNode.connect(state.audioCtx.destination);
    state.stemNodes[stem] = { buffer: audio, gainNode, source: null };
  }

  state.duration = Math.max(...results.map((r) => r.audio.duration));
  seekSlider.max = state.duration;
}

/* ==========================================================================
   Player – Playback
   ========================================================================== */

playPauseBtn.addEventListener("click", togglePlay);
stopBtn.addEventListener("click", stopAll);
seekSlider.addEventListener("input", () => {
  if (state.isPlaying) {
    pauseAll();
    state.startOffset = parseFloat(seekSlider.value);
    playAll(state.startOffset);
  } else {
    state.startOffset = parseFloat(seekSlider.value);
  }
});

/* ---------- A-B loop ---------- */

loopToggleBtn.addEventListener("click", () => {
  state.loopEnabled = !state.loopEnabled;
  if (state.loopEnabled && state.loopStart === null) {
    state.loopStart = 0;
    state.loopEnd = state.duration;
  }
  updateLoopUI();
  if (state.isPlaying) {
    const offset = state.startOffset + (state.audioCtx.currentTime - state.startTime);
    stopSources();
    state.startOffset = offset;
    state.startTime = state.audioCtx?.currentTime ?? 0;
    playAll(offset);
  }
});

loopABtn.addEventListener("click", () => {
  const pos = state.isPlaying
    ? state.startOffset + (state.audioCtx.currentTime - state.startTime)
    : state.startOffset;
  state.loopStart = Math.min(pos, state.loopEnd ?? state.duration);
  updateLoopUI();
  if (state.isPlaying) {
    stopSources();
    playAll(state.loopStart);
  }
});

loopBBtn.addEventListener("click", () => {
  const pos = state.isPlaying
    ? state.startOffset + (state.audioCtx.currentTime - state.startTime)
    : state.startOffset;
  state.loopEnd = Math.max(pos, state.loopStart ?? 0);
  updateLoopUI();
  if (state.isPlaying) {
    const offset = Math.min(state.startOffset, state.loopEnd);
    stopSources();
    playAll(offset);
  }
});

loopClearBtn.addEventListener("click", () => {
  state.loopEnabled = false;
  state.loopStart = null;
  state.loopEnd = null;
  updateLoopUI();
  if (state.isPlaying) {
    const offset = state.startOffset + (state.audioCtx.currentTime - state.startTime);
    stopSources();
    state.startOffset = offset;
    state.startTime = state.audioCtx?.currentTime ?? 0;
    playAll(offset);
  }
});

function updateLoopUI() {
  const active = state.loopEnabled;
  loopToggleBtn.classList.toggle("btn-primary", active);
  loopToggleBtn.classList.toggle("btn-secondary", !active);
  loopABtn.disabled = !active;
  loopBBtn.disabled = !active;
  loopClearBtn.disabled = !active;
  if (active && state.loopStart !== null && state.loopEnd !== null) {
    loopDisplay.textContent = `A: ${fmtTime(state.loopStart)} – B: ${fmtTime(state.loopEnd)}`;
    loopDisplay.classList.remove("hidden");
  } else {
    loopDisplay.classList.add("hidden");
  }
}

function togglePlay() {
  if (state.isPlaying) {
    pauseAll();
  } else {
    playAll(state.startOffset);
  }
}

function playAll(offset = 0) {
  if (!state.audioCtx) return;
  if (state.audioCtx.state === "suspended") state.audioCtx.resume();

  for (const [stem, node] of Object.entries(state.stemNodes)) {
    const source = state.audioCtx.createBufferSource();
    source.buffer = node.buffer;
    source.connect(node.gainNode);
    if (state.loopEnabled && state.loopStart !== null && state.loopEnd !== null) {
      source.loop = true;
      source.loopStart = state.loopStart;
      source.loopEnd = state.loopEnd;
      // Clamp offset to loop region
      const startFrom = Math.max(state.loopStart, Math.min(offset, state.loopEnd));
      source.start(0, startFrom);
    } else {
      source.start(0, offset);
    }
    source.onended = () => { if (stem === Object.keys(state.stemNodes)[0]) onPlaybackEnded(); };
    node.source = source;
  }

  state.startOffset = (state.loopEnabled && state.loopStart !== null)
    ? Math.max(state.loopStart, Math.min(offset, state.loopEnd ?? state.duration))
    : offset;
  state.startTime   = state.audioCtx.currentTime;
  state.isPlaying   = true;
  playPauseBtn.textContent = "⏸ Pause";
  startSeekTimer();
}

function pauseAll() {
  state.startOffset += state.audioCtx.currentTime - state.startTime;
  stopSources();
  state.isPlaying = false;
  playPauseBtn.textContent = "▶ Play All";
  stopSeekTimer();
}

function stopAll() {
  stopSources();
  state.isPlaying   = false;
  state.startOffset = 0;
  seekSlider.value  = 0;
  timeDisplay.textContent = `0:00 / ${fmtTime(state.duration)}`;
  playPauseBtn.textContent = "▶ Play All";
  stopSeekTimer();
}

function stopSources() {
  for (const node of Object.values(state.stemNodes)) {
    try { node.source?.stop(); } catch (_) { /* already stopped */ }
    node.source = null;
  }
}

function onPlaybackEnded() {
  if (!state.isPlaying) return;
  stopAll();
}

/* ---------- Seek timer ---------- */
function startSeekTimer() {
  stopSeekTimer();
  state.seekTimer = setInterval(() => {
    if (!state.isPlaying) return;
    const elapsed = state.startOffset + (state.audioCtx.currentTime - state.startTime);
    // When loop is enabled, clamp to loop end and display loop region
    if (state.loopEnabled && state.loopEnd !== null && elapsed >= state.loopEnd) {
      // AudioBufferSourceNode handles the actual looping; just clamp display
      const clamped = state.loopEnd;
      seekSlider.value = clamped;
      timeDisplay.textContent = `${fmtTime(clamped)} / ${fmtTime(state.duration)}`;
      return;
    }
    const clamped = Math.min(elapsed, state.duration);
    seekSlider.value = clamped;
    timeDisplay.textContent = `${fmtTime(clamped)} / ${fmtTime(state.duration)}`;
  }, 250);
}

function stopSeekTimer() {
  if (state.seekTimer) { clearInterval(state.seekTimer); state.seekTimer = null; }
}

/* ---------- Gain helper ---------- */
function applyGain(stem, value) {
  const node = state.stemNodes[stem];
  if (node?.gainNode) node.gainNode.gain.setTargetAtTime(value, state.audioCtx.currentTime, 0.05);
}

/* ==========================================================================
   Pitch & Tempo controls
   ========================================================================== */

pitchSlider.addEventListener("input", () => {
  pitchValue.textContent = pitchSlider.value;
  state.pitch = parseFloat(pitchSlider.value);
});

tempoSlider.addEventListener("input", () => {
  tempoValue.textContent = tempoSlider.value + "%";
  state.tempo = parseFloat(tempoSlider.value);
});

applyBtn.addEventListener("click", async () => {
  if (!state.activeSong || state.isLoading) return;
  const wasPlaying = state.isPlaying;
  const savedOffset = wasPlaying
    ? state.startOffset + (state.audioCtx.currentTime - state.startTime)
    : state.startOffset;
  stopAll();

  applyBtn.disabled = true;
  applyBtn.textContent = "Processing…";
  setLoadingState(true);

  try {
    const pitchSemitones = state.pitch;
    const tempoRatio = state.tempo / 100;
    await fetchAndDecodeStems(state.activeSong, pitchSemitones, tempoRatio);
    state.activeVersion = { pitch: pitchSemitones, tempo: tempoRatio };
    await fetchVersions(state.activeSong.id);
    if (wasPlaying) playAll(savedOffset);
  } catch (e) {
    alert(`Processing failed: ${e.message}`);
  } finally {
    setLoadingState(false);
    applyBtn.disabled = false;
    applyBtn.textContent = "Apply";
  }
});

cacheBtn.addEventListener("click", async () => {
  if (!state.activeSong || state.isLoading) return;
  const pitchSemitones = state.pitch;
  const tempoRatio = state.tempo / 100;

  cacheBtn.disabled = true;
  cacheBtn.textContent = "Caching…";
  try {
    const result = await apiPost(`/songs/${state.activeSong.id}/versions`, {
      pitch_semitones: pitchSemitones,
      tempo_ratio: tempoRatio,
    });
    if (result.status === "ready") {
      // Already cached – just switch to it
      await fetchVersions(state.activeSong.id);
      await selectVersion(pitchSemitones, tempoRatio);
    } else {
      // Processing in background – add optimistic entry and start polling
      const optimistic = {
        pitch_semitones: pitchSemitones,
        tempo_ratio: tempoRatio,
        is_default: false,
        status: "processing",
        stem_count: 0,
        accessed_at: null,
      };
      state.versions = [...state.versions.filter(
        (v) => !(v.pitch_semitones === pitchSemitones && v.tempo_ratio === tempoRatio)
      ), optimistic];
      renderVersions();
      startVersionPolling(state.activeSong.id);
    }
  } catch (e) {
    alert(`Caching failed: ${e.message}`);
  } finally {
    cacheBtn.disabled = false;
    cacheBtn.textContent = "Cache Version";
  }
});

resetBtn.addEventListener("click", async () => {
  pitchSlider.value = 0;
  pitchValue.textContent = "0";
  tempoSlider.value = 100;
  tempoValue.textContent = "100%";
  state.pitch = 0;
  state.tempo = 100;
  if (!state.activeSong || state.isLoading) return;
  const wasPlaying = state.isPlaying;
  const savedOffset = wasPlaying
    ? state.startOffset + (state.audioCtx.currentTime - state.startTime)
    : state.startOffset;
  stopAll();
  state.activeVersion = { pitch: 0, tempo: 1.0 };
  setLoadingState(true);
  try {
    await fetchAndDecodeStems(state.activeSong, 0, 1);
    renderVersions();
    if (wasPlaying) playAll(savedOffset);
  } finally {
    setLoadingState(false);
  }
});

/* ==========================================================================
   Utilities
   ========================================================================== */

function fmtTime(secs) {
  if (!isFinite(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fmtRelTime(isoStr) {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

/* ==========================================================================
   Refresh button & initial load
   ========================================================================== */

refreshBtn.addEventListener("click", refreshSongList);

document.addEventListener("DOMContentLoaded", () => {
  updateLoopUI();
  refreshSongList();
});
