/**
 * Hook that tracks whether the backend API is reachable.
 *
 * Connectivity is determined by probing GET /api/health rather than relying
 * on `navigator.onLine`, which only reflects OS-level network availability and
 * does not reflect server-side outages or captive portals.
 *
 * The hook probes immediately on mount and then on a fixed interval.  The
 * returned `isOnline` value starts as `true` (optimistic) and is updated after
 * the first probe completes.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const PROBE_INTERVAL_MS = 30_000; // 30 s
const PROBE_TIMEOUT_MS = 5_000; // 5 s

async function probeHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const resp = await fetch("/api/health", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timerId);
    return resp.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const probe = useCallback(async () => {
    const online = await probeHealth();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    void probe();
    intervalRef.current = setInterval(() => void probe(), PROBE_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [probe]);

  return isOnline;
}
