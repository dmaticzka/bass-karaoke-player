import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StemsStack } from "../../components/StemsStack";
import { usePlayerStore } from "../../store/playerStore";
import { DEFAULT_EQ_BANDS } from "../../types";

// Mock the audio engine so no real AudioContext is needed
vi.mock("../../audio/engine", () => ({
  applyGain: vi.fn(),
}));

function resetStore() {
  usePlayerStore.setState({
    stemVolumes: { vocals: 1, bass: 1, drums: 1, other: 1 },
    stemMuted: { vocals: false, bass: false, drums: false, other: false },
    stemEq: {
      vocals: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
      bass: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("StemsStack", () => {
  const stems = ["vocals", "bass", "drums", "other"] as const;

  it("renders one StemCard per stem", () => {
    render(<StemsStack stems={[...stems]} loading={false} />);
    expect(document.querySelectorAll(".stem-card")).toHaveLength(4);
  });

  it("adds loading class when loading prop is true", () => {
    render(<StemsStack stems={[...stems]} loading={true} />);
    expect(document.querySelector("#stems-grid")).toHaveClass("loading");
  });

  it("does not add loading class when loading is false", () => {
    render(<StemsStack stems={[...stems]} loading={false} />);
    expect(document.querySelector("#stems-grid")).not.toHaveClass("loading");
  });

  it("updates store volume via slider change", () => {
    render(<StemsStack stems={["bass"]} loading={false} />);
    const slider = screen.getByRole("slider", { name: "bass volume" });
    fireEvent.change(slider, { target: { value: "150" } });
    expect(usePlayerStore.getState().stemVolumes["bass"]).toBe(1.5);
  });

  it("toggles mute state via mute button click", () => {
    render(<StemsStack stems={["bass"]} loading={false} />);
    const muteBtn = screen.getByRole("button", { name: "Mute bass" });
    fireEvent.click(muteBtn);
    expect(usePlayerStore.getState().stemMuted["bass"]).toBe(true);
    // Click again to unmute
    const unmuteBtn = screen.getByRole("button", { name: "Unmute bass" });
    fireEvent.click(unmuteBtn);
    expect(usePlayerStore.getState().stemMuted["bass"]).toBe(false);
  });

  it("renders empty container for empty stems array", () => {
    render(<StemsStack stems={[]} loading={false} />);
    expect(document.querySelectorAll(".stem-card")).toHaveLength(0);
  });
});
