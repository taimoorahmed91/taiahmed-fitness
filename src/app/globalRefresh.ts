/**
 * The app-wide refresh owner. No React and no browser globals, so it can be unit tested.
 *
 * One instance lives in the signed-in shell (AppLayout). Because it belongs to the shell and not to
 * a page, the header's "Refresh data" and the demo "Generate random data" work from every protected
 * page, whether or not the Dashboard is mounted.
 *
 * What a batch refreshes:
 *  1. every ACTIVE shared table query (a table some mounted screen is reading), and
 *  2. every task a screen registered for data that is not a shared table (see `registerTask`).
 *
 * Guarantees:
 *  - Single flight: while a batch runs, every `run()` gets that same batch. Header taps, the
 *    Dashboard timer and tab-return refreshes never start a second one.
 *  - `run({ invalidate: true })` (after the server data was replaced) never reuses a batch that
 *    started before the change. It waits for the running batch, then runs ONE fresh batch that all
 *    such callers share. It also marks tables nobody is reading as stale, so they reload on next use.
 *  - The result is honest: `nothing-to-refresh` when nothing subscribed, otherwise how many sources
 *    succeeded or failed. A failed refetch keeps the previous rows (see sharedData.ts).
 *  - Freshness labels are NOT derived from here. They stay tied to the last successful meals fetch.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { isSharedDataKey, type SharedTableState } from '../lib/sharedData';

export type RefreshTask = () => void | Promise<void>;

export type GlobalRefreshOutcome = 'nothing-to-refresh' | 'success' | 'partial' | 'failure';

export interface GlobalRefreshResult {
  outcome: GlobalRefreshOutcome;
  /** Sources in the batch: active shared tables plus registered tasks. */
  total: number;
  /** Sources that failed: a table whose refetch ended in error, or a task that threw. */
  failed: number;
  startedAt: number;
  finishedAt: number;
}

export interface GlobalRefreshSnapshot {
  refreshing: boolean;
  /** When the latest batch began (ms), or null if none has run yet. */
  lastStartedAt: number | null;
  /** When the latest batch ended (ms), or null while the first one is running. */
  lastFinishedAt: number | null;
  /** How many sources failed in the latest batch. */
  lastFailures: number;
  lastResult: GlobalRefreshResult | null;
}

export const EMPTY_GLOBAL_SNAPSHOT: GlobalRefreshSnapshot = {
  refreshing: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastFailures: 0,
  lastResult: null,
};

export interface GlobalRefreshOptions {
  /** The server data changed (for example demo data was regenerated): never accept an older in-flight result. */
  invalidate?: boolean;
}

export interface GlobalRefresh {
  run: (options?: GlobalRefreshOptions) => Promise<GlobalRefreshResult>;
  /** Add a refetch for data that is not a shared table. Returns the function that removes it. */
  registerTask: (task: RefreshTask) => () => void;
  /** True when a batch started now would have something to refresh. */
  hasWork: () => boolean;
  getSnapshot: () => GlobalRefreshSnapshot;
  subscribe: (listener: () => void) => () => void;
}

/** Shared table queries that a mounted screen is reading right now. */
const activeSharedKeys = (client: QueryClient): QueryKey[] =>
  client
    .getQueryCache()
    .findAll({ predicate: (query) => isSharedDataKey(query.queryKey) && query.isActive() })
    .map((query) => query.queryKey);

