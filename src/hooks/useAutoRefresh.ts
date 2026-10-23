import { useEffect, useRef, useCallback } from 'react';

interface UseAutoRefreshOptions {
  intervalMs?: number;
  enabled?: boolean;
  /** Minimum gap before a tab-return refresh runs again. */
  minGapMs?: number;
}

export const useAutoRefresh = (
  refetchFunctions: (() => void | Promise<void>)[],
  options: UseAutoRefreshOptions = {}
) => {
  const { intervalMs = 30 * 60 * 1000, enabled = true, minGapMs = 60 * 1000 } = options; // Default: 30 minutes
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);
  const lastRun = useRef(Date.now());
  const fnsRef = useRef(refetchFunctions);
  fnsRef.current = refetchFunctions;

  // Single-flight: never start a second batch while one is running.
  const refetchAll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    lastRun.current = Date.now();
    try {
      await Promise.all(fnsRef.current.map(fn => fn()));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

    // Skip ticks while the tab is hidden.
    intervalRef.current = setInterval(() => {
      if (isVisible()) refetchAll();
    }, intervalMs);

    // Refresh on tab return, unless data was just fetched.
    const onVisibility = () => {
      if (isVisible() && Date.now() - lastRun.current >= minGapMs) refetchAll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, minGapMs, refetchAll]);

  return { refetchAll };
};
