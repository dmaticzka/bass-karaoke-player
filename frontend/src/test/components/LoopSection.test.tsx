import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoopSection } from "../../components/LoopSection";
import { usePlayerStore } from "../../store/playerStore";

function resetStore() {
  usePlayerStore.setState({
    duration: 120,
    loopEnabled: false,
    loopStart: null,
    loopEnd: null,
    loopHistory: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

const defaultProps = {
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
  onLoopShift: vi.fn(),
  onAddCurrentToHistory: vi.fn(),
  onRemoveCurrentInterval: vi.fn(),
  onRestoreHistoryItem: vi.fn(),
  onRemoveHistoryItem: vi.fn(),
  onClearLoopHistory: vi.fn(),
};

describe("LoopSection", () => {
  it("calls onLoopToggle when loop toggle button is clicked", () => {
    const onLoopToggle = vi.fn();
    render(<LoopSection {...defaultProps} onLoopToggle={onLoopToggle} />);
    fireEvent.click(screen.getByTitle("Toggle A-B loop"));
    expect(onLoopToggle).toHaveBeenCalledTimes(1);
  });

  it("loop A/B/Clear buttons are disabled when loop is not enabled", () => {
    render(<LoopSection {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Set A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear B" })).toBeDisabled();
  });

  it("loop A/B/Clear buttons are enabled when loop is enabled", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 60 });
    render(<LoopSection {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Set A" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Set B" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear A" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear B" })).not.toBeDisabled();
  });

  it("shows A and B times in the slider row labels when loop is active", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 50 });
    render(<LoopSection {...defaultProps} />);
    expect(screen.getByText("A: 0:10")).toBeInTheDocument();
    expect(screen.getByText("B: 0:50")).toBeInTheDocument();
  });

  it("calls onLoopClearA when Clear A button is clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 60 });
    const onLoopClearA = vi.fn();
    render(<LoopSection {...defaultProps} onLoopClearA={onLoopClearA} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear A" }));
    expect(onLoopClearA).toHaveBeenCalledTimes(1);
  });

  it("calls onLoopClearB when Clear B button is clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 60 });
    const onLoopClearB = vi.fn();
    render(<LoopSection {...defaultProps} onLoopClearB={onLoopClearB} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear B" }));
    expect(onLoopClearB).toHaveBeenCalledTimes(1);
  });

  it("calls onLoopSetAValue when A slider changes (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 120 });
    const onLoopSetAValue = vi.fn();
    render(<LoopSection {...defaultProps} onLoopSetAValue={onLoopSetAValue} />);
    const slider = screen.getByRole("slider", { name: "Loop start (A point)" });
    fireEvent.change(slider, { target: { value: "30" } });
    expect(onLoopSetAValue).toHaveBeenCalledWith(30);
  });

  it("calls onLoopSetBValue when B slider changes (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 120 });
    const onLoopSetBValue = vi.fn();
    render(<LoopSection {...defaultProps} onLoopSetBValue={onLoopSetBValue} />);
    const slider = screen.getByRole("slider", { name: "Loop end (B point)" });
    fireEvent.change(slider, { target: { value: "90" } });
    expect(onLoopSetBValue).toHaveBeenCalledWith(90);
  });

  it("A/B sliders are disabled when loop is not enabled", () => {
    render(<LoopSection {...defaultProps} />);
    expect(screen.getByRole("slider", { name: "Loop start (A point)" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Loop end (B point)" })).toBeDisabled();
  });

  it("A/B sliders are enabled when loop is enabled", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 60 });
    render(<LoopSection {...defaultProps} />);
    expect(screen.getByRole("slider", { name: "Loop start (A point)" })).not.toBeDisabled();
    expect(screen.getByRole("slider", { name: "Loop end (B point)" })).not.toBeDisabled();
  });

  it("calls onLoopAdjustA(-10) when A -10s button clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 30, loopEnd: 90 });
    const onLoopAdjustA = vi.fn();
    render(<LoopSection {...defaultProps} onLoopAdjustA={onLoopAdjustA} />);
    fireEvent.click(screen.getByRole("button", { name: "Move A point -10 seconds" }));
    expect(onLoopAdjustA).toHaveBeenCalledWith(-10);
  });

  it("calls onLoopAdjustB(+5) when B +5s button clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 0, loopEnd: 60 });
    const onLoopAdjustB = vi.fn();
    render(<LoopSection {...defaultProps} onLoopAdjustB={onLoopAdjustB} />);
    fireEvent.click(screen.getByRole("button", { name: "Move B point +5 seconds" }));
    expect(onLoopAdjustB).toHaveBeenCalledWith(5);
  });

  it("A<B<Ω button is disabled when loop is not enabled", () => {
    render(<LoopSection {...defaultProps} />);
    expect(document.querySelector("#loop-shift-btn")).toBeDisabled();
  });

  it("A<B<Ω button is enabled when loop is enabled", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 40 });
    render(<LoopSection {...defaultProps} />);
    expect(document.querySelector("#loop-shift-btn")).not.toBeDisabled();
  });

  it("calls onLoopShift when A<B<Ω button is clicked (loop enabled)", () => {
    usePlayerStore.setState({ loopEnabled: true, loopStart: 10, loopEnd: 40 });
    const onLoopShift = vi.fn();
    render(<LoopSection {...defaultProps} onLoopShift={onLoopShift} />);
    fireEvent.click(document.querySelector("#loop-shift-btn")!);
    expect(onLoopShift).toHaveBeenCalledTimes(1);
  });

  describe("AB Loop collapsible header", () => {
    it("renders a collapsible-header wrapping the AB Loop title", () => {
      render(<LoopSection {...defaultProps} />);
      expect(document.querySelector(".collapsible-header")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "AB Loop" })).toBeInTheDocument();
    });

    it("AB loop body is expanded by default", () => {
      render(<LoopSection {...defaultProps} />);
      expect(document.querySelector(".collapsible-body.expanded")).toBeInTheDocument();
    });

    it("clicking the AB Loop collapsible header collapses the loop body", () => {
      render(<LoopSection {...defaultProps} />);
      fireEvent.click(document.querySelector(".collapsible-header")!);
      expect(document.querySelector(".collapsible-body.collapsed")).toBeInTheDocument();
    });

    it("clicking the AB Loop collapsible header again expands the loop body", () => {
      render(<LoopSection {...defaultProps} />);
      const header = document.querySelector(".collapsible-header")!;
      fireEvent.click(header);
      fireEvent.click(header);
      expect(document.querySelector(".collapsible-body.expanded")).toBeInTheDocument();
    });

    it("toggle button has aria-label 'Collapse AB loop' when expanded", () => {
      render(<LoopSection {...defaultProps} />);
      expect(document.querySelector(".collapsible-toggle")).toHaveAttribute(
        "aria-label",
        "Collapse AB loop",
      );
    });

    it("toggle button has aria-label 'Expand AB loop' when collapsed", () => {
      render(<LoopSection {...defaultProps} />);
      fireEvent.click(document.querySelector(".collapsible-header")!);
      expect(document.querySelector(".collapsible-toggle")).toHaveAttribute(
        "aria-label",
        "Expand AB loop",
      );
    });
  });
});
