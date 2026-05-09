/**
 * URL-matching predicates for Service Worker route registration.
 *
 * Exported as pure functions so they can be unit-tested independently of the
 * SW environment.
 */

/**
 * Returns true for URLs that should be served with a CacheFirst strategy and
 * stored in the `bass-karaoke-stems-v1` cache bucket.
 *
 * This covers:
 *   - Stem audio:          /api/songs/{id}/stems/{stem}
 *   - Processed stems:     /api/songs/{id}/stems/{stem}/processed
 *   - Original audio:      /api/songs/{id}/original-audio
 */
export function isStemsCacheRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/songs/") &&
    (pathname.includes("/stems/") || pathname.endsWith("/original-audio"))
  );
}
