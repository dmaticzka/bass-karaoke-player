/**
 * In-memory LRU cache for compressed stem response bytes.
 *
 * Caches per-stem payloads keyed by request URL so that switching back to a
 * previously loaded song or version does not require a new HTTP round-trip.
 * Decoding still happens on load, but memory pressure is much lower than when
 * retaining decoded PCM buffers for multiple versions.
 *
 * A two-level cache is used:
 *  L1 – in-memory LRU map (fast, lost on page reload)
 *  L2 – Cache Storage API (persistent across page reloads, survives browser restart)
 *
 * Use {@link fetchWithCache} instead of calling the browser `fetch` API directly
 * for stem URLs; it checks L1 then L2 before hitting the network and populates
 * both layers on a network fetch.
 */

/** Maximum number of compressed stem entries kept in memory at once. */
export const MAX_ENTRIES = 20;

/** Name of the Cache Storage bucket used for persistent stem storage. */
export const CACHE_STORAGE_NAME = "bass-karaoke-stems-v1";

/** LRU map: URL → compressed bytes. Insertion/access order = most-recent last. */
const cache = new Map<string, Uint8Array>();

/**
 * Return a copy of cached compressed bytes for *url*, or `undefined` on a miss.
 * A hit promotes the entry to most-recently-used position.
 */
export function get(url: string): ArrayBuffer | undefined {
  const bytes = cache.get(url);
  if (bytes === undefined) return undefined;
  // Promote to MRU position by re-inserting.
  cache.delete(url);
  cache.set(url, bytes);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Store compressed *bytes* under *url*.
 * If the cache is already at capacity, the least-recently-used entry is
 * evicted first.
 */
export function set(url: string, bytes: ArrayBuffer): void {
  // Remove any existing entry so we can re-insert at the MRU end.
  cache.delete(url);
  // Make a deep copy so decodeAudioData() calls using the original request
  // buffer cannot detach or mutate the cached backing buffer.
  const source = new Uint8Array(bytes);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  cache.set(url, copy);
  if (cache.size > MAX_ENTRIES) {
    // The first key in Map iteration order is the LRU entry.
    cache.delete(cache.keys().next().value as string);
  }
}

/** Remove all cached entries. */
export function clear(): void {
  cache.clear();
}

/** Return the current number of cached entries. */
export function size(): number {
  return cache.size;
}

/**
 * Fetch compressed audio bytes for *url*, consulting L1 then L2 before the
 * network.  Both cache layers are populated on a network fetch.
 *
 * Gracefully degrades to network-only when the Cache Storage API is
 * unavailable (e.g. non-secure contexts, test environments).
 */
export async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  // L1: in-memory
  const l1Hit = get(url);
  if (l1Hit !== undefined) return l1Hit;

  // L2: Cache Storage (persistent across page reloads)
  if (typeof caches !== "undefined") {
    try {
      const diskCache = await caches.open(CACHE_STORAGE_NAME);
      const cached = await diskCache.match(url);
      if (cached) {
        const bytes = await cached.arrayBuffer();
        set(url, bytes); // warm L1
        return bytes;
      }
    } catch {
      // Cache Storage unavailable; fall through to network.
    }
  }

  // Network fetch – clone before consuming so the response body can be
  // stored in Cache Storage independently of the ArrayBuffer we return.
  const response = await fetch(url);
  const toCache = response.clone();
  const bytes = await response.arrayBuffer();
  set(url, bytes); // store in L1

  // Store in L2 (best-effort; failures are silently ignored).
  if (typeof caches !== "undefined") {
    try {
      const diskCache = await caches.open(CACHE_STORAGE_NAME);
      await diskCache.put(url, toCache);
    } catch {
      // ignore
    }
  }

  return bytes;
}
