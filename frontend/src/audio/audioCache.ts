/**
 * In-memory LRU cache for compressed stem response bytes.
 *
 * Caches per-stem payloads keyed by request URL so that switching back to a
 * previously loaded song or version within the same page session does not
 * require a new fetch round-trip.  Decoding (decodeAudioData) still happens
 * on every load regardless of whether bytes come from this cache.
 *
 * Persistent caching across page reloads is handled transparently by the
 * Service Worker (sw.js), which intercepts stem fetch requests and stores
 * responses in the {@link CACHE_STORAGE_NAME} Cache Storage bucket.  This
 * module therefore only maintains an in-memory L1 layer; the previous L2
 * (Cache Storage write-through) layer has been removed to avoid redundancy.
 *
 * Use {@link fetchWithCache} instead of calling the browser `fetch` API
 * directly for stem URLs; it checks L1 before hitting the network (which the
 * SW may serve from its offline cache).
 *
 * Use {@link hasInOfflineCache} to check whether a URL is available in the
 * Service Worker's persistent offline cache without fetching its bytes.
 */

/** Maximum number of compressed stem entries kept in memory at once. */
export const MAX_ENTRIES = 20;

/**
 * Name of the Cache Storage bucket used by the Service Worker for persistent
 * stem storage.  Referenced here so that {@link hasInOfflineCache} can read
 * from the same bucket the SW writes to.
 */
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

/** Return true if *url* has a cached entry (without promoting it to MRU). */
export function has(url: string): boolean {
  return cache.has(url);
}

/**
 * Fetch compressed audio bytes for *url*, checking L1 before the network.
 * The Service Worker (if registered) intercepts the network fetch and serves
 * from its persistent offline cache when available, so the call is fast even
 * on a subsequent page load.
 *
 * Gracefully degrades to a plain network fetch when no SW is registered.
 */
export async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  // L1: in-memory
  const l1Hit = get(url);
  if (l1Hit !== undefined) return l1Hit;

  // Network fetch – handled transparently by the SW offline cache when available.
  const response = await fetch(url);
  const bytes = await response.arrayBuffer();
  set(url, bytes); // store in L1
  return bytes;
}

/**
 * Check whether *url* is available in the Service Worker's persistent offline
 * cache (the {@link CACHE_STORAGE_NAME} Cache Storage bucket).
 *
 * Returns `false` gracefully when Cache Storage is unavailable (e.g. in
 * non-secure contexts or test environments without a SW).
 */
export async function hasInOfflineCache(url: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const stemCache = await caches.open(CACHE_STORAGE_NAME);
    const match = await stemCache.match(url);
    return match !== undefined;
  } catch {
    return false;
  }
}