export function createGlobalRefresh(
  getClient: () => QueryClient,
  options: { now?: () => number } = {},
): GlobalRefresh {
  const now = options.now ?? Date.now;
  const tasks = new Set<RefreshTask>();
  const listeners = new Set<() => void>();
  let snapshot: GlobalRefreshSnapshot = EMPTY_GLOBAL_SNAPSHOT;
  let inFlight: Promise<GlobalRefreshResult> | null = null;
  let queuedInvalidate: Promise<GlobalRefreshResult> | null = null;

  const set = (next: GlobalRefreshSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const execute = async (invalidate: boolean): Promise<GlobalRefreshResult> => {
    const client = getClient();
    const startedAt = now();
    set({ ...snapshot, refreshing: true, lastStartedAt: startedAt, lastFinishedAt: null, lastFailures: 0 });

    try {
      const keys = activeSharedKeys(client);
      const taskList = [...tasks];

      // Tables and tasks run together. A task that refetches a shared table joins the request already
      // running for it (the refetch never cancels a running one), so nothing is fetched twice.
      const tableWork = invalidate
        ? client.invalidateQueries({ predicate: (query) => isSharedDataKey(query.queryKey) })
        : Promise.all(
            keys.map((queryKey) => client.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false })),
          );
      const [, taskResults] = await Promise.all([
        Promise.resolve(tableWork).catch(() => undefined),
        Promise.allSettled(
          taskList.map(async (task) => {
            await task();
          }),
        ),
      ]);

      // Refetches never reject (the table queries report their own errors), so read the outcome from
      // the query: a failed refetch leaves it in 'error' while the previous rows stay in place.
      const failedTables = keys.filter((queryKey) => client.getQueryState(queryKey)?.status === 'error').length;
      const failedTasks = taskResults.filter((r) => r.status === 'rejected').length;
      const total = keys.length + taskList.length;
      const failed = failedTables + failedTasks;
      const finishedAt = now();
      const outcome: GlobalRefreshOutcome =
        total === 0 ? 'nothing-to-refresh' : failed === 0 ? 'success' : failed >= total ? 'failure' : 'partial';
      const result: GlobalRefreshResult = { outcome, total, failed, startedAt, finishedAt };
      set({ refreshing: false, lastStartedAt: startedAt, lastFinishedAt: finishedAt, lastFailures: failed, lastResult: result });
      return result;
    } catch (error) {
      // Never leave the app stuck in "refreshing".
      set({ ...snapshot, refreshing: false, lastFinishedAt: now() });
      throw error;
    }
  };

  const start = (invalidate: boolean): Promise<GlobalRefreshResult> => {
    const batch = execute(invalidate).finally(() => {
      inFlight = null;
    });
    inFlight = batch;
    return batch;
  };

  const run = (runOptions: GlobalRefreshOptions = {}): Promise<GlobalRefreshResult> => {
    const invalidate = runOptions.invalidate === true;
    if (!inFlight) {
      // The gap between a batch ending and its queued follow-up starting: join the follow-up.
      if (queuedInvalidate) return queuedInvalidate;
      return start(invalidate);
    }
    if (queuedInvalidate) return queuedInvalidate;
    if (!invalidate) return inFlight;
    // Wait for the running batch (it may hold pre-change data), then run one fresh batch for everyone.
    queuedInvalidate = inFlight.then(() => {
      queuedInvalidate = null;
      return run({ invalidate: true });
    });
    return queuedInvalidate;
  };

  return {
    run,
    registerTask: (task) => {
      tasks.add(task);
      return () => {
        tasks.delete(task);
      };
    },
    hasWork: () => tasks.size > 0 || activeSharedKeys(getClient()).length > 0,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Non-table sources (settings, goals, templates, ...)
// ---------------------------------------------------------------------------

/**
 * Where a hook-owned (non shared-table) source is, from the hook's own bookkeeping:
 * - `loaded`: it has real data on screen (from the server, or a saved copy that is shown on purpose).
 * - `failed`: the latest attempt failed.
 */
export interface SourceStatus {
  loaded: boolean;
  failed: boolean;
  error: unknown;
}

export const INITIAL_SOURCE_STATUS: SourceStatus = { loaded: false, failed: false, error: null };
/** One shared object, so setting it again does not re-render. */
export const LOADED_SOURCE_STATUS: SourceStatus = { loaded: true, failed: false, error: null };

/**
 * Same shape and meaning as a shared table's state, so pages can use `tableView()` and the notices
 * for these sources too:
 * - loaded + failed  -> `ready` with `refreshFailed` (the rows are the last good ones, maybe out of date)
 * - not loaded + failed -> `error` with `loadFailed` (the rows are unknown, not empty)
 * - otherwise `loading` until the first attempt ends.
 */
export const deriveSourceState = (status: SourceStatus): SharedTableState => {
  if (status.loaded) {
    return {
      phase: 'ready',
      loadFailed: false,
      refreshFailed: status.failed,
      error: status.failed ? status.error : null,
    };
  }
  if (status.failed) return { phase: 'error', loadFailed: true, refreshFailed: false, error: status.error };
  return { phase: 'loading', loadFailed: false, refreshFailed: false, error: null };
};

export interface RefreshLoadContext {
  /** True once a newer load started (restart) or this one was replaced. A stale load must not touch state. */
  isStale: () => boolean;
}

export type RefreshLoad = (context: RefreshLoadContext) => Promise<void>;

export interface RefreshSource {
  /** Single flight. Callers while a load runs get the same promise. REJECTS when the load failed. */
  reload: () => Promise<void>;
  /** Same as `reload`, but never rejects (the hook's own state already records the failure). */
  refetch: () => Promise<void>;
  /** Drop any running load (it can no longer commit) and start a fresh one. Never rejects. Use after a change. */
  restart: () => Promise<void>;
}

const swallow = () => undefined;

/**
 * The plumbing every hook-owned source shares. `getLoad` is read at call time, so the hook may pass a
 * new closure each render and the three functions here still never change.
 */
export const createRefreshSource = (getLoad: () => RefreshLoad): RefreshSource => {
  let generation = 0;
  let inFlight: Promise<void> | null = null;

  const start = (): Promise<void> => {
    const mine = generation;
    const run = Promise.resolve()
      .then(() => getLoad()({ isStale: () => mine !== generation }))
      .finally(() => {
        if (inFlight === run) inFlight = null;
      });
    inFlight = run;
    return run;
  };

  const reload = () => inFlight ?? start();
  return {
    reload,
    refetch: () => reload().then(swallow, swallow),
    restart: () => {
      generation += 1;
      inFlight = null;
      return start().then(swallow, swallow);
    },
  };
};

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

export interface RefreshMessage {
  kind: 'success' | 'info' | 'warning' | 'error';
  message: string;
  description?: string;
}

/** What to tell the user after the header "Refresh data" action. Based on the batch that really ran. */
export const describeManualRefresh = (result: GlobalRefreshResult): RefreshMessage => {
  switch (result.outcome) {
    case 'nothing-to-refresh':
      return { kind: 'info', message: 'Nothing to refresh on this page.', description: 'Pages that show your data update when you open them.' };
    case 'success':
      return { kind: 'success', message: 'Data refreshed.' };
    case 'partial':
      return {
        kind: 'warning',
        message: `Refreshed, but ${result.failed} of ${result.total} sources failed.`,
        description: 'Those still show the last data we loaded.',
      };
    default:
      return {
        kind: 'error',
        message: "Couldn't refresh your data.",
        description: 'You are seeing the last data we loaded. Check your connection and try again.',
      };
  }
};

/** What to tell the user after the demo data was regenerated on the server and the app reloaded it. */
export const describeDemoRegeneration = (result: GlobalRefreshResult): RefreshMessage => {
  switch (result.outcome) {
    case 'nothing-to-refresh':
      return {
        kind: 'success',
        message: 'New sample data is ready.',
        description: 'Pages load it when you open them.',
      };
    case 'success':
      return { kind: 'success', message: 'New sample data loaded.' };
    case 'partial':
      return {
        kind: 'warning',
        message: 'New sample data was created, but some of it did not load.',
        description: 'Use "Refresh data" in the account menu to try again.',
      };
    default:
      return {
        kind: 'error',
        message: "New sample data was created, but we couldn't load it.",
        description: 'The screens still show the old data. Use "Refresh data" in the account menu to try again.',
      };
  }
};
