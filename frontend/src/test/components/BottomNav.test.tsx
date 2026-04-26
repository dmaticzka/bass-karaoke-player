import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomNav } from "../../components/BottomNav";
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
  usePlayerStore.setState({ activeTab: "library", activeSong: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("BottomNav", () => {
  it("renders the nav landmark", () => {
    render(<BottomNav onTabChange={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("renders three tab buttons", () => {
    render(<BottomNav onTabChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("Library tab is active initially", () => {
    render(<BottomNav onTabChange={vi.fn()} />);
    const libraryTab = screen.getByRole("button", { name: "Library" });
    expect(libraryTab).toHaveClass("active");
  });

  it("Player tab is disabled when no song is loaded", () => {
    render(<BottomNav onTabChange={vi.fn()} />);
    const playerTab = screen.getByRole("button", { name: "Player" });
    expect(playerTab).toBeDisabled();
    expect(playerTab).toHaveClass("disabled");
  });

  it("EQ tab is disabled when no song is loaded", () => {
    render(<BottomNav onTabChange={vi.fn()} />);
    const eqTab = screen.getByRole("button", { name: "EQ" });
    expect(eqTab).toBeDisabled();
  });

  it("Player tab is enabled when a song is loaded", () => {
    usePlayerStore.setState({ activeSong });
    render(<BottomNav onTabChange={vi.fn()} />);
    const playerTab = screen.getByRole("button", { name: "Player" });
    expect(playerTab).not.toBeDisabled();
  });

  it("calls onTabChange with 'library' when Library tab is clicked", () => {
    const onTabChange = vi.fn();
    render(<BottomNav onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(onTabChange).toHaveBeenCalledWith("library");
  });

  it("calls onTabChange with 'player' when Player tab is clicked and a song is loaded", () => {
    const onTabChange = vi.fn();
    usePlayerStore.setState({ activeSong });
    render(<BottomNav onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Player" }));
    expect(onTabChange).toHaveBeenCalledWith("player");
  });

  it("does NOT call onTabChange when disabled tab is clicked", () => {
    const onTabChange = vi.fn();
    render(<BottomNav onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Player" }));
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("active tab has aria-current='page'", () => {
    render(<BottomNav onTabChange={vi.fn()} />);
    const libraryTab = screen.getByRole("button", { name: "Library" });
    expect(libraryTab).toHaveAttribute("aria-current", "page");
  });

  it("inactive tab has no aria-current", () => {
    render(<BottomNav onTabChange={vi.fn()} />);
    const eqTab = screen.getByRole("button", { name: "EQ" });
    expect(eqTab).not.toHaveAttribute("aria-current");
  });
});
