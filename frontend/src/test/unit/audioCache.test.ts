import { describe, it, expect, beforeEach } from "vitest";
import * as cache from "../../audio/audioCache";

beforeEach(() => {
  cache.clear();
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
});
