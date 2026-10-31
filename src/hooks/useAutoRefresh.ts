import { useEffect, useRef, useCallback, useState } from 'react';
import { APP_REFRESH_EVENT } from '@/app/refresh';
import { useGlobalRefresh, useGlobalRefreshSnapshot } from '@/app/globalRefreshContext';
import {
  EMPTY_REFRESH_SNAPSHOT,
  createRefreshEventHandler,
  createRefreshRunner,
  type RefreshRunner,
  type RefreshSnapshot,
  type RefreshTask,
} from '@/lib/refreshState';

interface UseAutoRefreshOptions {
  intervalMs?: number;
  enabled?: boolean;
  /** Minimum gap before a tab-return refresh runs again. */
  minGapMs?: number;
}

/**
 * Timed and tab-return refreshing for a screen (the Dashboard), plus a `refetchAll` for its Retry.
 *
 * Inside the signed-in shell the shell owns refreshing (src/app/globalRefresh.ts): this hook hands it
 * the screen's refetch functions, and the timer, the tab-return refresh, the header's Refresh action
 * and the demo regeneration all go through ONE single-flight batch. While one batch runs every other
 * trigger gets the same promise, so they can never overlap or double fetch.
 *
 * Outside the shell (no provider) it falls back to its own single-flight runner and answers the
 * header's refresh event itself, as before.
 */
export const useAutoRefresh = (
  refetchFunctions: RefreshTask[],
  options: UseAutoRefreshOptions = {}
) => {
  const { intervalMs = 30 * 60 * 1000, enabled = true, minGapMs = 60 * 1000 } = options; // Default: 30 minutes
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState<RefreshSnapshot>(EMPTY_REFRESH_SNAPSHOT);
  const mountedAt = useRef(Date.now());
  const mounted = useRef(true);
  const fnsRef = useRef(refetchFunctions);
  fnsRef.current = refetchFunctions;

  const globalRefresh = useGlobalRefresh();
  const globalSnapshot = useGlobalRefreshSnapshot(globalRefresh);

  const runnerRef = useRef<RefreshRunner | null>(null);
  if (!runnerRef.current) {
    runnerRef.current = createRefreshRunner(() => fnsRef.current, {
      onChange: (next) => {
        if (mounted.current) setLocalSnapshot(next);
      },
    });
  }
  const runner = runnerRef.current;

  // In the shell, this screen's refetches become one task of the global batch (for as long as it is mounted).
  useEffect(() => {
    if (!globalRefresh || fnsRef.current.length === 0) return;
    return globalRefresh.registerTask(async () => {
      const results = await Promise.allSettled(
        fnsRef.current.map(async (task) => {
          await task();
        }),
      );
      if (results.some((r) => r.status === 'rejected')) throw new Error('A refresh task failed');
    });
  }, [globalRefresh]);

  const refetchAll = useCallback(
    () => (globalRefresh ? globalRefresh.run().then(() => undefined) : runner.run()),
    [globalRefresh, runner],
  );

  const snapshot: RefreshSnapshot = globalRefresh
    ? {
        refreshing: globalSnapshot.refreshing,
        lastStartedAt: globalSnapshot.lastStartedAt,
        lastFinishedAt: globalSnapshot.lastFinishedAt,
        lastFailures: globalSnapshot.lastFailures,
      }
    : localSnapshot;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Outside the shell only: this hook answers the header's refresh request itself. Inside the shell
  // the shell answers it, so a refresh never runs twice.
  useEffect(() => {
    if (globalRefresh) return;
    const onRefresh = createRefreshEventHandler(refetchAll);
    window.addEventListener(APP_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(APP_REFRESH_EVENT, onRefresh);
  }, [globalRefresh, refetchAll]);

  useEffect(() => {
    if (!enabled) return;
    const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

    // Skip ticks while the tab is hidden.
    intervalRef.current = setInterval(() => {
      if (isVisible()) refetchAll();
    }, intervalMs);

    // Refresh on tab return, unless data was just fetched.
    const onVisibility = () => {
      const lastRun = snapshotRef.current.lastStartedAt ?? mountedAt.current;
      if (isVisible() && Date.now() - lastRun >= minGapMs) refetchAll();
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

  return {
    refetchAll,
    isRefreshing: snapshot.refreshing,
    lastStartedAt: snapshot.lastStartedAt,
    lastFinishedAt: snapshot.lastFinishedAt,
    lastFailures: snapshot.lastFailures,
  };
};
