import { usePlayerStore } from "../store/playerStore";
import { api } from "../api/client";
import type { Song } from "../types";

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
    <section className="card" id="songs-section">
      <h2>
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
      </h2>

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
              <span className="song-name" title={song.filename}>
                {song.filename}
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
                  aria-label={`Delete ${song.filename}`}
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
