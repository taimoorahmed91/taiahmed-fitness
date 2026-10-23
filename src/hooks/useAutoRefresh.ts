import { useEffect, useRef, useCallback } from 'react';

interface UseAutoRefreshOptions {
  intervalMs?: number;
  enabled?: boolean;
}

export const useAutoRefresh = (
  refetchFunctions: (() => void | Promise<void>)[],
  options: UseAutoRefreshOptions = {}
) => {
  const { intervalMs = 30000, enabled = true } = options; // Default: 30 seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetchAll = useCallback(async () => {
    await Promise.all(refetchFunctions.map(fn => fn()));
  }, [refetchFunctions]);

  useEffect(() => {
    if (!enabled) return;
    const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

    // Skip ticks while the tab is hidden; refresh once when it becomes visible.
    intervalRef.current = setInterval(() => {
      if (isVisible()) refetchAll();
    }, intervalMs);

    const onVisibility = () => { if (isVisible()) refetchAll(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, refetchAll]);

  return { refetchAll };
};
