import { usePlayerStore } from "../store/playerStore";

interface Props {
  onPlayPause: () => void;
  onNavigatePlayer: () => void;
}

export function MiniPlayer({ onPlayPause, onNavigatePlayer }: Props) {
  const activeSong = usePlayerStore((s) => s.activeSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const startOffset = usePlayerStore((s) => s.startOffset);
  const duration = usePlayerStore((s) => s.duration);

  if (!activeSong) return null;

  const pct = duration > 0 ? (startOffset / duration) * 100 : 0;

  return (
    <div className="mini-player" role="region" aria-label="Mini player">
      {/* Progress bar at top */}
      <div className="mini-progress" aria-hidden="true">
        <div className="mini-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="mini-player-content">
        <button
          className="mini-song-name"
          onClick={onNavigatePlayer}
          aria-label={`Go to player: ${activeSong.filename}`}
        >
          🎵 {activeSong.filename}
        </button>

        <button
          className="btn btn-sm btn-primary"
          disabled={isLoading}
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isLoading ? "⏳" : isPlaying ? "⏸" : "▶"}
        </button>
      </div>
    </div>
  );
}
