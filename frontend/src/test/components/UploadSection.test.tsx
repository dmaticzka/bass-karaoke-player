import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { UploadSection } from "../../components/UploadSection";
import { usePlayerStore } from "../../store/playerStore";
import { api } from "../../api/client";

// vi.mock is hoisted — use vi.fn() directly in the factory, not external variables
vi.mock("../../api/client", () => ({
  api: {
    uploadSong: vi.fn(),
    getSongs: vi.fn(),
    getSong: vi.fn(),
  },
}));

const mockUploadSong = vi.mocked(api.uploadSong);
const mockGetSongs = vi.mocked(api.getSongs);

function resetStore() {
  usePlayerStore.setState({
    uploadProgress: null,
    uploadStatus: "",
    songs: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mockGetSongs.mockResolvedValue({ songs: [] });
});

describe("UploadSection", () => {
  it("renders the drop-zone", () => {
    render(<UploadSection />);
    expect(document.querySelector("#drop-zone")).toBeInTheDocument();
  });

  it("renders the Browse Files button", () => {
    render(<UploadSection />);
    expect(screen.getByRole("button", { name: "Browse Files" })).toBeInTheDocument();
  });

  it("does not show progress bar initially", () => {
    render(<UploadSection />);
    expect(document.querySelector("#upload-bar")).not.toBeInTheDocument();
  });

  it("shows progress bar during upload", async () => {
    // uploadSong resolves after we've had a chance to check UI
    let resolveUpload!: (song: { id: string; filename: string; status: string; stems: never[] }) => void;
    mockUploadSong.mockImplementation(
      (
        _file: File,
        onProgress: (pct: number) => void,
      ) =>
        new Promise((resolve) => {
          onProgress(50);
          resolveUpload = resolve;
        }),
    );

    render(<UploadSection />);
    const fileInput = document.querySelector("#file-input") as HTMLInputElement;
    const file = new File(["audio"], "track.mp3", { type: "audio/mpeg" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(document.querySelector("#upload-bar")).toBeInTheDocument();
    // Clean up
    await act(async () => {
      resolveUpload({ id: "x", filename: "track.mp3", status: "uploaded", stems: [] });
    });
  });

  it("shows success status after upload completes", async () => {
    mockUploadSong.mockImplementation(
      (_file: File, onProgress: (pct: number) => void) => {
        onProgress(100);
        return Promise.resolve({ id: "new", filename: "track.mp3", status: "uploaded", stems: [] });
      },
    );
    mockGetSongs.mockResolvedValue({ songs: [] });

    render(<UploadSection />);
    const fileInput = document.querySelector("#file-input") as HTMLInputElement;
    const file = new File(["audio"], "track.mp3", { type: "audio/mpeg" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByText(/Uploaded!/)).toBeInTheDocument();
  });

  it("shows error status when upload fails", async () => {
    mockUploadSong.mockRejectedValue(new Error("Server error"));

    render(<UploadSection />);
    const fileInput = document.querySelector("#file-input") as HTMLInputElement;
    const file = new File(["audio"], "bad.mp3", { type: "audio/mpeg" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByText(/Server error/)).toBeInTheDocument();
  });

  it("accepts drag-over without error", () => {
    render(<UploadSection />);
    const dropZone = document.querySelector("#drop-zone") as HTMLElement;
    expect(() => {
      fireEvent.dragOver(dropZone);
    }).not.toThrow();
  });

  it("adds drag-over class during drag-over event", () => {
    render(<UploadSection />);
    const dropZone = document.querySelector("#drop-zone") as HTMLElement;
    fireEvent.dragOver(dropZone);
    expect(dropZone).toHaveClass("drag-over");
  });

  it("removes drag-over class on drag-leave", () => {
    render(<UploadSection />);
    const dropZone = document.querySelector("#drop-zone") as HTMLElement;
    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveClass("drag-over");
  });

  it("drop event triggers upload with dropped file", async () => {
    mockUploadSong.mockImplementation(
      (_file: File, onProgress: (pct: number) => void) => {
        onProgress(100);
        return Promise.resolve({ id: "drop1", filename: "dropped.mp3", status: "uploaded", stems: [] });
      },
    );
    mockGetSongs.mockResolvedValue({ songs: [] });

    render(<UploadSection />);
    const dropZone = document.querySelector("#drop-zone") as HTMLElement;
    const file = new File(["audio"], "dropped.mp3", { type: "audio/mpeg" });
    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });
    });
    expect(mockUploadSong).toHaveBeenCalledWith(file, expect.any(Function));
  });

  it("drop event with no files does nothing", async () => {
    render(<UploadSection />);
    const dropZone = document.querySelector("#drop-zone") as HTMLElement;
    await act(async () => {
      fireEvent.drop(dropZone, { dataTransfer: { files: [] } });
    });
    expect(mockUploadSong).not.toHaveBeenCalled();
  });

  it("keydown Enter on drop-zone triggers file input click", () => {
    render(<UploadSection />);
    const dropZone = document.querySelector("#drop-zone") as HTMLElement;
    const fileInput = document.querySelector("#file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.keyDown(dropZone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalled();
  });

  it("keydown Space on drop-zone triggers file input click", () => {
    render(<UploadSection />);
    const dropZone = document.querySelector("#drop-zone") as HTMLElement;
    const fileInput = document.querySelector("#file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.keyDown(dropZone, { key: " " });
    expect(clickSpy).toHaveBeenCalled();
  });

  it("polling updates song status when ready", async () => {
    vi.useFakeTimers();
    const getSong = vi.mocked(api.getSong);
    // First poll: still splitting; second: ready
    getSong
      .mockResolvedValueOnce({ id: "p1", filename: "p.mp3", status: "splitting", stems: [], artist: null, title: null })
      .mockResolvedValueOnce({ id: "p1", filename: "p.mp3", status: "ready", stems: ["vocals"], artist: null, title: null });

    mockUploadSong.mockImplementation(
      (_file: File, onProgress: (pct: number) => void) => {
        onProgress(100);
        return Promise.resolve({ id: "p1", filename: "p.mp3", status: "uploaded", stems: [], artist: null, title: null });
      },
    );
    mockGetSongs.mockResolvedValue({ songs: [] });

    render(<UploadSection />);
    const fileInput = document.querySelector("#file-input") as HTMLInputElement;
    const file = new File(["audio"], "p.mp3");
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // First poll: still splitting
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    // Second poll: ready
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(getSong).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("polling shows error message when song status is error", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getSong).mockResolvedValue({
      id: "e1", filename: "e.mp3", status: "error", stems: [],
      error_message: "processing failed", artist: null, title: null,
    });

    mockUploadSong.mockImplementation(
      (_file: File, onProgress: (pct: number) => void) => {
        onProgress(100);
        return Promise.resolve({ id: "e1", filename: "e.mp3", status: "uploaded", stems: [], artist: null, title: null });
      },
    );
    mockGetSongs.mockResolvedValue({ songs: [] });

    render(<UploadSection />);
    const fileInput = document.querySelector("#file-input") as HTMLInputElement;
    const file = new File(["audio"], "e.mp3");
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(screen.getByText(/processing failed/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
