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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refetchAll = useCallback(async () => {
    await Promise.all(refetchFunctions.map(fn => fn()));
  }, [refetchFunctions]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      refetchAll();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, refetchAll]);

  return { refetchAll };
};
