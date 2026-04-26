import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StemCard } from "../../components/StemCard";

describe("StemCard", () => {
  const defaultProps = {
    stem: "bass" as const,
    volume: 1,
    muted: false,
    onVolumeChange: vi.fn(),
    onMuteToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the stem name label", () => {
    render(<StemCard {...defaultProps} />);
    expect(screen.getByText("bass")).toBeInTheDocument();
  });

  it("displays the volume as a percentage", () => {
    render(<StemCard {...defaultProps} volume={0.75} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("has the correct data-testid attribute", () => {
    render(<StemCard {...defaultProps} />);
    expect(document.querySelector('[data-testid="stem-card-bass"]')).toBeInTheDocument();
  });

  it("renders the mute button with 'Mute' label when not muted", () => {
    render(<StemCard {...defaultProps} muted={false} />);
    expect(screen.getByRole("button", { name: "Mute bass" })).toBeInTheDocument();
  });

  it("renders the mute button with 'Unmute' label when muted", () => {
    render(<StemCard {...defaultProps} muted={true} />);
    expect(screen.getByRole("button", { name: "Unmute bass" })).toBeInTheDocument();
  });

  it("calls onMuteToggle when mute button is clicked", () => {
    const onMuteToggle = vi.fn();
    render(<StemCard {...defaultProps} onMuteToggle={onMuteToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Mute bass" }));
    expect(onMuteToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onVolumeChange with normalised value when slider changes", () => {
    const onVolumeChange = vi.fn();
    render(<StemCard {...defaultProps} onVolumeChange={onVolumeChange} />);
    const slider = screen.getByRole("slider", { name: "bass volume" });
    fireEvent.change(slider, { target: { value: "150" } });
    expect(onVolumeChange).toHaveBeenCalledWith(1.5);
  });

  it("volume slider max is 200", () => {
    render(<StemCard {...defaultProps} />);
    const slider = screen.getByRole("slider", { name: "bass volume" });
    expect(slider).toHaveAttribute("max", "200");
  });

  it("omits borderColor style when muted", () => {
    render(<StemCard {...defaultProps} muted={true} />);
    const card = document.querySelector('[data-testid="stem-card-bass"]') as HTMLElement;
    // borderColor should be undefined/empty when muted
    expect(card.style.borderColor).toBe("");
  });
});
