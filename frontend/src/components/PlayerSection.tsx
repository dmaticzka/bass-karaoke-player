import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/playerStore";
import { api } from "../api/client";
import * as eng from "../audio/engine";
import { GlobalControls } from "./GlobalControls";
import { StemsStack } from "./StemsStack";
import { PlaybackBar } from "./PlaybackBar";
import { VersionsPicker } from "./VersionsPicker";
import type { StemName } from "../types";

const POLL_MS = 2000;

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

  const versionPollRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // -----------------------------------------------------------------------
  // Stem loading
  // -----------------------------------------------------------------------
  const fetchAndDecodeStems = async (
    pitchSemitones: number,
    tempoRatio: number,
  ) => {
    if (!activeSong) return;
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
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf);
        return { stem, audio };
      }),
    );

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
      setVersions(data.versions);
      const hasProcessing = data.versions.some(
        (v) => v.status === "processing" || v.status === "partial",
      );
      if (hasProcessing) startVersionPolling();
      else stopVersionPolling();
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
        setVersions(data.versions);
        const hasProcessing = data.versions.some(
          (v) => v.status === "processing" || v.status === "partial",
        );
        if (!hasProcessing) stopVersionPolling();
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
        setStartOffset(s.loopEnd);
        return;
      }
      const clamped = Math.min(elapsed, s.duration);
      setStartOffset(clamped);
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
    stopAll();
    setIsLoading(true);
    try {
      const pitchSemitones = pitch;
      const tempoRatio = tempo / 100;
      await fetchAndDecodeStems(pitchSemitones, tempoRatio);
      setActiveVersion(pitchSemitones, tempoRatio);
      await fetchVersions();
      if (wasPlaying) playAll(savedOffset);
    } catch (e) {
      console.error("Apply failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setPitch(0);
    setTempo(100);
    if (!activeSong) return;
    const wasPlaying = isPlaying;
    const savedOffset = getCurrentPos();
    stopAll();
    setActiveVersion(0, 1.0);
    setIsLoading(true);
    try {
      await fetchAndDecodeStems(0, 1);
      await fetchVersions();
      if (wasPlaying) playAll(savedOffset);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCache = async () => {
    if (!activeSong) return;
    const pitchSemitones = pitch;
    const tempoRatio = tempo / 100;
    try {
      const result = await api.createVersion(activeSong.id, {
        pitch_semitones: pitchSemitones,
        tempo_ratio: tempoRatio,
      });
      if (result.status === "ready") {
        await fetchVersions();
        await handleSelectVersion(pitchSemitones, tempoRatio);
      } else {
        startVersionPolling();
        await fetchVersions();
      }
    } catch (e) {
      console.error("Cache failed:", e);
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
    stopAll();
    setPitch(vPitch);
    setTempo(Math.round(vTempo * 100));
    setActiveVersion(vPitch, vTempo);
    setIsLoading(true);
    try {
      await fetchAndDecodeStems(vPitch, vTempo);
      if (wasPlaying) playAll(savedOffset);
    } finally {
      setIsLoading(false);
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

    setIsLoading(true);
    void fetchAndDecodeStems(0, 1)
      .then(() => fetchVersions())
      .finally(() => setIsLoading(false));
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
      <h2 id="player-title">{activeSong.filename}</h2>

      <GlobalControls
        onApply={handleApply}
        onReset={handleReset}
        onCache={handleCache}
      />

      <VersionsPicker onSelectVersion={handleSelectVersion} />

      <StemsStack
        stems={activeSong.stems}
        loading={usePlayerStore.getState().isLoading}
      />

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
