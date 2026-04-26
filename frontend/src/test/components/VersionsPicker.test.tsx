import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VersionsPicker } from "../../components/VersionsPicker";
import { usePlayerStore } from "../../store/playerStore";
import type { Version } from "../../types";

vi.mock("../../api/client", () => ({
  api: {
    deleteVersion: vi.fn().mockResolvedValue(undefined),
    getVersions: vi.fn().mockResolvedValue({ versions: [] }),
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
});
