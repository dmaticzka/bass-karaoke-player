import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Equalizer } from "../../components/Equalizer";
import { usePlayerStore } from "../../store/playerStore";
import { DEFAULT_EQ_BANDS } from "../../types";
import type { Song } from "../../types";

// Mock the engine so no real AudioContext is needed
vi.mock("../../audio/engine", () => ({
  applyEqBand: vi.fn(),
  applyGlobalEqBand: vi.fn(),
  getStemNodes: vi.fn(() => ({})),
}));

const activeSong: Song = {
  id: "s1",
  filename: "test.mp3",
  artist: null,
  title: null,
  status: "ready",
  stems: ["vocals", "bass", "drums", "other"],
};

function resetStore() {
  usePlayerStore.setState({
    activeSong,
    eqMode: "global",
    activeStemForEq: null,
    globalEq: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
    stemEq: {
      vocals: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
      bass: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
      drums: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
      other: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("Equalizer", () => {
  it("renders the EQ section", () => {
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    expect(document.querySelector("#eq-section")).toBeInTheDocument();
  });

  it("renders 5 band sliders when expanded", () => {
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    expect(document.querySelectorAll(".eq-slider")).toHaveLength(5);
  });

  it("renders collapsed body when collapsed=true", () => {
    render(<Equalizer collapsed={true} onToggle={vi.fn()} />);
    const body = document.querySelector(".collapsible-body");
    expect(body).toHaveClass("collapsed");
  });

  it("calls onToggle when header is clicked", () => {
    const onToggle = vi.fn();
    render(<Equalizer collapsed={false} onToggle={onToggle} />);
    fireEvent.click(document.querySelector(".collapsible-header")!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("preset selector is present", () => {
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    expect(document.querySelector(".eq-preset-select")).toBeInTheDocument();
  });

  it("changing a band slider updates the global EQ store value", () => {
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    const sliders = document.querySelectorAll(".eq-slider");
    fireEvent.change(sliders[0]!, { target: { value: "6" } });
    expect(usePlayerStore.getState().globalEq[0].gain).toBe(6);
  });

  it("Global and Per Stem mode buttons are rendered", () => {
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Global/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Per Stem/i })).toBeInTheDocument();
  });

  it("clicking 'Per Stem' switches eq mode in store", () => {
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Per Stem/i }));
    expect(usePlayerStore.getState().eqMode).toBe("per-stem");
  });

  it("per-stem mode shows stem selector tabs", () => {
    usePlayerStore.setState({ eqMode: "per-stem" });
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "vocals" })).toBeInTheDocument();
  });

  it("selecting a preset via dropdown applies preset bands", () => {
    render(<Equalizer collapsed={false} onToggle={vi.fn()} />);
    const select = document.querySelector(".eq-preset-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "Boost Bass" } });
    const eq = usePlayerStore.getState().globalEq;
    // "Boost Bass" preset has gain[0]=8 (Sub Bass)
    expect(eq[0].gain).toBe(8);
  });
});
