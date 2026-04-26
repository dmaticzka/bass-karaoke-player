import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../../api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: "Status " + String(status),
      json: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("api.getConfig", () => {
  it("resolves with parsed JSON on 200", async () => {
    mockFetch(200, { max_versions_global: 99 });
    const cfg = await api.getConfig();
    expect(cfg.max_versions_global).toBe(99);
  });

  it("throws on non-2xx status", async () => {
    mockFetch(500, {});
    await expect(api.getConfig()).rejects.toThrow("500");
  });
});

describe("api.getSongs", () => {
  it("calls /api/songs and returns song list", async () => {
    const songs = [{ id: "1", filename: "a.mp3" }];
    mockFetch(200, { songs });
    const result = await api.getSongs();
    expect(result.songs).toHaveLength(1);
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith("/api/songs");
  });
});

describe("api.getSong", () => {
  it("calls /api/songs/:id", async () => {
    mockFetch(200, { id: "abc" });
    await api.getSong("abc");
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith("/api/songs/abc");
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("api.touchSong", () => {
  it("POSTs to /api/songs/:id/touch and returns song", async () => {
    const song = { id: "s1", filename: "test.mp3" };
    mockFetch(200, song);
    const result = await api.touchSong("s1");
    expect(result).toMatchObject({ id: "s1" });
    const fetchMock = vi.mocked(globalThis.fetch);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/songs/s1/touch",
    );
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("POST");
  });

  it("sends Content-Type: application/json", async () => {
    mockFetch(200, {});
    await api.touchSong("s1");
    const fetchMock = vi.mocked(globalThis.fetch);
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws with detail message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: () => Promise.resolve({ detail: "validation error" }),
      }),
    );
    await expect(api.touchSong("s1")).rejects.toThrow("validation error");
  });

  it("falls back to statusText when error body has no detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: () => Promise.reject(new Error("not JSON")),
      }),
    );
    await expect(api.touchSong("s1")).rejects.toThrow("Service Unavailable");
  });
});

describe("api.createVersion", () => {
  it("POSTs to /api/songs/:id/versions with body", async () => {
    mockFetch(200, { song_id: "s1", pitch_semitones: 2, tempo_ratio: 1.1, status: "processing" });
    await api.createVersion("s1", { pitch_semitones: 2, tempo_ratio: 1.1 });
    const fetchMock = vi.mocked(globalThis.fetch);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as unknown;
    expect(body).toMatchObject({ pitch_semitones: 2, tempo_ratio: 1.1 });
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("api.deleteSong", () => {
  it("sends DELETE to /api/songs/:id", async () => {
    mockFetch(204, null);
    await api.deleteSong("s1");
    const fetchMock = vi.mocked(globalThis.fetch);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("DELETE");
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe("/api/songs/s1");
  });

  it("does not throw on 404 (already deleted)", async () => {
    mockFetch(404, {});
    await expect(api.deleteSong("missing")).resolves.toBeUndefined();
  });

  it("throws on non-2xx and non-404", async () => {
    mockFetch(500, {});
    await expect(api.deleteSong("s1")).rejects.toThrow("500");
  });
});

describe("api.deleteVersion", () => {
  it("sends DELETE to /api/songs/:id/versions with query params", async () => {
    mockFetch(204, null);
    await api.deleteVersion("s1", 2, 0.9);
    const fetchMock = vi.mocked(globalThis.fetch);
    const url = (fetchMock.mock.calls[0] as [string, RequestInit])[0] as string;
    expect(url).toContain("/api/songs/s1/versions");
    expect(url).toContain("pitch=2");
    expect(url).toContain("tempo=0.9");
  });
});

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

describe("api.stemUrl", () => {
  it("returns the correct URL", () => {
    expect(api.stemUrl("s1", "bass")).toBe("/api/songs/s1/stems/bass");
  });
});

describe("api.processedStemUrl", () => {
  it("includes pitch and tempo query params", () => {
    const url = api.processedStemUrl("s1", "vocals", 3, 0.85);
    expect(url).toBe("/api/songs/s1/stems/vocals/processed?pitch=3&tempo=0.85");
  });
});

// ---------------------------------------------------------------------------
// uploadSong (XHR-based)
// ---------------------------------------------------------------------------

describe("api.uploadSong", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with parsed song on status 201", async () => {
    const song = { id: "new", filename: "upload.mp3" };
    const xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      upload: { addEventListener: vi.fn() },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          setTimeout(() => {
            xhrMock.status = 201;
            xhrMock.responseText = JSON.stringify(song);
            handler();
          }, 0);
        }
      }),
      status: 0,
      responseText: "",
    };
    class MockXHR {
      constructor() { return xhrMock; }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    const file = new File(["data"], "upload.mp3", { type: "audio/mpeg" });
    const result = await api.uploadSong(file, vi.fn());
    expect(result).toMatchObject({ id: "new" });
  });

  it("rejects with error message on non-201 status", async () => {
    const xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      upload: { addEventListener: vi.fn() },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          setTimeout(() => {
            xhrMock.status = 422;
            xhrMock.responseText = "Unprocessable";
            handler();
          }, 0);
        }
      }),
      status: 0,
      responseText: "",
    };
    class MockXHR {
      constructor() { return xhrMock; }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    const file = new File(["data"], "upload.mp3");
    await expect(api.uploadSong(file, vi.fn())).rejects.toThrow("Upload failed");
  });

  it("rejects on network error", async () => {
    const xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      upload: { addEventListener: vi.fn() },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "error") {
          setTimeout(handler, 0);
        }
      }),
      status: 0,
      responseText: "",
    };
    class MockXHR {
      constructor() { return xhrMock; }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    const file = new File(["data"], "upload.mp3");
    await expect(api.uploadSong(file, vi.fn())).rejects.toThrow("Network error");
  });

  it("fires progress callback when upload progress is available", async () => {
    const onProgress = vi.fn();
    let progressHandler: ((e: ProgressEvent) => void) | null = null;

    const xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      upload: {
        addEventListener: vi.fn((event: string, handler: (e: ProgressEvent) => void) => {
          if (event === "progress") progressHandler = handler;
        }),
      },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          setTimeout(() => {
            if (progressHandler) {
              progressHandler({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
            }
            xhrMock.status = 201;
            xhrMock.responseText = JSON.stringify({ id: "x" });
            handler();
          }, 0);
        }
      }),
      status: 0,
      responseText: "",
    };
    class MockXHR {
      constructor() { return xhrMock; }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    const file = new File(["data"], "upload.mp3");
    await api.uploadSong(file, onProgress);
    expect(onProgress).toHaveBeenCalledWith(50);
  });
});
