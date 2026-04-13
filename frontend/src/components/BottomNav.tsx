import { Library, Play, Sliders } from "lucide-react";
import { usePlayerStore } from "../store/playerStore";
import type { AppTab } from "../types";

interface Props {
  onTabChange: (tab: AppTab) => void;
}

export function BottomNav({ onTabChange }: Props) {
  const activeTab = usePlayerStore((s) => s.activeTab);
  const activeSong = usePlayerStore((s) => s.activeSong);

  const tabs: { id: AppTab; label: string; icon: React.ReactNode; disabled?: boolean }[] =
    [
      { id: "library", label: "Library", icon: <Library size={22} /> },
      {
        id: "player",
        label: "Player",
        icon: <Play size={22} />,
        disabled: !activeSong,
      },
      {
        id: "eq",
        label: "EQ",
        icon: <Sliders size={22} />,
        disabled: !activeSong,
      },
    ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`bottom-nav-tab${activeTab === tab.id ? " active" : ""}${tab.disabled ? " disabled" : ""}`}
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onTabChange(tab.id)}
          aria-label={tab.label}
          aria-current={activeTab === tab.id ? "page" : undefined}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
