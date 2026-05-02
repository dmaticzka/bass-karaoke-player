import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SongList } from "../../components/SongList";
import { usePlayerStore } from "../../store/playerStore";
import type { Song } from "../../types";

vi.mock("../../audio/audioCache", () => ({
  hasCached: vi.fn().mockResolvedValue(false),
}));

// Mock the api module
vi.mock("../../api/client", () => ({
  api: {
    deleteSong: vi.fn().mockResolvedValue(undefined),
    getSongs: vi.fn().mockResolvedValue({ songs: [] }),
    stemUrl: vi.fn().mockImplementation((id: string, stem: string) => `/api/songs/${id}/stems/${stem}`),
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

  it("does not render a status badge for any song", () => {
    resetStore([readySong, splittingSong, errorSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(document.querySelector(".song-status-badge")).not.toBeInTheDocument();
  });

  it("shows disabled 'Splitting…' button for splitting song", () => {
    resetStore([splittingSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    const btn = screen.getByText("Splitting…");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("splitting button has status-splitting class (pulsates)", () => {
    resetStore([splittingSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(document.querySelector(".song-load-btn.status-splitting")).toBeInTheDocument();
  });

  it("does not show a load button for error songs", () => {
    resetStore([errorSong]);
    render(<SongList onLoadSong={vi.fn()} />);
    expect(document.querySelector(".song-load-btn")).not.toBeInTheDocument();
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

  it("load button has song-cached class when all stems are in SW cache", async () => {
    const audioCache = await import("../../audio/audioCache");
    vi.mocked(audioCache.hasCached).mockResolvedValue(true);
    resetStore([readySong]);
    render(<SongList onLoadSong={vi.fn()} />);
    await waitFor(() => {
      expect(document.querySelector(".song-load-btn.song-cached")).toBeInTheDocument();
    });
  });

  it("does not add song-cached class when stems are not in SW cache", async () => {
    const audioCache = await import("../../audio/audioCache");
    vi.mocked(audioCache.hasCached).mockResolvedValue(false);
    resetStore([readySong]);
    render(<SongList onLoadSong={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector(".song-load-btn.song-cached")).not.toBeInTheDocument();
  });

  it("uses stemUrl to check cache for each stem", async () => {
    const audioCache = await import("../../audio/audioCache");
    const { api } = await import("../../api/client");
    vi.mocked(audioCache.hasCached).mockResolvedValue(true);
    resetStore([readySong]);
    render(<SongList onLoadSong={vi.fn()} />);
    await waitFor(() => {
      expect(document.querySelector(".song-load-btn.song-cached")).toBeInTheDocument();
    });
    expect(vi.mocked(api.stemUrl)).toHaveBeenCalledWith("s1", "vocals");
    expect(vi.mocked(api.stemUrl)).toHaveBeenCalledWith("s1", "bass");
  });
});
