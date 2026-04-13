import { useEffect } from "react";
import { usePlayerStore } from "./store/playerStore";
import { api } from "./api/client";
import { UploadSection } from "./components/UploadSection";
import { SongList } from "./components/SongList";
import { PlayerSection } from "./components/PlayerSection";
import { Equalizer } from "./components/Equalizer";
import { MiniPlayer } from "./components/MiniPlayer";
import { BottomNav } from "./components/BottomNav";
import type { AppTab, Song } from "./types";

export default function App() {
  const setSongs = usePlayerStore((s) => s.setSongs);
  const setServerConfig = usePlayerStore((s) => s.setServerConfig);
  const setActiveSong = usePlayerStore((s) => s.setActiveSong);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const activeTab = usePlayerStore((s) => s.activeTab);
  const activeSong = usePlayerStore((s) => s.activeSong);

  // Bootstrap: fetch config + song list
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await api.getConfig();
        setServerConfig(cfg);
      } catch {
        // use defaults
      }
      try {
        const data = await api.getSongs();
        setSongs(data.songs);
      } catch {
        // ignore
      }
    })();
  }, [setServerConfig, setSongs]);

  const handleLoadSong = (song: Song) => {
    setActiveSong(song);
    setActiveTab("player");
  };

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    // Scroll to the corresponding section
    const sectionId =
      tab === "library" ? "library-section" : tab === "player" ? "player-section" : "eq-section";
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleMiniPlayerNavigate = () => {
    setActiveTab("player");
    document.getElementById("player-section")?.scrollIntoView({ behavior: "smooth" });
  };

  // Derived: show mini-player when on library or eq tab and a song is loaded
  const showMiniPlayer = activeSong !== null && activeTab !== "player";

  // Provide play/pause for mini-player — import engine directly to avoid circular
  const handleMiniPlayPause = () => {
    // Dispatch synthetic click on the real play-pause button
    const btn = document.getElementById("play-pause-btn");
    btn?.click();
  };

  return (
    <div className="app-shell">
      {/* Sticky header */}
      <header className="app-header">
        <h1>🎵 Bass Karaoke Player</h1>
        {activeTab !== "library" && activeSong && (
          <p className="subtitle">{activeSong.filename}</p>
        )}
        {activeTab === "library" && (
          <p className="subtitle">
            Stem-splitting music player powered by demucs &amp; rubberband
          </p>
        )}
      </header>

      {/* Main scrollable content */}
      <main className="app-main">
        {/* Library section */}
        <div id="library-section" className="tab-section">
          <UploadSection />
          <SongList onLoadSong={handleLoadSong} />
        </div>

        {/* Player section – always in DOM for E2E compatibility */}
        <PlayerSection />

        {/* EQ section */}
        <div className="tab-section">
          <Equalizer />
        </div>
      </main>

      {/* Mini player bar (above bottom nav, shown on non-player tabs) */}
      {showMiniPlayer && (
        <MiniPlayer
          onPlayPause={handleMiniPlayPause}
          onNavigatePlayer={handleMiniPlayerNavigate}
        />
      )}

      {/* Bottom navigation */}
      <BottomNav onTabChange={handleTabChange} />

      {/* Footer (desktop) */}
      <footer className="app-footer">
        <p>
          Bass Karaoke Player — powered by{" "}
          <a
            href="https://github.com/adefossez/demucs"
            target="_blank"
            rel="noopener noreferrer"
          >
            demucs
          </a>{" "}
          &amp;{" "}
          <a
            href="https://github.com/breakfastquay/rubberband"
            target="_blank"
            rel="noopener noreferrer"
          >
            rubberband
          </a>
        </p>
      </footer>
    </div>
  );
}
