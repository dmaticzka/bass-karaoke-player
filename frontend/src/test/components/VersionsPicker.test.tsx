import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VersionsPicker } from "../../components/VersionsPicker";
import { usePlayerStore } from "../../store/playerStore";
import type { StemName, Version } from "../../types";

vi.mock("../../audio/audioCache", () => ({
  hasInOfflineCache: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../api/client", () => ({
  api: {
    deleteVersion: vi.fn().mockResolvedValue(undefined),
    getVersions: vi.fn().mockResolvedValue({ versions: [] }),
    stemUrl: vi.fn().mockImplementation((_id: string, stem: string) => `/api/songs/s1/stems/${stem}`),
    processedStemUrl: vi.fn().mockImplementation(
      (_id: string, stem: string, pitch: number, tempo: number) =>
        `/api/songs/s1/stems/${stem}/processed?pitch=${pitch}&tempo=${tempo}`,
    ),
  },
}));

const defaultVersion: Version = {
  pitch_semitones: 0,
  tempo_ratio: 1.0,
  is_default: true,
  status: "ready",
};

const customVersion: Version = {
  pitch_semitones: 3,
  tempo_ratio: 0.9,
  is_default: false,
  status: "ready",
};

const processingVersion: Version = {
  pitch_semitones: -2,
  tempo_ratio: 1.1,
  is_default: false,
  status: "processing",
};

