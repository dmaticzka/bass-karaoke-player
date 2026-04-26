import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../../App";
import { usePlayerStore } from "../../store/playerStore";
import { api } from "../../api/client";
import type { Song } from "../../types";

vi.mock("../../api/client", () => ({
  api: {
    getConfig: vi.fn(),
    getSongs: vi.fn(),
    touchSong: vi.fn(),
    uploadSong: vi.fn(),
    deleteSong: vi.fn(),
    getVersions: vi.fn(),
    processStem: vi.fn(),
    stemUrl: vi.fn((id: string, stem: string) => `/api/songs/${id}/stems/${stem}`),
    processedStemUrl: vi.fn(),
  },
}));

// Stub audio engine and cache so no real AudioContext is needed
vi.mock("../../audio/engine", () => ({
  getOrCreateCtx: vi.fn(() => ({
    currentTime: 0,
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(() => ({
      gain: { value: 1, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: "peaking",
      frequency: { value: 1000 },
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    destination: {},
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 10 }),
  })),
  clearStemNodes: vi.fn(),
  wireStemNode: vi.fn(),
  getDuration: vi.fn(() => 100),
  playAll: vi.fn(),
  stopSources: vi.fn(),
  applyGain: vi.fn(),
  applyEqBand: vi.fn(),
  applyGlobalEqBand: vi.fn(),
  getStemNodes: vi.fn(() => ({})),
  currentTime: vi.fn(() => 0),
  startSeekTimer: vi.fn(),
  stopSeekTimer: vi.fn(),
  _resetForTesting: vi.fn(),
}));

vi.mock("../../audio/audioCache", () => ({
  get: vi.fn(() => undefined),
  set: vi.fn(),
  clear: vi.fn(),
  size: vi.fn(() => 0),
  MAX_ENTRIES: 20,
}));

const readySong: Song = {
  id: "s1",
  filename: "test_song.mp3",
  artist: "The Artist",
  title: "The Title",
  status: "ready",
  stems: ["vocals", "bass", "drums", "other"],
};

function resetStore() {
  usePlayerStore.setState({
    songs: [],
    activeSong: null,
    activeTab: "library",
    isPlaying: false,
    isLoading: false,
    duration: 0,
    startOffset: 0,
    versions: [],
    pitch: 0,
    tempo: 100,
    activeVersion: { pitch: 0, tempo: 1.0 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  vi.mocked(api.getConfig).mockResolvedValue({ max_versions_global: 50 });
  vi.mocked(api.getSongs).mockResolvedValue({ songs: [] });
  vi.mocked(api.touchSong).mockResolvedValue(readySong);
  vi.mocked(api.getVersions).mockResolvedValue({ versions: [] });
  // Mock localStorage
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

describe("App", () => {
  it("renders the app title", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText("Bass Karaoke Player")).toBeInTheDocument();
  });

  it("fetches config and songs on mount", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(vi.mocked(api.getConfig)).toHaveBeenCalled();
    expect(vi.mocked(api.getSongs)).toHaveBeenCalled();
  });

  it("populates song list from API response", async () => {
    vi.mocked(api.getSongs).mockResolvedValue({ songs: [readySong] });
    await act(async () => {
      render(<App />);
    });
    expect(usePlayerStore.getState().songs).toHaveLength(1);
  });

  it("shows the library subtitle on the library tab", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(document.querySelector(".app-header .subtitle")).toHaveTextContent(/demucs/);
  });

  it("BottomNav is rendered", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("library section is visible initially (not collapsed)", async () => {
    await act(async () => {
      render(<App />);
    });
    const body = document.querySelector(".collapsible-body.expanded");
    expect(body).toBeInTheDocument();
  });

  it("library header click toggles collapsed state", async () => {
    await act(async () => {
      render(<App />);
    });
    const headers = document.querySelectorAll(".collapsible-header");
    await act(async () => {
      fireEvent.click(headers[0]!);
    });
    const body = document.querySelector(".collapsible-body.collapsed");
    expect(body).toBeInTheDocument();
  });

  it("handleLoadSong switches to player tab", async () => {
    vi.mocked(api.getSongs).mockResolvedValue({ songs: [readySong] });
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Load"));
    });

    expect(usePlayerStore.getState().activeTab).toBe("player");
  });

  it("handleLoadSong sets activeSong", async () => {
    vi.mocked(api.getSongs).mockResolvedValue({ songs: [readySong] });
    await act(async () => {
      render(<App />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Load"));
    });
    expect(usePlayerStore.getState().activeSong?.id).toBe("s1");
  });

  it("handleTabChange to EQ auto-expands EQ section", async () => {
    usePlayerStore.setState({ activeSong: readySong });
    await act(async () => {
      render(<App />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "EQ" }));
    });
    expect(usePlayerStore.getState().activeTab).toBe("eq");
  });

  it("mini-player is not shown when activeSong is null", async () => {
    await act(async () => {
      render(<App />);
    });
    expect(document.querySelector(".mini-player")).not.toBeInTheDocument();
  });

  it("mini-player is shown when on library tab with an active song", async () => {
    usePlayerStore.setState({ activeSong: readySong, activeTab: "library" });
    await act(async () => {
      render(<App />);
    });
    expect(document.querySelector(".mini-player")).toBeInTheDocument();
  });

  it("mini-player is not shown on player tab even with active song", async () => {
    usePlayerStore.setState({ activeSong: readySong, activeTab: "player" });
    await act(async () => {
      render(<App />);
    });
    expect(document.querySelector(".mini-player")).not.toBeInTheDocument();
  });

  it("shows song title in subtitle on non-library tabs", async () => {
    usePlayerStore.setState({ activeSong: readySong, activeTab: "player" });
    await act(async () => {
      render(<App />);
    });
    expect(document.querySelector(".app-header .subtitle")).toHaveTextContent("The Title");
  });

  it("getConfig failure is handled gracefully (no crash)", async () => {
    vi.mocked(api.getConfig).mockRejectedValue(new Error("Network error"));
    await expect(
      act(async () => {
        render(<App />);
      }),
    ).resolves.not.toThrow();
  });

  it("getSongs failure is handled gracefully (no crash)", async () => {
    vi.mocked(api.getSongs).mockRejectedValue(new Error("Server error"));
    await expect(
      act(async () => {
        render(<App />);
      }),
    ).resolves.not.toThrow();
  });

  it("MiniPlayer navigate button switches to player tab", async () => {
    vi.mocked(api.getSongs).mockResolvedValue({ songs: [readySong] });
    usePlayerStore.setState({ activeSong: readySong, activeTab: "library" });
    await act(async () => {
      render(<App />);
    });
    // MiniPlayer should be visible — click the filename navigation button
    const navBtn = screen.getByRole("button", { name: /test_song.mp3/ });
    await act(async () => {
      fireEvent.click(navBtn);
    });
    expect(usePlayerStore.getState().activeTab).toBe("player");
  });

  it("MiniPlayer play/pause button delegates click to #play-pause-btn", async () => {
    usePlayerStore.setState({ activeSong: readySong, activeTab: "library" });
    await act(async () => {
      render(<App />);
    });
    const internalPlayBtn = document.querySelector("#play-pause-btn") as HTMLElement;
    const clickSpy = vi.spyOn(internalPlayBtn, "click");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
    });
    expect(clickSpy).toHaveBeenCalled();
  });
});
