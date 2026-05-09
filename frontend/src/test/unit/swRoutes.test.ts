import { describe, it, expect } from "vitest";
import { isStemsCacheRoute } from "../../swRoutes";

describe("isStemsCacheRoute", () => {
  // --- URLs that must be cached in bass-karaoke-stems-v1 ---

  it("matches default stem URLs", () => {
    expect(isStemsCacheRoute("/api/songs/abc/stems/bass")).toBe(true);
    expect(isStemsCacheRoute("/api/songs/abc/stems/drums")).toBe(true);
    expect(isStemsCacheRoute("/api/songs/abc/stems/vocals")).toBe(true);
    expect(isStemsCacheRoute("/api/songs/abc/stems/other")).toBe(true);
  });

  it("matches processed stem URLs", () => {
    expect(
      isStemsCacheRoute("/api/songs/abc/stems/bass/processed?pitch=3&tempo=0.9"),
    ).toBe(true);
  });

  it("matches original-audio URLs", () => {
    expect(isStemsCacheRoute("/api/songs/abc/original-audio")).toBe(true);
  });

  // --- URLs that must NOT be captured by this route ---

  it("does not match the song-list endpoint", () => {
    expect(isStemsCacheRoute("/api/songs")).toBe(false);
  });

  it("does not match individual song metadata endpoints", () => {
    expect(isStemsCacheRoute("/api/songs/abc")).toBe(false);
  });

  it("does not match the versions endpoint", () => {
    expect(isStemsCacheRoute("/api/songs/abc/versions")).toBe(false);
  });

  it("does not match unrelated API paths", () => {
    expect(isStemsCacheRoute("/api/config")).toBe(false);
    expect(isStemsCacheRoute("/api/health")).toBe(false);
  });
});
