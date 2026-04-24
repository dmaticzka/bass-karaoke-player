// TypeScript types matching backend Pydantic models

export type StemName = "drums" | "bass" | "vocals" | "other";

export type SongStatus = "uploaded" | "splitting" | "ready" | "error";

// "processing" is a frontend-only optimistic status (not in VersionStatus enum)
export type VersionStatus = "ready" | "partial" | "missing" | "processing";

export interface Song {
  id: string;
  filename: string;
  artist: string | null;
  title: string | null;
  status: SongStatus;
  stems: StemName[];
  error_message?: string | null;
  created_at?: string | null;
  last_used_at?: string | null;
}

export interface SongListResponse {
  songs: Song[];
}

export interface Version {
  pitch_semitones: number;
  tempo_ratio: number;
  is_default: boolean;
  status: VersionStatus;
}

export interface VersionListResponse {
  versions: Version[];
}

export interface ProcessRequest {
  pitch_semitones: number;
  tempo_ratio: number;
}

export interface ProcessResponse {
  song_id: string;
  stem: StemName;
  pitch_semitones: number;
  tempo_ratio: number;
  output_path: string;
}

export interface BulkProcessRequest {
  pitch_semitones: number;
  tempo_ratio: number;
}

export interface BulkProcessResponse {
  song_id: string;
  pitch_semitones: number;
  tempo_ratio: number;
  status: "processing" | "ready";
}

export interface ServerConfig {
  max_versions_global: number;
}

// EQ types
export type BiquadFilterKind = "lowshelf" | "peaking" | "highshelf";

export interface EqBand {
  freq: number;
  gain: number; // -12 to +12 dB
  type: BiquadFilterKind;
  label: string;
}

export const DEFAULT_EQ_BANDS: EqBand[] = [
  { freq: 60, gain: 0, type: "lowshelf", label: "Sub Bass" },
  { freq: 250, gain: 0, type: "peaking", label: "Bass" },
  { freq: 1000, gain: 0, type: "peaking", label: "Mid" },
  { freq: 4000, gain: 0, type: "peaking", label: "Upper Mid" },
  { freq: 16000, gain: 0, type: "highshelf", label: "Treble" },
];

export const EQ_PRESETS: Record<string, EqBand[]> = {
  Flat: DEFAULT_EQ_BANDS.map((b) => ({ ...b, gain: 0 })),
  "Boost Bass": DEFAULT_EQ_BANDS.map((b, i) => ({
    ...b,
    gain: [8, 5, 0, 0, 0][i] ?? 0,
  })),
  "Vocal Clarity": DEFAULT_EQ_BANDS.map((b, i) => ({
    ...b,
    gain: [-2, -3, 3, 5, 2][i] ?? 0,
  })),
  "Reduce Mud": DEFAULT_EQ_BANDS.map((b, i) => ({
    ...b,
    gain: [0, -5, -2, 0, 0][i] ?? 0,
  })),
  "Bass Karaoke": DEFAULT_EQ_BANDS.map((b, i) => ({
    ...b,
    gain: [0, -8, 2, 4, 3][i] ?? 0,
  })),
};

export const STEM_COLORS: Record<StemName, string> = {
  drums: "#c0c0c0",
  bass: "#909090",
  vocals: "#d8d8d8",
  other: "#a0a0a0",
};

export type AppTab = "library" | "player" | "eq";
