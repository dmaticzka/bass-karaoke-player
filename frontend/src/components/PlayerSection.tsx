import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { api } from "../api/client";
import * as eng from "../audio/engine";
import * as audioCache from "../audio/audioCache";
import { GlobalControls } from "./GlobalControls";
import { StemsStack } from "./StemsStack";
import { PlaybackBar } from "./PlaybackBar";
import { VersionsPicker } from "./VersionsPicker";
import type { StemName, Version } from "../types";
import { getSongArtist, getSongTitle } from "../utils/songDisplay";

const POLL_MS = 2000;
const LAST_SELECTED_VERSIONS_KEY = "bass-karaoke-player:last-selected-versions";

type LastSelectedVersion = { pitch: number; tempo: number };
type LastSelectedVersionsBySong = Record<string, LastSelectedVersion>;

const readLastSelectedVersions = (): LastSelectedVersionsBySong => {
  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_VERSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const result: LastSelectedVersionsBySong = {};
    for (const [songId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const pitch = (value as { pitch?: unknown }).pitch;
      const tempo = (value as { tempo?: unknown }).tempo;
      if (typeof pitch === "number" && typeof tempo === "number") {
        result[songId] = { pitch, tempo };
      }
    }
    return result;
  } catch {
    return {};
  }
};

