import type { SongSortOrder } from "../store/playerStore";
import type { Song } from "../types";
import { getSongLabel, getSongTitle } from "./songDisplay";

export function sortSongs(songs: Song[], order: SongSortOrder): Song[] {
  const sorted = [...songs];
  if (order === "alphabetical") {
    sorted.sort((a, b) => getSongLabel(a).localeCompare(getSongLabel(b)));
  } else if (order === "title") {
    sorted.sort((a, b) => getSongTitle(a).localeCompare(getSongTitle(b)));
  } else if (order === "last-used") {
    const ts = new Map(
      songs.map((s) => [
        s.id,
        s.last_used_at ? new Date(s.last_used_at).getTime() : Number.NEGATIVE_INFINITY,
      ]),
    );
    sorted.sort(
      (a, b) =>
        (ts.get(b.id) ?? Number.NEGATIVE_INFINITY) -
        (ts.get(a.id) ?? Number.NEGATIVE_INFINITY),
    );
  } else {
    const ts = new Map(
      songs.map((s) => [
        s.id,
        s.created_at ? new Date(s.created_at).getTime() : Number.NEGATIVE_INFINITY,
      ]),
    );
    sorted.sort(
      (a, b) =>
        (ts.get(b.id) ?? Number.NEGATIVE_INFINITY) -
        (ts.get(a.id) ?? Number.NEGATIVE_INFINITY),
    );
  }
  return sorted;
}
