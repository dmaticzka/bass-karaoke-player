import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MiniPlayer } from "../../components/MiniPlayer";
import { usePlayerStore } from "../../store/playerStore";
import type { Song } from "../../types";

const activeSong: Song = {
  id: "s1",
  filename: "my_track.mp3",
  artist: "Artist",
  title: "Track",
  status: "ready",
  stems: ["vocals", "bass", "drums", "other"],
};

function resetStore() {
  usePlayerStore.setState({
    activeSong,
    isPlaying: false,
    isLoading: false,
    startOffset: 0,
    duration: 100,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("MiniPlayer", () => {
  it("renders the mini player when activeSong is set", () => {
    render(<MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Mini player" })).toBeInTheDocument();
  });

  it("returns null when activeSong is null", () => {
    usePlayerStore.setState({ activeSong: null });
    const { container } = render(
      <MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("displays the filename as a navigation button", () => {
    render(<MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={vi.fn()} />);
    expect(screen.getByRole("button", { name: /my_track.mp3/ })).toBeInTheDocument();
  });

  it("calls onNavigatePlayer when title button is clicked", () => {
    const onNavigatePlayer = vi.fn();
    render(<MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={onNavigatePlayer} />);
    fireEvent.click(screen.getByRole("button", { name: /my_track.mp3/ }));
    expect(onNavigatePlayer).toHaveBeenCalledTimes(1);
  });

  it("shows Play label when not playing", () => {
    render(<MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("shows Pause label when playing", () => {
    usePlayerStore.setState({ isPlaying: true });
    render(<MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("calls onPlayPause when play/pause button is clicked", () => {
    const onPlayPause = vi.fn();
    render(<MiniPlayer onPlayPause={onPlayPause} onNavigatePlayer={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("play button is disabled while loading", () => {
    usePlayerStore.setState({ isLoading: true });
    render(<MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={vi.fn()} />);
    // The play/pause button with aria-label "Play" should be disabled
    const btn = screen.getByRole("button", { name: "Play" });
    expect(btn).toBeDisabled();
  });

  it("progress bar width reflects startOffset / duration ratio", () => {
    usePlayerStore.setState({ startOffset: 25, duration: 100 });
    render(<MiniPlayer onPlayPause={vi.fn()} onNavigatePlayer={vi.fn()} />);
    const fill = document.querySelector(".mini-progress-fill") as HTMLElement;
    expect(fill.style.width).toBe("25%");
  });
});
