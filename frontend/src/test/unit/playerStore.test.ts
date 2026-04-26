import { describe, it, expect, beforeEach } from "vitest";
import { usePlayerStore } from "../../store/playerStore";
import { DEFAULT_EQ_BANDS } from "../../types";

// Reset Zustand store between tests by calling setState directly
function resetStore() {
  usePlayerStore.setState({
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
    songSortOrder: "last-used",
  });
}

const song1 = {
  id: "s1",
  filename: "song1.mp3",
  artist: "Artist 1",
  title: "Title 1",
  status: "ready" as const,
  stems: ["vocals", "bass", "drums", "other"] as const,
};

const song2 = {
  id: "s2",
  filename: "song2.mp3",
  artist: "Artist 2",
  title: "Title 2",
  status: "ready" as const,
  stems: ["vocals", "bass", "drums", "other"] as const,
};

beforeEach(resetStore);

describe("playerStore", () => {
  describe("setSongs", () => {
    it("replaces the songs list", () => {
      usePlayerStore.getState().setSongs([song1, song2]);
      expect(usePlayerStore.getState().songs).toHaveLength(2);
    });
  });

  describe("updateSong", () => {
    it("replaces an existing song by id", () => {
      usePlayerStore.getState().setSongs([song1]);
      const updated = { ...song1, title: "Updated" };
      usePlayerStore.getState().updateSong(updated);
      const songs = usePlayerStore.getState().songs;
      expect(songs).toHaveLength(1);
      expect(songs[0].title).toBe("Updated");
    });

    it("appends when song id is not in the list", () => {
      usePlayerStore.getState().setSongs([song1]);
      usePlayerStore.getState().updateSong(song2);
      expect(usePlayerStore.getState().songs).toHaveLength(2);
    });
  });

  describe("setActiveSong", () => {
    it("sets and clears the active song", () => {
      usePlayerStore.getState().setActiveSong(song1);
      expect(usePlayerStore.getState().activeSong?.id).toBe("s1");
      usePlayerStore.getState().setActiveSong(null);
      expect(usePlayerStore.getState().activeSong).toBeNull();
    });
  });

  describe("initStemControls", () => {
    it("initialises volumes to 1.0 for each stem", () => {
      usePlayerStore.getState().initStemControls(["vocals", "bass", "drums", "other"]);
      const { stemVolumes } = usePlayerStore.getState();
      expect(stemVolumes["vocals"]).toBe(1.0);
      expect(stemVolumes["bass"]).toBe(1.0);
    });

    it("initialises mutes to false for each stem", () => {
      usePlayerStore.getState().initStemControls(["vocals", "bass"]);
      const { stemMuted } = usePlayerStore.getState();
      expect(stemMuted["vocals"]).toBe(false);
      expect(stemMuted["bass"]).toBe(false);
    });

    it("builds stemEq with DEFAULT_EQ_BANDS copies for each stem", () => {
      usePlayerStore.getState().initStemControls(["vocals", "bass"]);
      const { stemEq } = usePlayerStore.getState();
      expect(stemEq["vocals"]).toHaveLength(DEFAULT_EQ_BANDS.length);
      expect(stemEq["bass"]).toHaveLength(DEFAULT_EQ_BANDS.length);
    });
  });

  describe("restoreStemControls", () => {
    it("overwrites volumes and mutes without touching stemEq", () => {
      usePlayerStore.getState().initStemControls(["vocals", "bass"]);
      const eqBefore = usePlayerStore.getState().stemEq;
      usePlayerStore.getState().restoreStemControls({ vocals: 0.5 }, { vocals: true });
      expect(usePlayerStore.getState().stemVolumes["vocals"]).toBe(0.5);
      expect(usePlayerStore.getState().stemMuted["vocals"]).toBe(true);
      expect(usePlayerStore.getState().stemEq).toBe(eqBefore); // same reference
    });
  });

  describe("setGlobalEqBand", () => {
    it("updates only the specified band index", () => {
      usePlayerStore.getState().setGlobalEqBand(2, 6);
      const eq = usePlayerStore.getState().globalEq;
      expect(eq[2].gain).toBe(6);
      expect(eq[0].gain).toBe(0);
      expect(eq[1].gain).toBe(0);
    });
  });

  describe("setStemEqBand", () => {
    it("updates only the specified stem and band index", () => {
      usePlayerStore.getState().initStemControls(["vocals", "bass"]);
      usePlayerStore.getState().setStemEqBand("vocals", 1, 9);
      const { stemEq } = usePlayerStore.getState();
      expect(stemEq["vocals"][1].gain).toBe(9);
      expect(stemEq["vocals"][0].gain).toBe(0);
      expect(stemEq["bass"][1].gain).toBe(0); // unaffected
    });

    it("creates DEFAULT_EQ_BANDS for stem if not initialised", () => {
      usePlayerStore.getState().setStemEqBand("drums", 0, 3);
      const { stemEq } = usePlayerStore.getState();
      expect(stemEq["drums"]).toHaveLength(DEFAULT_EQ_BANDS.length);
      expect(stemEq["drums"][0].gain).toBe(3);
    });
  });

  describe("applyEqPreset", () => {
    it("updates globalEq to the preset bands", () => {
      const preset = DEFAULT_EQ_BANDS.map((b) => ({ ...b, gain: 5 }));
      usePlayerStore.getState().applyEqPreset(preset);
      const eq = usePlayerStore.getState().globalEq;
      expect(eq.every((b) => b.gain === 5)).toBe(true);
    });

    it("updates all stemEq entries to the preset bands", () => {
      usePlayerStore.getState().initStemControls(["vocals", "bass"]);
      const preset = DEFAULT_EQ_BANDS.map((b) => ({ ...b, gain: 3 }));
      usePlayerStore.getState().applyEqPreset(preset);
      const { stemEq } = usePlayerStore.getState();
      expect(stemEq["vocals"].every((b) => b.gain === 3)).toBe(true);
      expect(stemEq["bass"].every((b) => b.gain === 3)).toBe(true);
    });
  });

  describe("loop actions", () => {
    it("setLoopEnabled / setLoopStart / setLoopEnd update state", () => {
      usePlayerStore.getState().setLoopEnabled(true);
      usePlayerStore.getState().setLoopStart(5);
      usePlayerStore.getState().setLoopEnd(30);
      const s = usePlayerStore.getState();
      expect(s.loopEnabled).toBe(true);
      expect(s.loopStart).toBe(5);
      expect(s.loopEnd).toBe(30);
    });
  });

  describe("versions", () => {
    it("setVersions replaces the list", () => {
      const v = [{ pitch_semitones: 0, tempo_ratio: 1, is_default: true, status: "ready" as const }];
      usePlayerStore.getState().setVersions(v);
      expect(usePlayerStore.getState().versions).toHaveLength(1);
    });

    it("setActiveVersion updates pitch and tempo", () => {
      usePlayerStore.getState().setActiveVersion(3, 0.75);
      const { activeVersion } = usePlayerStore.getState();
      expect(activeVersion.pitch).toBe(3);
      expect(activeVersion.tempo).toBe(0.75);
    });
  });

  describe("upload state", () => {
    it("setUploadProgress updates progress", () => {
      usePlayerStore.getState().setUploadProgress(50);
      expect(usePlayerStore.getState().uploadProgress).toBe(50);
    });

    it("setUploadStatus updates status message", () => {
      usePlayerStore.getState().setUploadStatus("Uploading…");
      expect(usePlayerStore.getState().uploadStatus).toBe("Uploading…");
    });
  });

  describe("navigation", () => {
    it("setActiveTab switches tab", () => {
      usePlayerStore.getState().setActiveTab("player");
      expect(usePlayerStore.getState().activeTab).toBe("player");
    });
  });

  describe("setSongSortOrder", () => {
    it("updates the sort order", () => {
      usePlayerStore.getState().setSongSortOrder("alphabetical");
      expect(usePlayerStore.getState().songSortOrder).toBe("alphabetical");
    });
  });

  describe("server config", () => {
    it("setServerConfig replaces config", () => {
      usePlayerStore.getState().setServerConfig({ max_versions_global: 10 });
      expect(usePlayerStore.getState().serverConfig.max_versions_global).toBe(10);
    });
  });

  describe("setStemVolume / setStemMuted", () => {
    it("updates volume for a single stem", () => {
      usePlayerStore.getState().setStemVolume("bass", 0.7);
      expect(usePlayerStore.getState().stemVolumes["bass"]).toBe(0.7);
    });

    it("updates muted state for a single stem", () => {
      usePlayerStore.getState().setStemMuted("drums", true);
      expect(usePlayerStore.getState().stemMuted["drums"]).toBe(true);
    });
  });
});
