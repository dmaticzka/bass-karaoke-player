import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlaybackBar } from "../../components/PlaybackBar";
import { usePlayerStore } from "../../store/playerStore";

function resetStore() {
  usePlayerStore.setState({
    isPlaying: false,
    isLoading: false,
    duration: 120,
    startOffset: 0,
    loopEnabled: false,
    loopStart: null,
    loopEnd: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

const defaultProps = {
  onPlayPause: vi.fn(),
  onStop: vi.fn(),
  onSeek: vi.fn(),
  onSeekRelative: vi.fn(),
  onLoopToggle: vi.fn(),
  onLoopSetA: vi.fn(),
  onLoopSetB: vi.fn(),
  onLoopClear: vi.fn(),
};

describe("PlaybackBar", () => {
  it("shows Play aria-label when not playing", () => {
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Play all stems" })).toBeInTheDocument();
  });

  it("shows Pause aria-label when playing", () => {
    usePlayerStore.setState({ isPlaying: true });
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("calls onPlayPause when play button is clicked", () => {
    const onPlayPause = vi.fn();
    render(<PlaybackBar {...defaultProps} onPlayPause={onPlayPause} />);
    fireEvent.click(screen.getByRole("button", { name: "Play all stems" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("calls onStop when stop button is clicked", () => {
    const onStop = vi.fn();
    render(<PlaybackBar {...defaultProps} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop playback" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("play button is disabled when loading", () => {
    usePlayerStore.setState({ isLoading: true });
    render(<PlaybackBar {...defaultProps} />);
    expect(document.querySelector("#play-pause-btn")).toBeDisabled();
  });

  it("calls onSeek when seek slider changes", () => {
    const onSeek = vi.fn();
    render(<PlaybackBar {...defaultProps} onSeek={onSeek} />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    fireEvent.change(slider, { target: { value: "60" } });
    expect(onSeek).toHaveBeenCalledWith(60);
  });

  it("calls onSeekRelative(-30) when 30s back button clicked", () => {
    const onSeekRelative = vi.fn();
    render(<PlaybackBar {...defaultProps} onSeekRelative={onSeekRelative} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip back 30 seconds" }));
    expect(onSeekRelative).toHaveBeenCalledWith(-30);
  });

  it("calls onSeekRelative(15) when 15s forward button clicked", () => {
    const onSeekRelative = vi.fn();
    render(<PlaybackBar {...defaultProps} onSeekRelative={onSeekRelative} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip forward 15 seconds" }));
    expect(onSeekRelative).toHaveBeenCalledWith(15);
  });

  it("calls onLoopToggle when loop toggle button is clicked", () => {
    const onLoopToggle = vi.fn();
    render(<PlaybackBar {...defaultProps} onLoopToggle={onLoopToggle} />);
    fireEvent.click(screen.getByTitle("Toggle A-B loop"));
    expect(onLoopToggle).toHaveBeenCalledTimes(1);
  });

  it("loop A/B/Clear buttons are disabled when loop is not enabled", () => {
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Set A/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Set B/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Clear/i })).toBeDisabled();
  });

  it("loop A/B/Clear buttons are enabled when loop is enabled", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 60 });
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Set A/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Set B/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Clear/i })).not.toBeDisabled();
  });

  it("shows loop display when loop is active", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 50 });
    render(<PlaybackBar {...defaultProps} />);
    expect(document.querySelector("#loop-display")).toBeInTheDocument();
  });

  it("displays current time correctly", () => {
    usePlayerStore.setState({ startOffset: 65, duration: 120 });
    render(<PlaybackBar {...defaultProps} />);
    // 65 seconds = 1:05
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });
});
