/**
 * Refresh bookkeeping that does not depend on React, so it can be unit tested.
 *
 * - createRefreshRunner: runs a batch of refetch functions, one batch at a time.
 *   A second call while a batch is running gets the SAME promise (single flight).
 *   One failing refetch never stops the others and never throws.
 * - deriveFreshness: turns "when did the meals query last succeed" plus the
 *   state of the latest refresh attempt into one label for the UI.
 * - createRefreshEventHandler: the listener for the header's refresh request.
 *
 * Freshness is based on the last SUCCESSFUL meals fetch (a timestamp the data
 * hook sets only after the query worked), never on mount time and never on
 * "the batch finished" (the hooks swallow their own errors).
 */

export type RefreshTask = () => void | Promise<void>;

export interface RefreshSnapshot {
  refreshing: boolean;
  /** When the latest batch began (ms), or null if none has run yet. */
  lastStartedAt: number | null;
  /** When the latest batch ended (ms), or null while the first one is running. */
  lastFinishedAt: number | null;
  /** How many refetches in the latest batch threw or rejected. */
  lastFailures: number;
}

export const EMPTY_REFRESH_SNAPSHOT: RefreshSnapshot = {
  refreshing: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastFailures: 0,
};

export interface RefreshRunner {
  run: () => Promise<void>;
  getSnapshot: () => RefreshSnapshot;
}

export function createRefreshRunner(
  getTasks: () => RefreshTask[],
  options: { now?: () => number; onChange?: (snapshot: RefreshSnapshot) => void } = {},
): RefreshRunner {
  const now = options.now ?? Date.now;
  let snapshot: RefreshSnapshot = EMPTY_REFRESH_SNAPSHOT;
  let inFlight: Promise<void> | null = null;

  const set = (next: RefreshSnapshot) => {
    snapshot = next;
    options.onChange?.(snapshot);
  };

  const run = () => {
    if (inFlight) return inFlight;
    set({ ...snapshot, refreshing: true, lastStartedAt: now(), lastFinishedAt: null, lastFailures: 0 });
    const batch = (async () => {
      const results = await Promise.allSettled(
        getTasks().map(async (task) => {
          await task();
        }),
      );
      const failures = results.filter((r) => r.status === 'rejected').length;
      inFlight = null;
      set({ ...snapshot, refreshing: false, lastFinishedAt: now(), lastFailures: failures });
    })();
    inFlight = batch;
    return batch;
  };

  return { run, getSnapshot: () => snapshot };
}

export type FreshnessStatus = 'loading' | 'refreshing' | 'fresh' | 'stale' | 'unavailable';

export interface FreshnessInput {
  /** Time of the last successful meals query (ms), or null if none has succeeded. */
  fetchedAt: number | null;
  /** First load of the meals query still running. */
  loading: boolean;
  refreshing: boolean;
  lastStartedAt: number | null;
  lastFinishedAt: number | null;
  now: number;
  /** Older than this counts as stale even without a failed refresh. */
  staleAfterMs: number;
}

export const deriveFreshness = (input: FreshnessInput): FreshnessStatus => {
  const { fetchedAt, loading, refreshing, lastStartedAt, lastFinishedAt, now, staleAfterMs } = input;
  if (refreshing) return 'refreshing';
  if (fetchedAt == null) return loading ? 'loading' : 'unavailable';
  // The last refresh ended but the meals query did not succeed during it.
  if (lastStartedAt != null && lastFinishedAt != null && fetchedAt < lastStartedAt) return 'stale';
  if (now - fetchedAt > staleAfterMs) return 'stale';
  return 'fresh';
};

/**
 * Listener for the app-wide refresh request (see src/app/refresh.ts).
 * preventDefault() tells the sender that a data owner handled it, so the sender
 * must not reload the page. The refetch itself goes through the same single-flight
 * runner as the timer, so repeated taps never start a second batch.
 */
export const createRefreshEventHandler =
  (refetchAll: () => Promise<void>) =>
  (event: { preventDefault: () => void }): void => {
    event.preventDefault();
    void refetchAll();
  };
