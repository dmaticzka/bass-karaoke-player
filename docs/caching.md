# Caching Architecture

## Backend

### Stem cache (permanent)

After demucs splits a song, the four raw stems are stored as:

```
DATA_DIR/songs/{song_id}/stems/{stem}.mp3   (drums | bass | vocals | other)
```

These files are never evicted; they are deleted only when the song itself is deleted.

Once splitting finishes, `_split_song_task` immediately calls `_process_version_task(song_id, 0.0, 1.0)` to pre-cache the default (unmodified) version so first playback is instant.

---

### Processed-version cache (LRU-evicted)

Every unique `(pitch_semitones, tempo_ratio)` pair produces four rubberband-processed MP3s:

```
DATA_DIR/songs/{song_id}/processed/{stem}_{tag}.mp3
```

Tag encoding (filesystem-safe): `p{sign}{abs_pitch}d{frac}_t{tempo}d{frac}`, where `+` → `p`, `-` → `m`, `.` → `d`. Example: `pp2d00_t0d750` = pitch +2.00 st, tempo 0.750×.

#### Cache lookup

`GET /api/songs/{id}/stems/{stem}/processed?pitch=P&tempo=T` — if the file exists it is served directly; otherwise rubberband is invoked inline and the result is stored before serving.

`POST /api/songs/{id}/versions` triggers `_process_version_task` in a background thread, which processes all four stems in parallel via `process_executor` (bounded by `MAX_PROCESS_WORKERS`, default 4).

#### Version metadata sidecar

`processed/versions.json` is a JSON object mapping version tag → `VersionMetaEntry`:

```json
{
  "pp2d00_t1d000": {
    "accessed_at": "2025-01-01T12:00:00+00:00",
    "stem_count": 4,
    "pinned": false
  }
}
```

`touch_version()` is called on every cache hit (stem stream or version poll) and on every new write, updating `accessed_at` and `stem_count`.

#### Version status

`VersionStatus` is derived on-the-fly by counting files on disk:

| Files present | Status    |
|---------------|-----------|
| 4 of 4        | `ready`   |
| 1–3 of 4      | `partial` |
| 0 of 4        | `missing` |

The default version (`pitch=0.0, tempo=1.0`) always reports `ready` via `GET /api/songs/{id}/versions`, regardless of the sidecar.

#### Global LRU eviction

After each `_process_version_task` completes, `evict_global_lru(MAX_VERSIONS_GLOBAL)` runs. It:

1. Counts all non-default versions across every song's `processed/` directory.
2. While count > `MAX_VERSIONS_GLOBAL` (default 50, env `MAX_VERSIONS_GLOBAL`):
   - Collects all non-default, non-pinned versions with their `accessed_at`.
   - Deletes the entry with the oldest `accessed_at` and removes it from `versions.json`.

The **default version** (`pitch=0, tempo=1`) and **pinned** versions (`"pinned": true` in the sidecar) are never evicted.

---

### Song-level access tracking

`Song.last_used_at` is updated via `POST /api/songs/{id}/touch` (called by the frontend when a song is loaded). This timestamp is exposed in the song list and used to support "last-used" sort order.

---

## Frontend

### In-memory compressed-audio cache (`audioCache.ts`)

An LRU `Map<URL, Uint8Array>` of capacity `MAX_ENTRIES = 20` (≈ 4 stems × 5 versions).

- **Key**: full stem URL (raw or processed), e.g. `/api/songs/{id}/stems/bass` or `/api/songs/{id}/stems/bass/processed?pitch=2&tempo=0.75`.
- **Value**: deep copy of the compressed MP3 bytes (copy prevents `ArrayBuffer` detachment by `decodeAudioData`).
- **Hit**: promotes entry to MRU position, returns a fresh copy for decoding.
- **Miss**: fetches URL, stores compressed bytes, then passes them to `AudioContext.decodeAudioData`.
- **Eviction**: when `cache.size > MAX_ENTRIES`, the Map's first key (oldest insertion = LRU) is deleted.
- **Lifetime**: browser session only; `clear()` is not called by the application.

### LocalStorage version persistence (`PlayerSection.tsx`)

Key: `bass-karaoke-player:last-selected-versions`  
Value: `Record<song_id, { pitch: number; tempo: number }>`

Written on every version selection and read on song load to auto-restore the last-used `(pitch, tempo)` pair. Falls back to the default version `(0, 1.0)` if the saved version is not yet `ready` on the server.

### Zustand in-memory state (`playerStore.ts`)

| Field            | Content                                      | Lifetime      |
|------------------|----------------------------------------------|---------------|
| `versions`       | `Version[]` from `GET /api/songs/{id}/versions` | Active song   |
| `activeVersion`  | Currently decoded `{pitch, tempo}`           | Active song   |
| `songs`          | Full song list from `GET /api/songs`         | Page session  |

None of these are persisted to LocalStorage.

### Version polling

When any version in the list has `status === "processing"` or `"partial"`, `PlayerSection` polls `GET /api/songs/{id}/versions` every 2 s (POLL_MS). Polling stops once all versions reach `"ready"`. The `"processing"` status is a frontend-only optimistic state applied immediately after `POST /api/songs/{id}/versions` returns; the backend `VersionStatus` enum does not include it.

---

## Cache interaction sequence

```
User selects song
  └─ App.tsx: POST /api/songs/{id}/touch  → updates Song.last_used_at
  └─ PlayerSection: GET /api/songs/{id}/versions
       └─ restore last-selected version from LocalStorage
  └─ fetchAndDecodeStems(pitch, tempo)
       for each stem:
         check audioCache → hit: skip fetch
                          → miss: GET /api/songs/{id}/stems/{stem}[/processed?...]
                                  → check processed/ on disk → hit: stream
                                                             → miss: run rubberband, store, stream
                                  → store compressed bytes in audioCache
         decodeAudioData → wire into Web Audio engine
  └─ version status polling (if any version partial/processing)
```
