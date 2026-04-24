import { create } from "zustand";
import type { AppTab, EqBand, ServerConfig, Song, Version } from "../types";
import { DEFAULT_EQ_BANDS } from "../types";

export type EqMode = "global" | "per-stem";
export type SongSortOrder = "alphabetical" | "recent";

interface PlayerState {
  // Song list
  songs: Song[];
  // Active song
  activeSong: Song | null;
  // Playback
  isPlaying: boolean;
  isLoading: boolean;
  startOffset: number;
  startTime: number; // audioCtx.currentTime when play pressed
  duration: number;
  // Controls
  pitch: number; // semitones
  tempo: number; // percentage (100 = normal)
  stemVolumes: Record<string, number>;
  stemMuted: Record<string, boolean>;
  // Active version
  activeVersion: { pitch: number; tempo: number };
  // Versions list
  versions: Version[];
  // A-B loop
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  // EQ
  eqMode: EqMode;
  activeStemForEq: string | null;
  globalEq: EqBand[];
  stemEq: Record<string, EqBand[]>;
  // Server config
  serverConfig: ServerConfig;
  // Navigation
  activeTab: AppTab;
  // Upload state
  uploadProgress: number | null; // 0–100 or null when idle
  uploadStatus: string;
  // Song sort order
  songSortOrder: SongSortOrder;
}

interface PlayerActions {
  setSongs: (songs: Song[]) => void;
  updateSong: (song: Song) => void;
  setActiveSong: (song: Song | null) => void;
  setIsPlaying: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setStartOffset: (v: number) => void;
  setStartTime: (v: number) => void;
  setDuration: (v: number) => void;
  setPitch: (v: number) => void;
  setTempo: (v: number) => void;
  setStemVolume: (stem: string, vol: number) => void;
  setStemMuted: (stem: string, muted: boolean) => void;
  initStemControls: (stems: string[]) => void;
  restoreStemControls: (
    volumes: Record<string, number>,
    mutes: Record<string, boolean>,
  ) => void;
  setActiveVersion: (pitch: number, tempo: number) => void;
  setVersions: (versions: Version[]) => void;
  setLoopEnabled: (v: boolean) => void;
  setLoopStart: (v: number | null) => void;
  setLoopEnd: (v: number | null) => void;
  setEqMode: (mode: EqMode) => void;
  setActiveStemForEq: (stem: string | null) => void;
  setGlobalEqBand: (bandIndex: number, gain: number) => void;
  setStemEqBand: (stem: string, bandIndex: number, gain: number) => void;
  applyEqPreset: (bands: EqBand[]) => void;
  setServerConfig: (cfg: ServerConfig) => void;
  setActiveTab: (tab: AppTab) => void;
  setUploadProgress: (pct: number | null) => void;
  setUploadStatus: (msg: string) => void;
  setSongSortOrder: (order: SongSortOrder) => void;
}

const defaultStemEqFor = (stems: string[]): Record<string, EqBand[]> => {
  const result: Record<string, EqBand[]> = {};
  for (const s of stems) {
    result[s] = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
  }
  return result;
};

export const usePlayerStore = create<PlayerState & PlayerActions>()((set) => ({
  songs: [],
  activeSong: null,
  isPlaying: false,
  isLoading: false,
  startOffset: 0,
  startTime: 0,
  duration: 0,
  pitch: 0,
  tempo: 100,
  stemVolumes: {},
  stemMuted: {},
  activeVersion: { pitch: 0, tempo: 1.0 },
  versions: [],
  loopEnabled: false,
  loopStart: null,
  loopEnd: null,
  eqMode: "global",
  activeStemForEq: null,
  globalEq: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
  stemEq: {},
  serverConfig: { max_versions_global: 50 },
  activeTab: "library",
  uploadProgress: null,
  uploadStatus: "",
  songSortOrder: "recent",

  setSongs: (songs) => set({ songs }),
  updateSong: (song) =>
    set((s) => ({
      songs: s.songs.some((x) => x.id === song.id)
        ? s.songs.map((x) => (x.id === song.id ? song : x))
        : [...s.songs, song],
    })),
  setActiveSong: (activeSong) => set({ activeSong }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setStartOffset: (startOffset) => set({ startOffset }),
  setStartTime: (startTime) => set({ startTime }),
  setDuration: (duration) => set({ duration }),
  setPitch: (pitch) => set({ pitch }),
  setTempo: (tempo) => set({ tempo }),
  setStemVolume: (stem, vol) =>
    set((s) => ({ stemVolumes: { ...s.stemVolumes, [stem]: vol } })),
  setStemMuted: (stem, muted) =>
    set((s) => ({ stemMuted: { ...s.stemMuted, [stem]: muted } })),
  initStemControls: (stems) => {
    const volumes: Record<string, number> = {};
    const mutes: Record<string, boolean> = {};
    for (const s of stems) {
      volumes[s] = 1.0;
      mutes[s] = false;
    }
    set({ stemVolumes: volumes, stemMuted: mutes, stemEq: defaultStemEqFor(stems) });
  },
  restoreStemControls: (volumes, mutes) => set({ stemVolumes: volumes, stemMuted: mutes }),
  setActiveVersion: (pitch, tempo) => set({ activeVersion: { pitch, tempo } }),
  setVersions: (versions) => set({ versions }),
  setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
  setLoopStart: (loopStart) => set({ loopStart }),
  setLoopEnd: (loopEnd) => set({ loopEnd }),
  setEqMode: (eqMode) => set({ eqMode }),
  setActiveStemForEq: (activeStemForEq) => set({ activeStemForEq }),
  setGlobalEqBand: (bandIndex, gain) =>
    set((s) => ({
      globalEq: s.globalEq.map((b, i) => (i === bandIndex ? { ...b, gain } : b)),
    })),
  setStemEqBand: (stem, bandIndex, gain) =>
    set((s) => ({
      stemEq: {
        ...s.stemEq,
        [stem]: (s.stemEq[stem] ?? DEFAULT_EQ_BANDS.map((b) => ({ ...b }))).map(
          (b, i) => (i === bandIndex ? { ...b, gain } : b),
        ),
      },
    })),
  applyEqPreset: (bands) =>
    set((s) => {
      const newStemEq: Record<string, EqBand[]> = {};
      for (const stem of Object.keys(s.stemEq)) {
        newStemEq[stem] = bands.map((b) => ({ ...b }));
      }
      return { globalEq: bands.map((b) => ({ ...b })), stemEq: newStemEq };
    }),
  setServerConfig: (serverConfig) => set({ serverConfig }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  setUploadStatus: (uploadStatus) => set({ uploadStatus }),
  setSongSortOrder: (songSortOrder) => set({ songSortOrder }),
}));