export function PlayerSection() {
  const activeSong = usePlayerStore((s) => s.activeSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const setIsLoading = usePlayerStore((s) => s.setIsLoading);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setStartOffset = usePlayerStore((s) => s.setStartOffset);
  const setStartTime = usePlayerStore((s) => s.setStartTime);
  const setVersions = usePlayerStore((s) => s.setVersions);
  const setPitch = usePlayerStore((s) => s.setPitch);
  const setTempo = usePlayerStore((s) => s.setTempo);
  const setActiveVersion = usePlayerStore((s) => s.setActiveVersion);
  const initStemControls = usePlayerStore((s) => s.initStemControls);
  const globalEq = usePlayerStore((s) => s.globalEq);
  const isLoading = usePlayerStore((s) => s.isLoading);

  const pitch = usePlayerStore((s) => s.pitch);
  const tempo = usePlayerStore((s) => s.tempo);
  const startOffset = usePlayerStore((s) => s.startOffset);
  const duration = usePlayerStore((s) => s.duration);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const loopStart = usePlayerStore((s) => s.loopStart);
  const loopEnd = usePlayerStore((s) => s.loopEnd);
  const setLoopEnabled = usePlayerStore((s) => s.setLoopEnabled);
  const setLoopStart = usePlayerStore((s) => s.setLoopStart);
  const setLoopEnd = usePlayerStore((s) => s.setLoopEnd);
  const activeVersion = usePlayerStore((s) => s.activeVersion);
  const [stemsCollapsed, setStemsCollapsed] = useState(false);

  const versionPollRef = useRef<number | null>(null);
  const loadRequestRef = useRef(0);
  const lastSelectedVersionsRef = useRef<LastSelectedVersionsBySong>(
    readLastSelectedVersions(),
  );
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const persistLastSelectedVersion = (
    songId: string,
    pitchSemitones: number,
    tempoRatio: number,
  ) => {
    lastSelectedVersionsRef.current = {
      ...lastSelectedVersionsRef.current,
      [songId]: { pitch: pitchSemitones, tempo: tempoRatio },
    };
    try {
      window.localStorage.setItem(
        LAST_SELECTED_VERSIONS_KEY,
        JSON.stringify(lastSelectedVersionsRef.current),
      );
    } catch {
      // ignore
    }
  };

  const applyVersions = (versions: Version[]) => {
    setVersions(versions);
    const hasProcessing = versions.some(
      (v) => v.status === "processing" || v.status === "partial",
    );
    if (hasProcessing) startVersionPolling();
    else stopVersionPolling();
  };

  const resolvePreferredVersion = (
    songId: string,
    versions: Version[],
  ): LastSelectedVersion => {
    const saved = lastSelectedVersionsRef.current[songId];
    if (!saved) return { pitch: 0, tempo: 1.0 };

    const matched = versions.find(
      (v) =>
        v.pitch_semitones === saved.pitch &&
        v.tempo_ratio === saved.tempo &&
        v.status !== "processing",
    );
    if (!matched) return { pitch: 0, tempo: 1.0 };
    return { pitch: matched.pitch_semitones, tempo: matched.tempo_ratio };
  };

  const beginLoadRequest = () => {
    loadRequestRef.current += 1;
    return loadRequestRef.current;
  };

  // -----------------------------------------------------------------------
  // Stem loading
  // -----------------------------------------------------------------------
  const fetchAndDecodeStems = async (
    pitchSemitones: number,
    tempoRatio: number,
  ) => {
    if (!activeSong) return;
    const requestId = loadRequestRef.current;
    const ctx = eng.getOrCreateCtx();
    eng.clearStemNodes();

    const useProcessed = pitchSemitones !== 0 || tempoRatio !== 1;

    const results = await Promise.all(
      activeSong.stems.map(async (stem) => {
        let url: string;
        if (useProcessed) {
          try {
            await api.processStem(activeSong.id, stem, {
              pitch_semitones: pitchSemitones,
              tempo_ratio: tempoRatio,
            });
            url = api.processedStemUrl(activeSong.id, stem, pitchSemitones, tempoRatio);
          } catch {
            url = api.stemUrl(activeSong.id, stem);
          }
        } else {
          url = api.stemUrl(activeSong.id, stem);
        }
        let encoded = audioCache.get(url);
        if (encoded === undefined) {
          const resp = await fetch(url);
          encoded = await resp.arrayBuffer();
          audioCache.set(url, encoded);
        }
        // decodeAudioData may consume/mutate input buffers in some engines; the
        // cache returns a copy and fresh fetches use request-scoped buffers.
        const audio = await ctx.decodeAudioData(encoded);
        return { stem, audio };
      }),
    );

    if (requestId !== loadRequestRef.current) return;

    const stemVolumes = usePlayerStore.getState().stemVolumes;
    const stemMuted = usePlayerStore.getState().stemMuted;

    for (const { stem, audio } of results) {
      const vol = stemMuted[stem] ? 0 : (stemVolumes[stem] ?? 1);
      eng.wireStemNode(stem as StemName, audio, vol, globalEq);
    }

    const dur = eng.getDuration();
    setDuration(dur);
  };

  // -----------------------------------------------------------------------
  // Versions
  // -----------------------------------------------------------------------
  const fetchVersions = async () => {
    if (!activeSong) return;
    try {
      const data = await api.getVersions(activeSong.id);
      applyVersions(data.versions);
    } catch {
      // ignore
    }
  };

  const startVersionPolling = () => {
    if (versionPollRef.current) return;
    versionPollRef.current = window.setInterval(async () => {
      if (!activeSong) return;
      try {
        const data = await api.getVersions(activeSong.id);
        applyVersions(data.versions);
      } catch {
        // ignore
      }
    }, POLL_MS);
  };

  const stopVersionPolling = () => {
    if (versionPollRef.current) {
      clearInterval(versionPollRef.current);
      versionPollRef.current = null;
    }
  };

  // Clean up polling on unmount
  useEffect(() => {
    return () => stopVersionPolling();
  }, []);

  // -----------------------------------------------------------------------
  // Playback controls
  // -----------------------------------------------------------------------
  const getCurrentPos = () => {
    const s = usePlayerStore.getState();
    return s.isPlaying
      ? s.startOffset + (eng.currentTime() - s.startTime)
      : s.startOffset;
  };

  const startSeekTimer = () => {
    eng.startSeekTimer(getCurrentPos, (elapsed) => {
      const s = usePlayerStore.getState();
      if (!s.isPlaying) return;
      if (s.loopEnabled && s.loopEnd !== null && elapsed >= s.loopEnd) {
        setStartOffset(s.loopStart ?? 0);
        setStartTime(eng.currentTime());
        return;
      }
      const clamped = Math.min(elapsed, s.duration);
      setStartOffset(clamped);
      setStartTime(eng.currentTime());
    });
  };

  const playAll = (offset: number) => {
    const s = usePlayerStore.getState();
    eng.playAll(offset, s.loopEnabled, s.loopStart, s.loopEnd);

    const effectiveOffset =
      s.loopEnabled && s.loopStart !== null
        ? Math.max(s.loopStart, Math.min(offset, s.loopEnd ?? s.duration))
        : offset;

    setStartOffset(effectiveOffset);
    setStartTime(eng.currentTime());
    setIsPlaying(true);
    startSeekTimer();
  };

  const pauseAll = () => {
    const s = usePlayerStore.getState();
    const newOffset = s.startOffset + (eng.currentTime() - s.startTime);
    setStartOffset(newOffset);
    eng.stopSources();
    eng.stopSeekTimer();
    setIsPlaying(false);
  };

  const stopAll = () => {
    eng.stopSources();
    eng.stopSeekTimer();
    setIsPlaying(false);
    setStartOffset(0);
  };

  const handlePlayPause = () => {
    if (isPlaying) pauseAll();
    else playAll(startOffset);
  };

  const handleStop = () => stopAll();

  const handleSeek = (val: number) => {
    setStartOffset(val);
    if (isPlaying) {
      eng.stopSources();
      eng.stopSeekTimer();
      playAll(val);
    }
  };

  const handleSeekRelative = (delta: number) => {
    const s = usePlayerStore.getState();
    const current = s.isPlaying
      ? s.startOffset + (eng.currentTime() - s.startTime)
      : s.startOffset;
    const newPos = Math.max(0, Math.min(current + delta, s.duration));
    handleSeek(newPos);
  };

  // -----------------------------------------------------------------------
  // Loop controls
  // -----------------------------------------------------------------------
  const handleLoopToggle = () => {
    const newEnabled = !loopEnabled;
    if (newEnabled && loopStart === null) {
      setLoopStart(0);
      setLoopEnd(duration);
    }
    setLoopEnabled(newEnabled);
    if (isPlaying) {
      const offset = getCurrentPos();
      eng.stopSources();
      eng.stopSeekTimer();
      const s = usePlayerStore.getState();
      eng.playAll(offset, s.loopEnabled, s.loopStart, s.loopEnd);
      setStartOffset(offset);
      setStartTime(eng.currentTime());
      startSeekTimer();
    }
  };

  const handleLoopSetA = () => {
    const pos = getCurrentPos();
    const newStart = Math.min(pos, loopEnd ?? duration);
    setLoopStart(newStart);
    if (isPlaying) {
      eng.stopSources();
      eng.stopSeekTimer();
      playAll(newStart);
    }
  };

  const handleLoopSetB = () => {
    const pos = getCurrentPos();
    const newEnd = Math.max(pos, loopStart ?? 0);
    setLoopEnd(newEnd);
    if (isPlaying) {
      eng.stopSources();
      eng.stopSeekTimer();
      const offset = Math.min(startOffset, newEnd);
      playAll(offset);
    }
  };

  const handleLoopClear = () => {
    setLoopEnabled(false);
    setLoopStart(null);
    setLoopEnd(null);
    if (isPlaying) {
      const offset = getCurrentPos();
      eng.stopSources();
      eng.stopSeekTimer();
      eng.playAll(offset, false, null, null);
      setStartOffset(offset);
      setStartTime(eng.currentTime());
      startSeekTimer();
    }
  };

  // -----------------------------------------------------------------------
  // Global controls (pitch/tempo)
  // -----------------------------------------------------------------------
  const handleApply = async () => {
    if (!activeSong) return;
    const wasPlaying = isPlaying;
    const savedOffset = getCurrentPos();
    const requestId = beginLoadRequest();
    stopAll();
    setIsLoading(true);
    try {
      const pitchSemitones = pitch;
      const tempoRatio = tempo / 100;
      await fetchAndDecodeStems(pitchSemitones, tempoRatio);
      if (requestId !== loadRequestRef.current) return;
      setActiveVersion(pitchSemitones, tempoRatio);
      persistLastSelectedVersion(activeSong.id, pitchSemitones, tempoRatio);
      await fetchVersions();
      if (requestId === loadRequestRef.current && wasPlaying) playAll(savedOffset);
    } catch (e) {
      console.error("Apply failed:", e);
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setPitch(0);
    setTempo(100);
    if (!activeSong) return;
    const wasPlaying = isPlaying;
    const savedOffset = getCurrentPos();
    const requestId = beginLoadRequest();
    stopAll();
    setActiveVersion(0, 1.0);
    persistLastSelectedVersion(activeSong.id, 0, 1.0);
    setIsLoading(true);
    try {
      await fetchAndDecodeStems(0, 1);
      if (requestId !== loadRequestRef.current) return;
      await fetchVersions();
      if (requestId === loadRequestRef.current && wasPlaying) playAll(savedOffset);
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  };

  const handleSelectVersion = async (vPitch: number, vTempo: number) => {
    if (
      activeVersion.pitch === vPitch &&
      activeVersion.tempo === vTempo
    )
      return;
    const wasPlaying = isPlaying;
    const savedOffset = getCurrentPos();
    const requestId = beginLoadRequest();
    stopAll();
    setPitch(vPitch);
    setTempo(Math.round(vTempo * 100));
    setActiveVersion(vPitch, vTempo);
    if (activeSong) persistLastSelectedVersion(activeSong.id, vPitch, vTempo);
    setIsLoading(true);
    try {
      await fetchAndDecodeStems(vPitch, vTempo);
      if (requestId === loadRequestRef.current && wasPlaying) playAll(savedOffset);
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Load song (called from App when a song is selected from the list)
  // -----------------------------------------------------------------------
  // This effect runs whenever activeSong changes to load stems
  const prevSongId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSong) return;
    if (prevSongId.current === activeSong.id) return;
    prevSongId.current = activeSong.id;

    stopVersionPolling();
    stopAll();
    setPitch(0);
    setTempo(100);
    setActiveVersion(0, 1.0);
    setLoopEnabled(false);
    setLoopStart(null);
    setLoopEnd(null);
    initStemControls(activeSong.stems);
    setVersions([]);

    const requestId = beginLoadRequest();
    setIsLoading(true);
    void (async () => {
      let targetPitch = 0;
      let targetTempo = 1.0;
      try {
        const versionsData = await api.getVersions(activeSong.id);
        if (requestId !== loadRequestRef.current) return;
        applyVersions(versionsData.versions);
        const preferred = resolvePreferredVersion(activeSong.id, versionsData.versions);
        targetPitch = preferred.pitch;
        targetTempo = preferred.tempo;
      } catch {
        if (requestId !== loadRequestRef.current) return;
        stopVersionPolling();
      }

      if (requestId !== loadRequestRef.current) return;
      setPitch(targetPitch);
      setTempo(Math.round(targetTempo * 100));
      setActiveVersion(targetPitch, targetTempo);
      persistLastSelectedVersion(activeSong.id, targetPitch, targetTempo);

      try {
        await fetchAndDecodeStems(targetPitch, targetTempo);
      } finally {
        if (requestId === loadRequestRef.current) setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSong?.id]);

  if (!activeSong) {
    // Always render in DOM for E2E compatibility; hidden state via className
    return (
      <section id="player-section" className="card hidden">
        <h2 id="player-title" />
        {/* Sliders must be in DOM for E2E to_be_attached() checks */}
        <div style={{ display: "none" }}>
          <input id="pitch-slider" type="range" min={-12} max={12} readOnly />
          <input id="tempo-slider" type="range" min={25} max={200} readOnly />
          <button id="apply-btn" />
          <button id="reset-btn" />
          <button id="play-pause-btn" />
          <button id="stop-btn" />
        </div>
      </section>
    );
  }

  return (
    <section id="player-section" className="card">
      <h2 id="player-title" className="player-song-title">
        <span className="song-artist">{getSongArtist(activeSong)}</span>
        <span className="song-title">{getSongTitle(activeSong)}</span>
      </h2>

      <GlobalControls
        onApply={handleApply}
        onReset={handleReset}
      />

      <VersionsPicker onSelectVersion={handleSelectVersion} />

      <div className="stems-section">
        <div
          className="collapsible-header"
          onClick={() => setStemsCollapsed(!stemsCollapsed)}
        >
          <h3 className="sub-section-heading">Stem Volumes</h3>
          <button
            className="collapsible-toggle"
            aria-label={stemsCollapsed ? "Expand stem volumes" : "Collapse stem volumes"}
          >
            <span className={`chevron${stemsCollapsed ? " collapsed" : ""}`}>▼</span>
          </button>
        </div>
        <div className={`collapsible-body ${stemsCollapsed ? "collapsed" : "expanded"}`}>
          <StemsStack
            stems={activeSong.stems}
            loading={isLoading}
          />
        </div>
      </div>

      <PlaybackBar
        onPlayPause={handlePlayPause}
        onStop={handleStop}
        onSeek={handleSeek}
        onSeekRelative={handleSeekRelative}
        onLoopToggle={handleLoopToggle}
        onLoopSetA={handleLoopSetA}
        onLoopSetB={handleLoopSetB}
        onLoopClear={handleLoopClear}
      />
    </section>
  );
}
