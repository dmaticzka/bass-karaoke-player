import type {
  BulkProcessResponse,
  ProcessRequest,
  ProcessResponse,
  ServerConfig,
  Song,
  SongListResponse,
  StemName,
  VersionListResponse,
} from "../types";

const API_BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(API_BASE + path);
  if (!resp.ok) throw new Error(`GET ${path} → ${resp.status}`);
  return resp.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = (await resp
      .json()
      .catch(() => ({ detail: resp.statusText }))) as { detail?: string };
    throw new Error(err.detail ?? resp.statusText);
  }
  return resp.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const resp = await fetch(API_BASE + path, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404)
    throw new Error(`DELETE ${path} → ${resp.status}`);
}

export const api = {
  getConfig: () => get<ServerConfig>("/config"),

  getSongs: () => get<SongListResponse>("/songs"),

  getSong: (id: string) => get<Song>(`/songs/${id}`),

  deleteSong: (id: string) => del(`/songs/${id}`),

  touchSong: (id: string) => post<Song>(`/songs/${id}/touch`, {}),

  uploadSong: (
    file: File,
    onProgress: (pct: number) => void,
  ): Promise<Song> => {
    return new Promise<Song>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/songs`);
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status === 201) resolve(JSON.parse(xhr.responseText) as Song);
        else reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      });
      xhr.addEventListener("error", () => reject(new Error("Network error")));
      const fd = new FormData();
      fd.append("file", file);
      xhr.send(fd);
    });
  },

  getVersions: (songId: string) =>
    get<VersionListResponse>(`/songs/${songId}/versions`),

  createVersion: (songId: string, req: { pitch_semitones: number; tempo_ratio: number }) =>
    post<BulkProcessResponse>(`/songs/${songId}/versions`, req),

  deleteVersion: (songId: string, pitch: number, tempo: number) => {
    const p = new URLSearchParams({ pitch: String(pitch), tempo: String(tempo) });
    return del(`/songs/${songId}/versions?${p}`);
  },

  processStem: (
    songId: string,
    stem: StemName,
    req: ProcessRequest,
  ) => post<ProcessResponse>(`/songs/${songId}/stems/${stem}/process`, req),

  stemUrl: (songId: string, stem: StemName) =>
    `${API_BASE}/songs/${songId}/stems/${stem}`,

  processedStemUrl: (songId: string, stem: StemName, pitch: number, tempo: number) =>
    `${API_BASE}/songs/${songId}/stems/${stem}/processed?pitch=${pitch}&tempo=${tempo}`,
};
