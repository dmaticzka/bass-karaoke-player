import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SongList } from "../../components/SongList";
import { usePlayerStore } from "../../store/playerStore";
import type { Song } from "../../types";

// Mock the api module
vi.mock("../../api/client", () => ({
  api: {
    deleteSong: vi.fn().mockResolvedValue(undefined),
    getSongs: vi.fn().mockResolvedValue({ songs: [] }),
  },
}));

const readySong: Song = {
  id: "s1",
  filename: "test_song.mp3",
  artist: null,
  title: null,
  status: "ready",
  stems: ["vocals", "bass", "drums", "other"],
};

const splittingSong: Song = {
  id: "s2",
  filename: "splitting.mp3",
  artist: "Artist",
  title: "Title",
  status: "splitting",
  stems: [],
};

const errorSong: Song = {
  id: "s3",
  filename: "error_song.mp3",
  artist: null,
  title: null,
  status: "error",
  stems: [],
  error_message: "stem splitting failed",
};

function resetStore(songs: Song[] = []) {
  usePlayerStore.setState({ songs, activeSong: null, songSortOrder: "last-used" });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("SongList", () => {
  it("shows empty message when no songs", () => {
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByText(/No songs uploaded yet/)).toBeInTheDocument();
  });

  it("renders one row per song", () => {
    resetStore([readySong, splittingSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(document.querySelectorAll(".song-item")).toHaveLength(2);
  });

  it("shows 'Ready' badge for ready song", () => {
    resetStore([readySong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows 'Splitting…' badge for splitting song", () => {
    resetStore([splittingSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByText("Splitting…")).toBeInTheDocument();
  });

  it("shows 'Error' badge for error song", () => {
    resetStore([errorSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows Load button only for ready songs", () => {
    resetStore([readySong, splittingSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getAllByText("Load")).toHaveLength(1);
  });

  it("calls onLoadSong with the song when Load is clicked", () => {
    const onLoadSong = vi.fn();
    resetStore([readySong]);
    render(<SongList onLoadSong={onLoadSong} />);
    fireEvent.click(screen.getByText("Load"));
    expect(onLoadSong).toHaveBeenCalledWith(readySong);
  });

  it("marks active song row with 'active' class", () => {
    resetStore([readySong]);
    usePlayerStore.setState({ activeSong: readySong });
    render(<SongList onLoadSong={vi.fn()} />);
    const row = document.querySelector(`[data-id="${readySong.id}"]`);
    expect(row).toHaveClass("active");
  });

  it("shows 'Active' button text for the currently active song", () => {
    resetStore([readySong]);
    usePlayerStore.setState({ activeSong: readySong });
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows 'Unknown Artist' for song with no artist metadata", () => {
    resetStore([readySong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByText("Unknown Artist")).toBeInTheDocument();
  });

  it("shows actual artist when metadata is present", () => {
    resetStore([splittingSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByText("Artist")).toBeInTheDocument();
  });

  it("refresh button is present", () => {
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Refresh song list" })).toBeInTheDocument();
  });

  it("sort order select is present", () => {
    render(<SongList onLoadSong={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Sort order" })).toBeInTheDocument();
  });

  it("changing sort order updates the store", () => {
    render(<SongList onLoadSong={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Sort order" });
    fireEvent.change(select, { target: { value: "alphabetical" } });
    expect(usePlayerStore.getState().songSortOrder).toBe("alphabetical");
  });
});
