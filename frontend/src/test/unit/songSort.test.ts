import { describe, it, expect } from "vitest";
import { sortSongs } from "../../utils/songSort";
import type { Song } from "../../types";

function makeSong(overrides: Partial<Song> & { id: string }): Song {
  return {
    filename: `song_${overrides.id}.mp3`,
    artist: null,
    title: null,
    status: "ready",
    stems: ["vocals", "bass", "drums", "other"],
    created_at: null,
    last_used_at: null,
    ...overrides,
  };
}

describe("sortSongs", () => {
  describe("does not mutate the input array", () => {
    it("returns a new array", () => {
      const songs = [makeSong({ id: "a" }), makeSong({ id: "b" })];
      const result = sortSongs(songs, "alphabetical");
      expect(result).not.toBe(songs);
    });
  });

  describe("alphabetical order (artist + title)", () => {
    it("sorts by getSongLabel ascending", () => {
      const songs = [
        makeSong({ id: "1", artist: "ZZ Top", title: "Sharp Dressed Man" }),
        makeSong({ id: "2", artist: "ABBA", title: "Dancing Queen" }),
        makeSong({ id: "3", artist: "Madonna", title: "Like a Prayer" }),
      ];
      const sorted = sortSongs(songs, "alphabetical");
      expect(sorted.map((s) => s.id)).toEqual(["2", "3", "1"]);
    });
  });

  describe("title order", () => {
    it("sorts by title only, ascending", () => {
      const songs = [
        makeSong({ id: "1", title: "Zebra" }),
        makeSong({ id: "2", title: "Apple" }),
        makeSong({ id: "3", title: "Mango" }),
      ];
      const sorted = sortSongs(songs, "title");
      expect(sorted.map((s) => s.id)).toEqual(["2", "3", "1"]);
    });
  });

  describe("last-used order", () => {
    it("sorts most-recently-used first", () => {
      const songs = [
        makeSong({ id: "1", last_used_at: "2024-01-01T00:00:00Z" }),
        makeSong({ id: "2", last_used_at: "2024-03-01T00:00:00Z" }),
        makeSong({ id: "3", last_used_at: "2024-02-01T00:00:00Z" }),
      ];
      const sorted = sortSongs(songs, "last-used");
      expect(sorted.map((s) => s.id)).toEqual(["2", "3", "1"]);
    });

    it("puts songs without last_used_at at the end", () => {
      const songs = [
        makeSong({ id: "1", last_used_at: null }),
        makeSong({ id: "2", last_used_at: "2024-01-01T00:00:00Z" }),
        makeSong({ id: "3", last_used_at: null }),
      ];
      const sorted = sortSongs(songs, "last-used");
      expect(sorted[0].id).toBe("2");
    });
  });

  describe("recent order (by created_at)", () => {
    it("sorts most-recently-created first", () => {
      const songs = [
        makeSong({ id: "1", created_at: "2024-01-01T00:00:00Z" }),
        makeSong({ id: "2", created_at: "2024-03-01T00:00:00Z" }),
        makeSong({ id: "3", created_at: "2024-02-01T00:00:00Z" }),
      ];
      const sorted = sortSongs(songs, "recent");
      expect(sorted.map((s) => s.id)).toEqual(["2", "3", "1"]);
    });

    it("puts songs without created_at at the end", () => {
      const songs = [
        makeSong({ id: "1", created_at: null }),
        makeSong({ id: "2", created_at: "2024-01-01T00:00:00Z" }),
      ];
      const sorted = sortSongs(songs, "recent");
      expect(sorted[0].id).toBe("2");
    });
  });

  describe("empty and single-element inputs", () => {
    it("returns empty array for empty input", () => {
      expect(sortSongs([], "alphabetical")).toEqual([]);
    });

    it("returns single-element array unchanged", () => {
      const songs = [makeSong({ id: "only" })];
      expect(sortSongs(songs, "recent").map((s) => s.id)).toEqual(["only"]);
    });
  });
});
