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
  onBack: vi.fn(),
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

  it("displays current time correctly", () => {
    usePlayerStore.setState({ startOffset: 65, duration: 120 });
    render(<PlaybackBar {...defaultProps} />);
    // 65 seconds = 1:05
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(<PlaybackBar {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to start / loop point A" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does not render the AB Loop section", () => {
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.queryByRole("heading", { name: "AB Loop" })).not.toBeInTheDocument();
  });
});
