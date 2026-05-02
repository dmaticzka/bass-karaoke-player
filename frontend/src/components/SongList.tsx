import { useMemo, useEffect, useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import type { SongSortOrder } from "../store/playerStore";
import { api } from "../api/client";
import type { Song } from "../types";
import { getSongArtist, getSongLabel, getSongTitle } from "../utils/songDisplay";
import { sortSongs } from "../utils/songSort";
import { hasCached } from "../audio/audioCache";

interface Props {
  onLoadSong: (song: Song) => void;
}

export function SongList({ onLoadSong }: Props) {
  const songs = usePlayerStore((s) => s.songs);
  const activeSong = usePlayerStore((s) => s.activeSong);
  const setSongs = usePlayerStore((s) => s.setSongs);
  const songSortOrder = usePlayerStore((s) => s.songSortOrder);
  const setSongSortOrder = usePlayerStore((s) => s.setSongSortOrder);

  const [cachedSongIds, setCachedSongIds] = useState<Set<string>>(new Set());

  // Check which songs have their main stems fully cached in the SW stem cache.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextCached = new Set<string>();
      for (const song of songs) {
        if (song.stems.length === 0) continue;
        const urls = song.stems.map((stem) => api.stemUrl(song.id, stem));
        const cached = await hasCached(urls);
        if (cached) nextCached.add(song.id);
      }
      if (!cancelled) setCachedSongIds(nextCached);
    })();
    return () => {
      cancelled = true;
    };
  }, [songs]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this song and all its stems?")) return;
    await api.deleteSong(id);
    const data = await api.getSongs();
    setSongs(data.songs);
  };

  const handleRefresh = async () => {
    const data = await api.getSongs();
    setSongs(data.songs);
  };

  const sortedSongs = useMemo(() => sortSongs(songs, songSortOrder), [songs, songSortOrder]);

  return (
    <section id="songs-section" className="sub-section">
      <h3 className="sub-section-heading">
        Songs
        <button
          id="refresh-btn"
          className="btn btn-sm btn-secondary"
          title="Refresh song list"
          onClick={() => void handleRefresh()}
          aria-label="Refresh song list"
        >
          ↻
        </button>
        <select
          id="sort-order-select"
          className="sort-order-select"
          value={songSortOrder}
          onChange={(e) => setSongSortOrder(e.target.value as SongSortOrder)}
          aria-label="Sort order"
          title="Sort order"
        >
          <option value="recent">Recently Added</option>
          <option value="last-used">Last Used</option>
          <option value="alphabetical">Alphabetical (Artist + Title)</option>
          <option value="title">Alphabetical (Title only)</option>
        </select>
      </h3>

      <ul className="song-list" id="song-list">
        {sortedSongs.length === 0 ? (
          <li className="empty-msg">No songs uploaded yet.</li>
        ) : (
          sortedSongs.map((song) => (
            <li
              key={song.id}
              className={`song-item${activeSong?.id === song.id ? " active" : ""}`}
              data-id={song.id}
            >
              <span className="song-name" title={getSongLabel(song)}>
                <span className="song-artist">{getSongArtist(song)}</span>
                <span className="song-title">{getSongTitle(song)}</span>
              </span>

              <div className="song-actions">
                {(song.status === "ready" || song.status === "splitting") && (
                  <button
                    className={[
                      "btn btn-sm btn-primary song-load-btn",
                      song.status === "splitting" ? "status-splitting" : "",
                      cachedSongIds.has(song.id) ? "song-cached" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={song.status === "ready" ? () => onLoadSong(song) : undefined}
                    disabled={song.status === "splitting"}
                  >
                    {song.status === "splitting"
                      ? "Splitting…"
                      : activeSong?.id === song.id
                        ? "Active"
                        : "Load"}
                  </button>
                )}
                <button
                  className="btn btn-sm btn-icon"
                  title="Delete song"
                  onClick={() => void handleDelete(song.id)}
                  aria-label={`Delete ${getSongTitle(song)}`}
                >
                  🗑
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
