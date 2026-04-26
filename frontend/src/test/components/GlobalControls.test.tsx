import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobalControls } from "../../components/GlobalControls";
import { usePlayerStore } from "../../store/playerStore";
import type { Song } from "../../types";

const activeSong: Song = {
  id: "s1",
  filename: "test.mp3",
  artist: null,
  title: null,
  status: "ready",
  stems: ["vocals", "bass", "drums", "other"],
};

function resetStore() {
  usePlayerStore.setState({ pitch: 0, tempo: 100, isLoading: false, activeSong });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("GlobalControls", () => {
  it("renders the pitch slider", () => {
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole("slider", { name: "Pitch in semitones" })).toBeInTheDocument();
  });

  it("pitch slider has correct min/max/step", () => {
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "Pitch in semitones" });
    expect(slider).toHaveAttribute("min", "-12");
    expect(slider).toHaveAttribute("max", "12");
    expect(slider).toHaveAttribute("step", "1");
  });

  it("renders the tempo slider", () => {
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole("slider", { name: "Tempo percentage" })).toBeInTheDocument();
  });

  it("tempo slider has correct min/max/step", () => {
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "Tempo percentage" });
    expect(slider).toHaveAttribute("min", "25");
    expect(slider).toHaveAttribute("max", "200");
  });

  it("changing pitch slider updates the store", () => {
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "Pitch in semitones" });
    fireEvent.change(slider, { target: { value: "5" } });
    expect(usePlayerStore.getState().pitch).toBe(5);
  });

  it("changing tempo slider updates the store", () => {
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    const slider = screen.getByRole("slider", { name: "Tempo percentage" });
    fireEvent.change(slider, { target: { value: "150" } });
    expect(usePlayerStore.getState().tempo).toBe(150);
  });

  it("calls onApply when Apply button is clicked", async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<GlobalControls onApply={onApply} onReset={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("calls onReset when Reset button is clicked", async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<GlobalControls onApply={vi.fn()} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("Apply and Reset buttons are disabled while loading", () => {
    usePlayerStore.setState({ isLoading: true });
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Apply/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reset/i })).toBeDisabled();
  });

  it("Apply and Reset buttons are disabled when no active song", () => {
    usePlayerStore.setState({ activeSong: null });
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Apply/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reset/i })).toBeDisabled();
  });

  it("displays current pitch value", () => {
    usePlayerStore.setState({ pitch: 3 });
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    expect(document.querySelector("#pitch-value")).toHaveTextContent("3");
  });

  it("displays current tempo value with % suffix", () => {
    usePlayerStore.setState({ tempo: 120 });
    render(<GlobalControls onApply={vi.fn()} onReset={vi.fn()} />);
    expect(document.querySelector("#tempo-value")).toHaveTextContent("120%");
  });
});
