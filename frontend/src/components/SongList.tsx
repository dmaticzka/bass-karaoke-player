import { usePlayerStore } from "../store/playerStore";
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

export function SongList({ onLoadSong }: Props) {
  const songs = usePlayerStore((s) => s.songs);
  const activeSong = usePlayerStore((s) => s.activeSong);
  const setSongs = usePlayerStore((s) => s.setSongs);

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
      </h3>

      <ul className="song-list" id="song-list">
        {songs.length === 0 ? (
          <li className="empty-msg">No songs uploaded yet.</li>
        ) : (
          songs.map((song) => (
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