function resetStore(versions: Version[] = [], activePitch = 0, activeTempo = 1.0) {
  usePlayerStore.setState({
    versions,
    activeVersion: { pitch: activePitch, tempo: activeTempo },
    activeSong: { id: "s1", filename: "test.mp3", artist: null, title: null, status: "ready", stems: [] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("VersionsPicker", () => {
  it("renders nothing when versions list is empty", () => {
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    expect(document.querySelector("#versions-section")).not.toBeInTheDocument();
  });

  it("renders a list item per version", () => {
    resetStore([defaultVersion, customVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    expect(document.querySelectorAll(".version-item")).toHaveLength(2);
  });

  it("shows 'Original' label for the default version", () => {
    resetStore([defaultVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    expect(screen.getByText(/Original/)).toBeInTheDocument();
  });

  it("shows pitch and tempo label for non-default version", () => {
    resetStore([customVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    expect(screen.getByText(/\+3 st/)).toBeInTheDocument();
  });

  it("marks the active version with 'active' class", () => {
    resetStore([defaultVersion, customVersion], 3, 0.9);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    const items = document.querySelectorAll(".version-item");
    const activeItem = Array.from(items).find((el) => el.classList.contains("active"));
    expect(activeItem).toBeInTheDocument();
    expect(activeItem?.textContent).toMatch(/\+3 st/);
  });

  it("calls onSelectVersion when a ready version is clicked", () => {
    const onSelectVersion = vi.fn().mockResolvedValue(undefined);
    resetStore([customVersion]);
    render(<VersionsPicker onSelectVersion={onSelectVersion} />);
    fireEvent.click(screen.getByText(/\+3 st/));
    expect(onSelectVersion).toHaveBeenCalledWith(3, 0.9);
  });

  it("shows processing badge for a version in processing state", () => {
    resetStore([processingVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    expect(document.querySelector(".status-processing")).toBeInTheDocument();
  });

  it("processing version is not clickable (no cursor:pointer)", () => {
    resetStore([processingVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    const item = document.querySelector(".version-item") as HTMLElement;
    expect(item.style.cursor).toBe("default");
  });

  it("shows delete button for non-default ready versions", () => {
    resetStore([customVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    expect(document.querySelector(".version-delete-btn")).toBeInTheDocument();
  });

  it("does NOT show delete button for the default version", () => {
    resetStore([defaultVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    expect(document.querySelector(".version-delete-btn")).not.toBeInTheDocument();
  });

  it("clicking delete button calls api.deleteVersion", async () => {
    const { api } = await import("../../api/client");
    resetStore([customVersion]);
    render(<VersionsPicker onSelectVersion={vi.fn()} />);
    const deleteBtn = document.querySelector(".version-delete-btn") as HTMLElement;
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect(vi.mocked(api.deleteVersion)).toHaveBeenCalledWith("s1", 3, 0.9);
  });

  it("deleting the active version calls onSelectVersion(0, 1.0)", async () => {
    const { api } = await import("../../api/client");
    vi.mocked(api.getVersions).mockResolvedValue({ versions: [defaultVersion] });
    const onSelectVersion = vi.fn().mockResolvedValue(undefined);
    // Make customVersion the active version
    resetStore([defaultVersion, customVersion], 3, 0.9);
    render(<VersionsPicker onSelectVersion={onSelectVersion} />);
    const deleteBtn = document.querySelector(".version-delete-btn") as HTMLElement;
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect(onSelectVersion).toHaveBeenCalledWith(0, 1.0);
  });

  it("deleting a non-active version does NOT call onSelectVersion", async () => {
    const { api } = await import("../../api/client");
    vi.mocked(api.getVersions).mockResolvedValue({ versions: [defaultVersion] });
    const onSelectVersion = vi.fn().mockResolvedValue(undefined);
    // Active is default (0, 1.0), deleting customVersion (3, 0.9)
    resetStore([defaultVersion, customVersion], 0, 1.0);
    render(<VersionsPicker onSelectVersion={onSelectVersion} />);
    const deleteBtn = document.querySelector(".version-delete-btn") as HTMLElement;
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect(onSelectVersion).not.toHaveBeenCalled();
  });

  describe("offline-cache indicator (version-cached class)", () => {
    const STEMS: StemName[] = ["bass", "drums", "vocals", "other"];

    function resetStoreWithStems(
      versions: Version[],
      activePitch = 0,
      activeTempo = 1.0,
    ) {
      usePlayerStore.setState({
        versions,
        activeVersion: { pitch: activePitch, tempo: activeTempo },
        activeSong: {
          id: "s1",
          filename: "test.mp3",
          artist: null,
          title: null,
          status: "ready",
          stems: STEMS,
        },
      });
    }

    it("adds version-cached class when all stems are in the offline cache", async () => {
      const audioCache = await import("../../audio/audioCache");
      vi.mocked(audioCache.hasInOfflineCache).mockResolvedValue(true);
      resetStoreWithStems([defaultVersion]);
      await act(async () => {
        render(<VersionsPicker onSelectVersion={vi.fn()} />);
      });
      expect(document.querySelector(".version-item.version-cached")).toBeInTheDocument();
    });

    it("does not add version-cached class when stems are not in the offline cache", async () => {
      const audioCache = await import("../../audio/audioCache");
      vi.mocked(audioCache.hasInOfflineCache).mockResolvedValue(false);
      resetStoreWithStems([defaultVersion]);
      await act(async () => {
        render(<VersionsPicker onSelectVersion={vi.fn()} />);
      });
      expect(document.querySelector(".version-item.version-cached")).not.toBeInTheDocument();
    });

    it("uses processedStemUrl for non-default versions", async () => {
      const { api } = await import("../../api/client");
      const audioCache = await import("../../audio/audioCache");
      vi.mocked(audioCache.hasInOfflineCache).mockResolvedValue(true);
      resetStoreWithStems([customVersion]);
      await act(async () => {
        render(<VersionsPicker onSelectVersion={vi.fn()} />);
      });
      expect(vi.mocked(api.processedStemUrl)).toHaveBeenCalled();
      expect(vi.mocked(api.stemUrl)).not.toHaveBeenCalled();
    });

    it("uses stemUrl for the default version", async () => {
      const { api } = await import("../../api/client");
      const audioCache = await import("../../audio/audioCache");
      vi.mocked(audioCache.hasInOfflineCache).mockResolvedValue(true);
      resetStoreWithStems([defaultVersion]);
      await act(async () => {
        render(<VersionsPicker onSelectVersion={vi.fn()} />);
      });
      expect(vi.mocked(api.stemUrl)).toHaveBeenCalled();
      expect(vi.mocked(api.processedStemUrl)).not.toHaveBeenCalled();
    });

    it("does not add version-cached class when activeSong has no stems", async () => {
      usePlayerStore.setState({
        versions: [defaultVersion],
        activeVersion: { pitch: 0, tempo: 1.0 },
        activeSong: {
          id: "s1",
          filename: "test.mp3",
          artist: null,
          title: null,
          status: "ready",
          stems: [],
        },
      });
      await act(async () => {
        render(<VersionsPicker onSelectVersion={vi.fn()} />);
      });
      expect(document.querySelector(".version-item.version-cached")).not.toBeInTheDocument();
    });

    it("shows 'available offline' in title when version is offline-cached", async () => {
      const audioCache = await import("../../audio/audioCache");
      vi.mocked(audioCache.hasInOfflineCache).mockResolvedValue(true);
      resetStoreWithStems([defaultVersion]);
      await act(async () => {
        render(<VersionsPicker onSelectVersion={vi.fn()} />);
      });
      const item = document.querySelector(".version-item") as HTMLElement;
      expect(item.title).toContain("available offline");
    });
  });
});
