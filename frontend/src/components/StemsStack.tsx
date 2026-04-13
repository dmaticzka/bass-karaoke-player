import type { StemName } from "../types";
import { usePlayerStore } from "../store/playerStore";
import { applyGain } from "../audio/engine";
import { StemCard } from "./StemCard";

interface Props {
  stems: StemName[];
  loading: boolean;
}

export function StemsStack({ stems, loading }: Props) {
  const stemVolumes = usePlayerStore((s) => s.stemVolumes);
  const stemMuted = usePlayerStore((s) => s.stemMuted);
  const setStemVolume = usePlayerStore((s) => s.setStemVolume);
  const setStemMuted = usePlayerStore((s) => s.setStemMuted);

  const handleVolume = (stem: StemName, vol: number) => {
    setStemVolume(stem, vol);
    if (!stemMuted[stem]) {
      applyGain(stem, vol);
    }
  };

  const handleMute = (stem: StemName) => {
    const nowMuted = !stemMuted[stem];
    setStemMuted(stem, nowMuted);
    applyGain(stem, nowMuted ? 0 : (stemVolumes[stem] ?? 1));
  };

  return (
    <div
      id="stems-grid"
      className={`stems-stack${loading ? " loading" : ""}`}
      aria-label="Stem controls"
    >
      {stems.map((stem) => (
        <StemCard
          key={stem}
          stem={stem}
          volume={stemVolumes[stem] ?? 1}
          muted={stemMuted[stem] ?? false}
          onVolumeChange={(vol) => handleVolume(stem, vol)}
          onMuteToggle={() => handleMute(stem)}
        />
      ))}
    </div>
  );
}
