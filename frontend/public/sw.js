/**
 * Bass Karaoke Player – Service Worker
 *
 * Cache names:
 *   bass-karaoke-shell-v1  – app shell (HTML, JS, CSS, public assets)
 *   bass-karaoke-stems-v1  – stem & processed-stem audio files (immutable)
 *
 * Keeping two separate buckets means a shell-cache eviction on SW update
 * never discards already-downloaded stem data.
 *
 * Caching strategies by resource type:
 *   /api/songs/*/stems/*   – cache-first  (large, immutable audio blobs)
 *   /api/songs              – network-first, stale fallback
 *   /api/songs/*/versions  – network-first, stale fallback
 *   /api/songs/*            – stale-while-revalidate (song metadata)
 *   /api/*                  – stale-while-revalidate (config, etc.)
 *   /static/*, /, /manifest.json, /icon.svg  – cache-first (hashed assets)
 */

const SHELL_CACHE = "bass-karaoke-shell-v1";
const STEMS_CACHE = "bass-karaoke-stems-v1";
const KNOWN_CACHES = [SHELL_CACHE, STEMS_CACHE];

// ---------------------------------------------------------------------------
// Install – open both caches eagerly; skip waiting to activate immediately
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([caches.open(SHELL_CACHE), caches.open(STEMS_CACHE)]).then(
      () => self.skipWaiting(),
    ),
  );
});

// ---------------------------------------------------------------------------
// Activate – remove any stale caches that are not in KNOWN_CACHES.
// Never touch STEMS_CACHE during a shell update.
// ---------------------------------------------------------------------------

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !KNOWN_CACHES.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch routing
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only intercept same-origin GET requests.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const { pathname } = url;

  // Stem and processed-stem audio – cache-first (immutable binary blobs).
  // Matches /api/songs/{id}/stems/{stem} and …/stems/{stem}/processed
  if (pathname.startsWith("/api/") && pathname.includes("/stems/")) {
    event.respondWith(cacheFirst(request, STEMS_CACHE));
    return;
  }

  // Song list and version lists – network-first, stale cache fallback.
  if (
    pathname === "/api/songs" ||
    (pathname.startsWith("/api/songs/") && pathname.endsWith("/versions"))
  ) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Remaining API endpoints (song metadata, config) – stale-while-revalidate.
  if (pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // App shell: HTML entry point and public assets – cache-first.
  if (
    pathname === "/" ||
    pathname.startsWith("/static/") ||
    pathname === "/manifest.json" ||
    pathname === "/icon.svg" ||
    pathname === "/sw.js"
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Everything else: let the browser handle it normally.
});

// ---------------------------------------------------------------------------
// Strategy helpers
// ---------------------------------------------------------------------------

/** Cache-first: serve from *cacheName*; populate cache on network hit. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-first: try the network; on failure serve the stale cached copy.
 * Throws if both the network and cache miss.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Re-throw so the browser surfaces a proper network error.
    throw new Error(
      `Network request failed and no cached response for ${request.url}`,
    );
  }
}

/**
 * Stale-while-revalidate: return the cached copy immediately (if any) while
 * fetching a fresh copy in the background to update the cache.
 * Falls back to the network response when there is no cached entry yet.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  return cached ?? fetchPromise;
}
