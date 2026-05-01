import { useEffect, useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { api } from "../api/client";
import * as audioCache from "../audio/audioCache";
import type { Version } from "../types";

interface Props {
  onSelectVersion: (pitch: number, tempo: number) => Promise<void>;
}

export function VersionsPicker({ onSelectVersion }: Props) {
  const versions = usePlayerStore((s) => s.versions);
  const activeVersion = usePlayerStore((s) => s.activeVersion);
  const activeSong = usePlayerStore((s) => s.activeSong);
  const setVersions = usePlayerStore((s) => s.setVersions);
  // Subscribe to isLoading so we re-check the offline cache when stem
  // loading completes and the SW has had a chance to cache the new stems.
  const isLoading = usePlayerStore((s) => s.isLoading);

  // Keys of versions whose stems are fully available in the offline cache.
  // Populated asynchronously by checking the Service Worker's Cache Storage.
  const [offlineCachedVersionKeys, setOfflineCachedVersionKeys] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    if (!activeSong || activeSong.stems.length === 0) {
      setOfflineCachedVersionKeys(new Set());
      return;
    }

    let cancelled = false;

    // Capture in a const so TypeScript knows it's non-null inside the async function.
    const song = activeSong;

    async function checkOfflineCache() {
      const newCached = new Set<string>();
      await Promise.all(
        versions.map(async (ver) => {
          const useProcessed =
            ver.pitch_semitones !== 0 || ver.tempo_ratio !== 1.0;
          const stemResults = await Promise.all(
            song.stems.map((stem) => {
              const url = useProcessed
                ? api.processedStemUrl(
                    song.id,
                    stem,
                    ver.pitch_semitones,
                    ver.tempo_ratio,
                  )
                : api.stemUrl(song.id, stem);
              return audioCache.hasInOfflineCache(url);
            }),
          );
          if (stemResults.every(Boolean)) {
            newCached.add(`${ver.pitch_semitones}-${ver.tempo_ratio}`);
          }
        }),
      );
      if (!cancelled) setOfflineCachedVersionKeys(newCached);
    }

    void checkOfflineCache();

    return () => {
      cancelled = true;
    };
  }, [versions, activeSong, isLoading]);

  const handleDelete = async (ver: Version) => {
    if (!activeSong) return;
    try {
      await api.deleteVersion(activeSong.id, ver.pitch_semitones, ver.tempo_ratio);
    } catch {
      // ignore
    }
    // Revert to default if deleted version was active
    const isActive =
      activeVersion.pitch === ver.pitch_semitones &&
      activeVersion.tempo === ver.tempo_ratio;
    if (isActive) {
      await onSelectVersion(0, 1.0);
    }
    if (activeSong) {
      const data = await api.getVersions(activeSong.id);
      setVersions(data.versions);
    }
  };

  if (versions.length === 0) return null;

  return (
    <div className="versions-section" id="versions-section">
      <h3>Versions</h3>
      <ul className="versions-list" id="versions-list">
        {versions.map((ver) => {
          const pitchStr =
            ver.pitch_semitones > 0
              ? `+${ver.pitch_semitones}`
              : String(ver.pitch_semitones);
          const tempoStr = `${Math.round(ver.tempo_ratio * 100)}%`;
          const label = ver.is_default
            ? `Original (${tempoStr})`
            : `${pitchStr} st, ${tempoStr}`;
          const isActive =
            activeVersion.pitch === ver.pitch_semitones &&
            activeVersion.tempo === ver.tempo_ratio;
          const clickable = ver.status !== "processing";
          const isOfflineCached = offlineCachedVersionKeys.has(
            `${ver.pitch_semitones}-${ver.tempo_ratio}`,
          );

          return (
            <li
              key={`${ver.pitch_semitones}-${ver.tempo_ratio}`}
              className={[
                "version-item",
                ver.is_default ? "default-version" : "",
                isActive ? "active" : "",
                isOfflineCached ? "version-cached" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={
                isOfflineCached
                  ? `Pitch: ${pitchStr} semitones, Tempo: ${tempoStr} – available offline`
                  : `Pitch: ${pitchStr} semitones, Tempo: ${tempoStr}`
              }
              onClick={clickable ? () => void onSelectVersion(ver.pitch_semitones, ver.tempo_ratio) : undefined}
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              <span>{label}</span>

              {!ver.is_default && (
                <>
                  {(ver.status === "processing" || ver.status === "partial") && (
                    <span className={`version-status-badge status-${ver.status}`}>
                      {ver.status === "processing" ? "⏳" : "partial"}
                    </span>
                  )}
                  {ver.status !== "processing" && (
                    <button
                      className="version-delete-btn"
                      title="Delete this version"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(ver);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
