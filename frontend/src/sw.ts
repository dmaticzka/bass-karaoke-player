/// <reference lib="webworker" />
/**
 * Service Worker for Bass Karaoke Player.
 *
 * Two cache layers:
 *   bass-karaoke-shell-v1  – precached app shell (HTML, JS, CSS, assets)
 *   bass-karaoke-stems-v1  – runtime-cached stem audio (CacheFirst, survives SW updates)
 *
 * An additional network-first cache for the song-list API response allows the
 * library page to load offline after a prior online visit.
 *
 * The shell cache is managed by Workbox's precaching machinery and is versioned
 * via the injected __WB_MANIFEST.  On SW update, Workbox atomically replaces
 * the shell cache entries; the stems cache is untouched.
 */

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
} from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope;

// Take control immediately so that the first page load benefits from the SW.
clientsClaim();

// ---------------------------------------------------------------------------
// App-shell precache
// ---------------------------------------------------------------------------

// __WB_MANIFEST is replaced by vite-plugin-pwa with the list of precached
// assets at build time.
precacheAndRoute(self.__WB_MANIFEST);

// Remove entries from outdated precaches left behind by previous SW versions.
cleanupOutdatedCaches();

// ---------------------------------------------------------------------------
// Navigation fallback (SPA routing)
// ---------------------------------------------------------------------------

// Serve the cached index.html for all navigation requests so that the SPA
// works offline.  API requests are explicitly excluded from the navigation
// handler so they fall through to the runtime cache rules below.
const navigationHandler = createHandlerBoundToURL("/static/index.html");
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//],
  }),
);

// ---------------------------------------------------------------------------
// Runtime caching – stem audio (CacheFirst, cache persists across SW updates)
// ---------------------------------------------------------------------------

registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/songs/") &&
    url.pathname.includes("/stems/"),
  new CacheFirst({
    cacheName: "bass-karaoke-stems-v1",
    plugins: [
      new ExpirationPlugin({ maxEntries: 200 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ---------------------------------------------------------------------------
// Runtime caching – song list (NetworkFirst for offline library view)
// ---------------------------------------------------------------------------

registerRoute(
  ({ url }) => url.pathname === "/api/songs",
  new NetworkFirst({
    cacheName: "bass-karaoke-api-v1",
    networkTimeoutSeconds: 5,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

// ---------------------------------------------------------------------------
// Runtime caching – individual song, config, and version endpoints
// (StaleWhileRevalidate: always serve fast, update in background)
// ---------------------------------------------------------------------------

registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/songs/") || url.pathname === "/api/config",
  new StaleWhileRevalidate({
    cacheName: "bass-karaoke-api-v1",
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);
// NOTE: /api/health is intentionally NOT cached so that the online-status
// probe (useOnlineStatus hook) always reflects true network reachability.
