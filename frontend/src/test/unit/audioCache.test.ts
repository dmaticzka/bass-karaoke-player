import { describe, it, expect, vi, afterEach } from "vitest";
import * as cache from "../../audio/audioCache";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// fetchWithCache
// ---------------------------------------------------------------------------

describe("fetchWithCache", () => {
  it("fetches from the network and returns the ArrayBuffer", async () => {
    const bytes = new Uint8Array([10, 20, 30]).buffer;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes.slice(0))));

    const result = await cache.fetchWithCache("http://x/stem");
    expect(new Uint8Array(result)).toEqual(new Uint8Array([10, 20, 30]));
  });

  it("passes the URL directly to fetch", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1]).buffer));
    vi.stubGlobal("fetch", mockFetch);

    await cache.fetchWithCache("http://x/my-stem");
    expect(mockFetch).toHaveBeenCalledWith("http://x/my-stem");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    await expect(cache.fetchWithCache("http://x/missing")).rejects.toThrow("404");
  });

  it("propagates network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));

    await expect(cache.fetchWithCache("http://x/stem")).rejects.toThrow(
      "network error",
    );
  });
});

// ---------------------------------------------------------------------------
// hasCached
// ---------------------------------------------------------------------------

/** Build a minimal CacheStorage stub backed by an in-memory map. */
function makeMockCaches() {
  const store = new Map<string, Map<string, Response>>();
  return {
    open: vi.fn(async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const bucket = store.get(name)!;
      return {
        match: vi.fn(async (req: RequestInfo | URL) => {
          const key = typeof req === "string" ? req : (req as Request).url;
          return bucket.get(key);
        }),
        put: vi.fn(async (req: RequestInfo | URL, resp: Response) => {
          const key = typeof req === "string" ? req : (req as Request).url;
          bucket.set(key, resp);
        }),
        delete: vi.fn(async (req: RequestInfo | URL) => {
          const key = typeof req === "string" ? req : (req as Request).url;
          return bucket.delete(key);
        }),
      };
    }),
    store,
  };
}

describe("hasCached", () => {
  it("returns false when Cache Storage is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await cache.hasCached(["http://x/stem"])).toBe(false);
  });

  it("returns false for an empty URL list", async () => {
    const mockCaches = makeMockCaches();
    vi.stubGlobal("caches", mockCaches);
    expect(await cache.hasCached([])).toBe(false);
  });

  it("returns false when a URL is missing from the SW cache", async () => {
    const mockCaches = makeMockCaches();
    vi.stubGlobal("caches", mockCaches);
    expect(await cache.hasCached(["http://x/missing"])).toBe(false);
  });

  it("returns true when all URLs are present in the SW cache", async () => {
    const mockCaches = makeMockCaches();
    vi.stubGlobal("caches", mockCaches);

    const diskCache = await mockCaches.open(cache.CACHE_STORAGE_NAME);
    await diskCache.put("http://x/stem1", new Response(new Uint8Array([1]).buffer));
    await diskCache.put("http://x/stem2", new Response(new Uint8Array([2]).buffer));

    expect(await cache.hasCached(["http://x/stem1", "http://x/stem2"])).toBe(true);
  });

  it("returns false when only some URLs are cached", async () => {
    const mockCaches = makeMockCaches();
    vi.stubGlobal("caches", mockCaches);

    const diskCache = await mockCaches.open(cache.CACHE_STORAGE_NAME);
    await diskCache.put("http://x/stem1", new Response(new Uint8Array([1]).buffer));

    expect(
      await cache.hasCached(["http://x/stem1", "http://x/stem2"]),
    ).toBe(false);
  });

  it("returns false when Cache Storage throws", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    });
    expect(await cache.hasCached(["http://x/stem"])).toBe(false);
  });

  it("uses the bass-karaoke-stems-v1 cache bucket", async () => {
    const mockCaches = makeMockCaches();
    vi.stubGlobal("caches", mockCaches);

    await cache.hasCached(["http://x/stem"]);
    expect(mockCaches.open).toHaveBeenCalledWith(cache.CACHE_STORAGE_NAME);
    expect(cache.CACHE_STORAGE_NAME).toBe("bass-karaoke-stems-v1");
  });
});

