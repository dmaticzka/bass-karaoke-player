/**
 * Stem audio fetch utilities.
 *
 * The Service Worker (sw.ts) transparently caches stem responses in the
 * `bass-karaoke-stems-v1` Cache Storage bucket using a CacheFirst strategy.
 * No in-memory or manual Cache Storage layer is needed here – the browser's
 * fetch pipeline handles both the in-flight de-duplication and the persistent
 * offline cache.
 *
 * Use {@link fetchWithCache} to load stems; the SW will serve from cache on
 * repeat requests and after page reloads.  Use {@link hasCached} to check
 * whether all stem URLs for a given version are already available offline.
 */

/** Name of the Cache Storage bucket used by the SW for stem audio. */
export const CACHE_STORAGE_NAME = "bass-karaoke-stems-v1";

/**
 * Fetch compressed stem audio bytes for *url*.
 *
 * The Service Worker intercepts this call and serves the response from the
 * `bass-karaoke-stems-v1` cache when available, falling back to the network
 * on a miss (and caching the result for future offline use).
 *
 * Falls back to a plain `fetch` when the Cache Storage API is unavailable
 * (e.g. non-secure contexts, test environments without a SW).
 */
export async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * Return `true` if *all* of the given stem URLs are present in the SW's
 * `bass-karaoke-stems-v1` cache (i.e. playback will succeed offline).
 *
 * Returns `false` when the Cache Storage API is unavailable or when any URL
 * is missing from the cache.
 */
export async function hasCached(urls: string[]): Promise<boolean> {
  if (typeof caches === "undefined" || urls.length === 0) return false;
  try {
    const cache = await caches.open(CACHE_STORAGE_NAME);
    const results = await Promise.all(urls.map((u) => cache.match(u)));
    return results.every((r) => r !== undefined);
  } catch {
    return false;
  }
}

