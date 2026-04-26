import { describe, it, expect } from "vitest";
import { getSongArtist, getSongTitle, getSongLabel } from "../../utils/songDisplay";
import type { Song } from "../../types";

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: "1",
    filename: "artist - title.mp3",
    artist: null,
    title: null,
    status: "ready",
    stems: ["vocals", "bass", "drums", "other"],
    ...overrides,
  };
}

describe("getSongArtist", () => {
  it("returns the artist when present", () => {
    expect(getSongArtist(makeSong({ artist: "The Beatles" }))).toBe("The Beatles");
  });

  it("falls back to 'Unknown Artist' when artist is null", () => {
    expect(getSongArtist(makeSong({ artist: null }))).toBe("Unknown Artist");
  });

  it("falls back to 'Unknown Artist' when artist is empty string", () => {
    expect(getSongArtist(makeSong({ artist: "" }))).toBe("Unknown Artist");
  });

  it("falls back to 'Unknown Artist' when artist is whitespace only", () => {
    expect(getSongArtist(makeSong({ artist: "   " }))).toBe("Unknown Artist");
  });
});

describe("getSongTitle", () => {
  it("returns the metadata title when present", () => {
    expect(getSongTitle(makeSong({ title: "Hey Jude" }))).toBe("Hey Jude");
  });

  it("falls back to filename stem when title is null", () => {
    expect(getSongTitle(makeSong({ title: null, filename: "my_song.mp3" }))).toBe("my_song");
  });

  it("falls back to filename stem when title is empty", () => {
    expect(getSongTitle(makeSong({ title: "", filename: "my_song.flac" }))).toBe("my_song");
  });

  it("falls back to filename stem when title is whitespace only", () => {
    expect(getSongTitle(makeSong({ title: "  ", filename: "my_song.wav" }))).toBe("my_song");
  });

  it("strips the extension from the filename for the fallback", () => {
    expect(getSongTitle(makeSong({ title: null, filename: "track.01.mp3" }))).toBe("track.01");
  });

  it("returns the raw filename when the stem is empty (no extension)", () => {
    expect(getSongTitle(makeSong({ title: null, filename: "trackonly" }))).toBe("trackonly");
  });

  it("trims whitespace from the metadata title", () => {
    expect(getSongTitle(makeSong({ title: "  Trimmed  " }))).toBe("Trimmed");
  });
});

describe("getSongLabel", () => {
  it("concatenates artist and title with ' — '", () => {
    expect(
      getSongLabel(makeSong({ artist: "The Beatles", title: "Hey Jude" })),
    ).toBe("The Beatles — Hey Jude");
  });

  it("uses fallbacks when artist and title are missing", () => {
    expect(getSongLabel(makeSong({ filename: "artist - title.mp3" }))).toBe(
      "Unknown Artist — artist - title",
    );
  });
});
