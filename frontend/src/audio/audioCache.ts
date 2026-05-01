/**
 * In-memory LRU cache for compressed stem response bytes.
 *
 * Caches per-stem payloads keyed by request URL so that switching back to a
 * previously loaded song or version does not require a new HTTP round-trip.
 * Decoding still happens on load, but memory pressure is much lower than when
 * retaining decoded PCM buffers for multiple versions.
 */

/** Maximum number of compressed stem entries kept in memory at once. */
export const MAX_ENTRIES = 20;

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
