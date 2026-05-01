import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as cache from "../../audio/audioCache";

beforeEach(() => {
  cache.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("audioCache", () => {
  describe("get/set round-trip", () => {
    it("returns a copy of the stored bytes", () => {
      const original = new Uint8Array([1, 2, 3]).buffer;
      cache.set("url1", original);
      const result = cache.get("url1");
      expect(result).not.toBeUndefined();
      expect(new Uint8Array(result!)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("returns a distinct ArrayBuffer (mutation-safety)", () => {
      const original = new Uint8Array([10, 20, 30]).buffer;
      cache.set("url1", original);
      const a = cache.get("url1")!;
      const b = cache.get("url1")!;
      // Mutate `a`; `b` must be unaffected
      new Uint8Array(a)[0] = 99;
      expect(new Uint8Array(b)[0]).toBe(10);
    });

    it("stored copy is independent of caller buffer", () => {
      const buf = new Uint8Array([5, 6, 7]).buffer;
      cache.set("url1", buf);
      // Mutate the original after caching
      new Uint8Array(buf)[0] = 99;
      const result = cache.get("url1")!;
      expect(new Uint8Array(result)[0]).toBe(5);
    });
  });

  describe("get", () => {
    it("returns undefined on a miss", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("promotes entry to MRU position", () => {
      // Fill cache to max - 1, put "target" first (LRU), promote it, then add another entry.
      for (let i = 0; i < cache.MAX_ENTRIES - 1; i++) {
        cache.set(`url${i}`, new Uint8Array([i]).buffer);
      }
      cache.set("target", new Uint8Array([42]).buffer);
      // "target" is MRU now; promote url0 to MRU
      cache.get("url0");
      // Adding one more entry should evict "url1" (the new LRU), not "url0"
      cache.set("newEntry", new Uint8Array([99]).buffer);
      expect(cache.get("url0")).not.toBeUndefined();
      expect(cache.get("url1")).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("never exceeds MAX_ENTRIES", () => {
      for (let i = 0; i < cache.MAX_ENTRIES + 5; i++) {
        cache.set(`url${i}`, new Uint8Array([i]).buffer);
      }
      expect(cache.size()).toBe(cache.MAX_ENTRIES);
    });

    it("evicts the oldest (LRU) entry when at capacity", () => {
      for (let i = 0; i < cache.MAX_ENTRIES; i++) {
        cache.set(`url${i}`, new Uint8Array([i]).buffer);
      }
      // url0 is now LRU; adding one more should evict it
      cache.set("newest", new Uint8Array([255]).buffer);
      expect(cache.get("url0")).toBeUndefined();
      expect(cache.get("newest")).not.toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set("url1", new Uint8Array([1]).buffer);
      cache.set("url2", new Uint8Array([2]).buffer);
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get("url1")).toBeUndefined();
    });
  });

  describe("size", () => {
    it("reflects current entry count", () => {
      expect(cache.size()).toBe(0);
      cache.set("a", new Uint8Array([1]).buffer);
      expect(cache.size()).toBe(1);
      cache.set("b", new Uint8Array([2]).buffer);
      expect(cache.size()).toBe(2);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it("does not increase when overwriting an existing key", () => {
      cache.set("url1", new Uint8Array([1]).buffer);
      cache.set("url1", new Uint8Array([2]).buffer);
      expect(cache.size()).toBe(1);
    });
  });

  describe("has", () => {
    it("returns false for a missing key", () => {
      expect(cache.has("nonexistent")).toBe(false);
    });

    it("returns true for a present key", () => {
      cache.set("url1", new Uint8Array([1]).buffer);
      expect(cache.has("url1")).toBe(true);
    });

    it("does not promote the entry to MRU position", () => {
      // Fill cache to capacity; url0 is LRU.
      for (let i = 0; i < cache.MAX_ENTRIES; i++) {
        cache.set(`url${i}`, new Uint8Array([i]).buffer);
      }
      // has() on url0 must not promote it — adding one more entry should evict it.
      cache.has("url0");
      cache.set("newest", new Uint8Array([99]).buffer);
      expect(cache.has("url0")).toBe(false);
    });

    it("returns false after clear()", () => {
      cache.set("url1", new Uint8Array([1]).buffer);
      cache.clear();
      expect(cache.has("url1")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal CacheStorage stub backed by an in-memory map. */
function makeMockCaches() {
  const store = new Map<string, Map<string, ArrayBuffer>>();
  return {
    open: vi.fn(async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const bucket = store.get(name)!;
      return {
        match: vi.fn(async (req: RequestInfo | URL) => {
          const key = typeof req === "string" ? req : (req as Request).url;
          const bytes = bucket.get(key);
          if (!bytes) return undefined;
          return new Response(bytes);
        }),
        put: vi.fn(async (req: RequestInfo | URL, resp: Response) => {
          const key = typeof req === "string" ? req : (req as Request).url;
          bucket.set(key, await resp.arrayBuffer());
        }),
      };
    }),
    store,
  };
}

// ---------------------------------------------------------------------------
// fetchWithCache
// ---------------------------------------------------------------------------

describe("fetchWithCache", () => {
  describe("L1 hit", () => {
    it("returns bytes from L1 without touching network or Cache Storage", async () => {
      cache.set("http://x/stem", new Uint8Array([1, 2, 3]).buffer);
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await cache.fetchWithCache("http://x/stem");
      expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3]));
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("network fetch", () => {
    it("fetches from network and populates L1 on cache miss", async () => {
      const bytes = new Uint8Array([10, 20, 30]).buffer;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(bytes.slice(0))),
      );

      const result = await cache.fetchWithCache("http://x/stem3");
      expect(new Uint8Array(result)).toEqual(new Uint8Array([10, 20, 30]));
      expect(cache.size()).toBe(1);
    });

    it("stores response in L1 on network fetch", async () => {
      const bytes = new Uint8Array([4, 5, 6]).buffer;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(bytes.slice(0))),
      );

      await cache.fetchWithCache("http://x/stem4");

      // L1 populated; a second call must hit L1 and not call fetch again
      const mockFetch2 = vi.fn();
      vi.stubGlobal("fetch", mockFetch2);
      const result2 = await cache.fetchWithCache("http://x/stem4");
      expect(new Uint8Array(result2)).toEqual(new Uint8Array([4, 5, 6]));
      expect(mockFetch2).not.toHaveBeenCalled();
    });
  });

  describe("Cache Storage write-through", () => {
    it("writes fetched bytes to Cache Storage so hasInOfflineCache returns true immediately", async () => {
      const mockCaches = makeMockCaches();
      vi.stubGlobal("caches", mockCaches);
      const bytes = new Uint8Array([7, 8, 9]).buffer;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(bytes.slice(0))),
      );

      await cache.fetchWithCache("http://x/stem-wt");

      expect(await cache.hasInOfflineCache("http://x/stem-wt")).toBe(true);
    });

    it("the written Cache Storage entry contains the correct bytes", async () => {
      const mockCaches = makeMockCaches();
      vi.stubGlobal("caches", mockCaches);
      const bytes = new Uint8Array([11, 22, 33]).buffer;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(bytes.slice(0))),
      );

      await cache.fetchWithCache("http://x/stem-bytes");

      const bucket = mockCaches.store.get(cache.CACHE_STORAGE_NAME)!;
      const stored = bucket.get("http://x/stem-bytes");
      expect(stored).toBeDefined();
      expect(new Uint8Array(stored!)).toEqual(new Uint8Array([11, 22, 33]));
    });

    it("silently ignores Cache Storage errors during write-through", async () => {
      vi.stubGlobal("caches", {
        open: vi.fn().mockRejectedValue(new Error("quota exceeded")),
      });
      const bytes = new Uint8Array([1, 2]).buffer;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(bytes.slice(0))),
      );

      // Must not throw even if Cache Storage is unavailable
      const result = await cache.fetchWithCache("http://x/stem-err");
      expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2]));
    });

    it("skips Cache Storage write when caches global is unavailable", async () => {
      vi.stubGlobal("caches", undefined);
      const bytes = new Uint8Array([3, 4]).buffer;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(bytes.slice(0))),
      );

      // Must not throw when caches is undefined
      const result = await cache.fetchWithCache("http://x/stem-no-caches");
      expect(new Uint8Array(result)).toEqual(new Uint8Array([3, 4]));
    });
  });
});

// ---------------------------------------------------------------------------
// hasInOfflineCache
// ---------------------------------------------------------------------------

describe("hasInOfflineCache", () => {
  it("returns false when Cache Storage is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await cache.hasInOfflineCache("http://x/stem")).toBe(false);
  });

  it("returns false when the URL is not in the cache bucket", async () => {
    const mockCaches = makeMockCaches();
    vi.stubGlobal("caches", mockCaches);
    expect(await cache.hasInOfflineCache("http://x/missing")).toBe(false);
  });

  it("returns true when the URL is in the cache bucket", async () => {
    const mockCaches = makeMockCaches();
    vi.stubGlobal("caches", mockCaches);
    const diskCache = await mockCaches.open(cache.CACHE_STORAGE_NAME);
    await diskCache.put("http://x/stem", new Response(new Uint8Array([1]).buffer));
    expect(await cache.hasInOfflineCache("http://x/stem")).toBe(true);
  });

  it("returns false when Cache Storage throws", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    });
    expect(await cache.hasInOfflineCache("http://x/stem")).toBe(false);
  });
});
