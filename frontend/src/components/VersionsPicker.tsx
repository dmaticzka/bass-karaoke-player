import { useEffect, useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { api } from "../api/client";
import { hasCached } from "../audio/audioCache";
import type { Version } from "../types";

interface Props {
  onSelectVersion: (pitch: number, tempo: number) => Promise<void>;
  onSelectOriginal?: () => void;
}

export function VersionsPicker({ onSelectVersion, onSelectOriginal }: Props) {
  const versions = usePlayerStore((s) => s.versions);
  const activeVersion = usePlayerStore((s) => s.activeVersion);
  const activeSong = usePlayerStore((s) => s.activeSong);
  const setVersions = usePlayerStore((s) => s.setVersions);
  const isOriginalActive = usePlayerStore((s) => s.isOriginalActive);
  // Subscribe to isLoading so the component re-renders when stem loading completes
  // and the client-cache indicator reflects the updated SW cache state.
  const isLoading = usePlayerStore((s) => s.isLoading);

  // Track which version keys are cached in the SW stem cache.
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set());
  const [isOriginalCached, setIsOriginalCached] = useState(false);

  useEffect(() => {
    if (!activeSong || activeSong.stems.length === 0) {
      setCachedKeys(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextKeys = new Set<string>();
      for (const ver of versions) {
        const useProcessed = ver.pitch_semitones !== 0 || ver.tempo_ratio !== 1.0;
        const urls = activeSong.stems.map((stem) =>
          useProcessed
            ? api.processedStemUrl(
                activeSong.id,
                stem,
                ver.pitch_semitones,
                ver.tempo_ratio,
              )
            : api.stemUrl(activeSong.id, stem),
        );
        const cached = await hasCached(urls);
        if (cached) nextKeys.add(`${ver.pitch_semitones}-${ver.tempo_ratio}`);
      }
      if (!cancelled) setCachedKeys(nextKeys);
    })();
    return () => {
      cancelled = true;
    };
  }, [versions, activeSong, isLoading]);

  useEffect(() => {
    if (!activeSong) {
      setIsOriginalCached(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const cached = await hasCached([api.originalAudioUrl(activeSong.id)]);
      if (!cancelled) setIsOriginalCached(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSong, isLoading]);

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

  if (!activeSong) return null;

  const originalBubble = (
    <li
      className={["original-item", isOriginalActive ? "active" : "", isOriginalCached ? "version-cached" : ""].filter(Boolean).join(" ")}
      onClick={() => onSelectOriginal?.()}
      style={{ cursor: "pointer" }}
    >
      <span>Original</span>
    </li>
  );

  if (versions.length === 0) {
    return <ul className="versions-list">{originalBubble}</ul>;
  }

  return (
    <div className="versions-section" id="versions-section">
      <ul className="versions-list" id="versions-list">
        {originalBubble}
        {versions.map((ver) => {
          const pitchStr =
            ver.pitch_semitones > 0
              ? `+${ver.pitch_semitones}`
              : String(ver.pitch_semitones);
          const tempoStr = `${Math.round(ver.tempo_ratio * 100)}%`;
          const label = ver.is_default
            ? "Stems"
            : `${pitchStr} st, ${tempoStr}`;
          const isActive =
            !isOriginalActive &&
            activeVersion.pitch === ver.pitch_semitones &&
            activeVersion.tempo === ver.tempo_ratio;
          const clickable = ver.status !== "processing";
          const isClientCached = cachedKeys.has(
            `${ver.pitch_semitones}-${ver.tempo_ratio}`,
          );

          return (
            <li
              key={`${ver.pitch_semitones}-${ver.tempo_ratio}`}
              className={[
                "version-item",
                isActive ? "active" : "",
                isClientCached ? "version-cached" : "",
                ver.status === "processing" ? "status-processing" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={`Pitch: ${pitchStr} semitones, Tempo: ${tempoStr}`}
              onClick={clickable ? () => void onSelectVersion(ver.pitch_semitones, ver.tempo_ratio) : undefined}
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              <span>{label}</span>

              {!ver.is_default && (
                <>
                  {ver.status === "partial" && (
                    <span className="version-status-badge status-partial">
                      partial
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
