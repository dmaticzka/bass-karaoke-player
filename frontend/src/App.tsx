import { useEffect, useState } from "react";
import { Folder, Music2, WifiOff } from "lucide-react";
import { usePlayerStore } from "./store/playerStore";
import { api } from "./api/client";
import { getSongTitle } from "./utils/songDisplay";
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
  const updateSong = usePlayerStore((s) => s.updateSong);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const activeTab = usePlayerStore((s) => s.activeTab);
  const activeSong = usePlayerStore((s) => s.activeSong);

  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [eqCollapsed, setEqCollapsed] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // Track online/offline status for the banner
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
    setLibraryCollapsed(true);
    // Record last-used timestamp; update store on success so sort order refreshes
    void api.touchSong(song.id).then((updated) => {
      updateSong(updated);
      setActiveSong(updated);
    }).catch(() => {
      // Non-fatal: sort order may not refresh if touch fails
    });
  };

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    // Auto-expand relevant section when navigating to it
    if (tab === "library") {
      setLibraryCollapsed(false);
    }
    if (tab === "eq") {
      setEqCollapsed(false);
    }
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
      {/* Offline banner – shown when the browser has no network connection */}
      {!isOnline && (
        <div className="offline-banner" role="status" aria-live="polite">
          <WifiOff size={14} aria-hidden="true" />
          You are offline – playing from cache
        </div>
      )}

      {/* Sticky header */}
      <header className="app-header">
        <h1>
          <Music2 size={18} aria-hidden="true" />
          Bass Karaoke Player
        </h1>
        {activeTab !== "library" && activeSong && (
          <p className="subtitle">{getSongTitle(activeSong)}</p>
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
          <div className="card">
            <div
              className="collapsible-header"
              onClick={() => setLibraryCollapsed(!libraryCollapsed)}
            >
              <h2>
                <Folder size={18} aria-hidden="true" />
                Library
              </h2>
              <button
                className="collapsible-toggle"
                aria-label={libraryCollapsed ? "Expand library" : "Collapse library"}
              >
                <span className={`chevron${libraryCollapsed ? " collapsed" : ""}`}>▼</span>
              </button>
            </div>
            <div className={`collapsible-body ${libraryCollapsed ? "collapsed" : "expanded"}`}>
              <UploadSection />
              <SongList onLoadSong={handleLoadSong} />
            </div>
          </div>
        </div>

        {/* Player section – always in DOM for E2E compatibility */}
        <PlayerSection />

        {/* EQ section */}
        <div className="tab-section">
          <Equalizer collapsed={eqCollapsed} onToggle={() => setEqCollapsed(!eqCollapsed)} />
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
