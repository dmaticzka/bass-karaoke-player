/**
 * In-memory LRU cache for decoded AudioBuffer objects.
 *
 * Caches per-stem audio data keyed by request URL so that switching back to a
 * previously loaded song or version does not require a new HTTP round-trip or
 * an expensive decodeAudioData call.
 *
 * Capacity is intentionally conservative: each decoded stereo stem for a
 * 3-minute song occupies ~60 MB of memory, so MAX_ENTRIES = 20 covers roughly
 * five full song versions (4 stems each) while keeping peak usage manageable.
 */

/** Maximum number of AudioBuffer entries kept in memory at once. */
export const MAX_ENTRIES = 20;

/** LRU map: URL → AudioBuffer.  Insertion/access order = most-recent last. */
const cache = new Map<string, AudioBuffer>();

/**
 * Return the cached AudioBuffer for *url*, or `undefined` on a miss.
 * A hit promotes the entry to most-recently-used position.
 */
export function get(url: string): AudioBuffer | undefined {
  const buf = cache.get(url);
  if (buf === undefined) return undefined;
  // Promote to MRU position by re-inserting.
  cache.delete(url);
  cache.set(url, buf);
  return buf;
}

/**
 * Store *buffer* under *url*.
 * If the cache is already at capacity, the least-recently-used entry is
 * evicted first.
 */
export function set(url: string, buffer: AudioBuffer): void {
  // Remove any existing entry so we can re-insert at the MRU end.
  cache.delete(url);
  cache.set(url, buffer);
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
