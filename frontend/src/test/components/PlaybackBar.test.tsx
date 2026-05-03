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
  onLoopToggle: vi.fn(),
  onLoopSetA: vi.fn(),
  onLoopSetB: vi.fn(),
  onLoopClear: vi.fn(),
  onLoopClearA: vi.fn(),
  onLoopClearB: vi.fn(),
  onLoopSetAValue: vi.fn(),
  onLoopSetBValue: vi.fn(),
  onLoopAdjustA: vi.fn(),
  onLoopAdjustB: vi.fn(),
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
    expect(screen.getByRole("button", { name: "Set A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear B" })).toBeDisabled();
  });

  it("loop A/B/Clear buttons are enabled when loop is enabled", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 60 });
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Set A" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Set B" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear A" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear B" })).not.toBeDisabled();
  });

  it("shows A and B times in the slider rows when loop is active", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 50 });
    render(<PlaybackBar {...defaultProps} />);
    // The ab-point-time spans on the A and B slider rows show the current times
    const timeCells = document.querySelectorAll(".ab-point-time");
    expect(timeCells.length).toBe(2);
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

  it("calls onLoopClearA when Clear A button is clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 60 });
    const onLoopClearA = vi.fn();
    render(<PlaybackBar {...defaultProps} onLoopClearA={onLoopClearA} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear A" }));
    expect(onLoopClearA).toHaveBeenCalledTimes(1);
  });

  it("calls onLoopClearB when Clear B button is clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 60 });
    const onLoopClearB = vi.fn();
    render(<PlaybackBar {...defaultProps} onLoopClearB={onLoopClearB} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear B" }));
    expect(onLoopClearB).toHaveBeenCalledTimes(1);
  });

  it("calls onLoopSetAValue when A slider changes (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 120 });
    const onLoopSetAValue = vi.fn();
    render(<PlaybackBar {...defaultProps} onLoopSetAValue={onLoopSetAValue} />);
    const slider = screen.getByRole("slider", { name: "Loop start (A point)" });
    fireEvent.change(slider, { target: { value: "30" } });
    expect(onLoopSetAValue).toHaveBeenCalledWith(30);
  });

  it("calls onLoopSetBValue when B slider changes (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 120 });
    const onLoopSetBValue = vi.fn();
    render(<PlaybackBar {...defaultProps} onLoopSetBValue={onLoopSetBValue} />);
    const slider = screen.getByRole("slider", { name: "Loop end (B point)" });
    fireEvent.change(slider, { target: { value: "90" } });
    expect(onLoopSetBValue).toHaveBeenCalledWith(90);
  });

  it("A/B sliders are disabled when loop is not enabled", () => {
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.getByRole("slider", { name: "Loop start (A point)" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Loop end (B point)" })).toBeDisabled();
  });

  it("A/B sliders are enabled when loop is enabled", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 60 });
    render(<PlaybackBar {...defaultProps} />);
    expect(screen.getByRole("slider", { name: "Loop start (A point)" })).not.toBeDisabled();
    expect(screen.getByRole("slider", { name: "Loop end (B point)" })).not.toBeDisabled();
  });

  it("calls onLoopAdjustA(-10) when A -10s button clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 30, loopEnd: 90 });
    const onLoopAdjustA = vi.fn();
    render(<PlaybackBar {...defaultProps} onLoopAdjustA={onLoopAdjustA} />);
    fireEvent.click(screen.getByRole("button", { name: "Move A point -10 seconds" }));
    expect(onLoopAdjustA).toHaveBeenCalledWith(-10);
  });

  it("calls onLoopAdjustB(+5) when B +5s button clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 60 });
    const onLoopAdjustB = vi.fn();
    render(<PlaybackBar {...defaultProps} onLoopAdjustB={onLoopAdjustB} />);
    fireEvent.click(screen.getByRole("button", { name: "Move B point +5 seconds" }));
    expect(onLoopAdjustB).toHaveBeenCalledWith(5);
  });
});
