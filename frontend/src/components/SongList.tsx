import { useMemo } from "react";
import { usePlayerStore } from "../store/playerStore";
import type { SongSortOrder } from "../store/playerStore";
import { api } from "../api/client";
import type { Song } from "../types";
import { getSongArtist, getSongLabel, getSongTitle } from "../utils/songDisplay";

interface Props {
  onLoadSong: (song: Song) => void;
}

function statusLabel(status: string): string {
  return (
    { uploaded: "Uploaded", splitting: "Splitting…", ready: "Ready", error: "Error" }[
      status
    ] ?? status
  );
}

function sortSongs(songs: Song[], order: SongSortOrder): Song[] {
  const sorted = [...songs];
  if (order === "alphabetical") {
    sorted.sort((a, b) => getSongLabel(a).localeCompare(getSongLabel(b)));
  } else if (order === "title") {
    sorted.sort((a, b) => getSongTitle(a).localeCompare(getSongTitle(b)));
  } else if (order === "last-used") {
    sorted.sort((a, b) => {
      const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : Number.NEGATIVE_INFINITY;
      const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : Number.NEGATIVE_INFINITY;
      return tb - ta; // most recently used first
    });
  } else {
    sorted.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : Number.NEGATIVE_INFINITY;
      const tb = b.created_at ? new Date(b.created_at).getTime() : Number.NEGATIVE_INFINITY;
      return tb - ta; // most recent first
    });
  }
  return sorted;
}

export function SongList({ onLoadSong }: Props) {
  const songs = usePlayerStore((s) => s.songs);
  const activeSong = usePlayerStore((s) => s.activeSong);
  const setSongs = usePlayerStore((s) => s.setSongs);
  const songSortOrder = usePlayerStore((s) => s.songSortOrder);
  const setSongSortOrder = usePlayerStore((s) => s.setSongSortOrder);

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

              <span className={`song-status-badge status-${song.status}`}>
                {statusLabel(song.status)}
              </span>

              <div className="song-actions">
                {song.status === "ready" && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onLoadSong(song)}
                  >
                    {activeSong?.id === song.id ? "Active" : "Load"}
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
