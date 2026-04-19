import type { Song } from "../types";

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getSongArtist(song: Song): string {
  return normalize(song.artist) ?? "Unknown Artist";
}

export function getSongTitle(song: Song): string {
  const metadataTitle = normalize(song.title);
  if (metadataTitle) return metadataTitle;
  const stem = song.filename.replace(/\.[^/.]+$/, "").trim();
  return stem || song.filename;
}

export function getSongLabel(song: Song): string {
  return `${getSongArtist(song)} — ${getSongTitle(song)}`;
}
