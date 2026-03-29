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
  startOffset: 0,      // seconds into the track we started at
  startTime: 0,        // audioCtx.currentTime when play was pressed
  duration: 0,         // seconds
  seekTimer: null,
  pollTimer: null,
  pitch: 0,
  tempo: 100,
  stemVolumes: {},     // { stemName: float 0-2 }
  stemMuted: {},       // { stemName: bool }
  pendingProcess: false,
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
    nameEl.textContent = song.filename;

    const badge = document.createElement("span");
    badge.className = `song-status-badge status-${song.status}`;
    badge.textContent = statusLabel(song.status);

    const actions = document.createElement("div");
    actions.className = "song-actions";

    if (song.status === "ready") {
      const loadBtn = document.createElement("button");
      loadBtn.className = "btn btn-sm btn-primary";
      loadBtn.textContent = "Load";
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

browseBtn.addEventListener("click", () => fileInput.click());
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
   Player – loading
   ========================================================================== */

async function loadSong(song) {
  stopAll();
  state.activeSong = song;
  playerTitle.textContent = song.filename;
  playerSection.classList.remove("hidden");

  // Reset controls
  pitchSlider.value = 0;
  pitchValue.textContent = "0";
  tempoSlider.value = 100;
  tempoValue.textContent = "100%";
  state.pitch = 0;
  state.tempo = 100;

  renderStemCards(song.stems);
  renderSongList(); // update active highlight

  await fetchAndDecodeStems(song, 0, 1);
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
    source.start(0, offset);
    source.onended = () => { if (stem === Object.keys(state.stemNodes)[0]) onPlaybackEnded(); };
    node.source = source;
  }

  state.startOffset = offset;
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
  if (!state.activeSong) return;
  const wasPlaying = state.isPlaying;
  const savedOffset = wasPlaying
    ? state.startOffset + (state.audioCtx.currentTime - state.startTime)
    : state.startOffset;
  stopAll();

  applyBtn.disabled = true;
  applyBtn.textContent = "Processing…";

  try {
    await fetchAndDecodeStems(state.activeSong, state.pitch, state.tempo / 100);
    if (wasPlaying) playAll(savedOffset);
  } catch (e) {
    alert(`Processing failed: ${e.message}`);
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = "Apply Pitch & Tempo";
  }
});

resetBtn.addEventListener("click", async () => {
  pitchSlider.value = 0;
  pitchValue.textContent = "0";
  tempoSlider.value = 100;
  tempoValue.textContent = "100%";
  state.pitch = 0;
  state.tempo = 100;
  if (!state.activeSong) return;
  const wasPlaying = state.isPlaying;
  const savedOffset = wasPlaying
    ? state.startOffset + (state.audioCtx.currentTime - state.startTime)
    : state.startOffset;
  stopAll();
  await fetchAndDecodeStems(state.activeSong, 0, 1);
  if (wasPlaying) playAll(savedOffset);
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

/* ==========================================================================
   Refresh button & initial load
   ========================================================================== */

refreshBtn.addEventListener("click", refreshSongList);

document.addEventListener("DOMContentLoaded", () => {
  refreshSongList();
});
