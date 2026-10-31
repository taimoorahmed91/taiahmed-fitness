/**
 * Shared data cache helpers (no React, no Supabase), so they can be unit tested.
 *
 * Every shared table hook (meals, gym, weight, ...) keeps its rows in ONE React Query
 * cache entry per signed-in user and table:
 *
 *     ['fittrack-data', <user id | null>, <table>]
 *
 * - Same user + same table  = same key = every hook instance shares one fetch.
 * - A different user (or no user) = a different key, so rows never leak between accounts.
 * - Writes patch that one entry with the row the database sent back, so every screen
 *   that reads the table updates together, without an extra network round trip.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const SHARED_DATA_ROOT = 'fittrack-data' as const;

export const SHARED_TABLES = [
  'meals',
  'gym_sessions',
  'weight',
  'waist',
  'sleep',
  'whoop',
  'extra_activities',
  'daily_notes',
] as const;

export type SharedTable = (typeof SHARED_TABLES)[number];

export type SharedDataKey = readonly [typeof SHARED_DATA_ROOT, string | null, SharedTable];

/** The cache key for one user's rows of one table. `null` is the signed-out key (never fetched). */
export const sharedDataKey = (userId: string | null | undefined, table: SharedTable): SharedDataKey => [
  SHARED_DATA_ROOT,
  userId ?? null,
  table,
];

/** Prefix that matches every shared table of one user. */
export const sharedDataUserKey = (userId: string | null | undefined) => [SHARED_DATA_ROOT, userId ?? null] as const;

export const isSharedDataKey = (key: QueryKey | undefined): key is SharedDataKey =>
  Array.isArray(key) &&
  key.length === 3 &&
  key[0] === SHARED_DATA_ROOT &&
  (key[1] === null || typeof key[1] === 'string') &&
  (SHARED_TABLES as readonly unknown[]).includes(key[2]);

/** True for a shared-data key that belongs to someone other than `userId` (or to anyone, when signed out). */
export const isOtherUsersSharedKey = (key: QueryKey | undefined, userId: string | null | undefined): boolean =>
  isSharedDataKey(key) && key[1] !== (userId ?? null);

/**
 * Options every shared table query uses. The app's QueryClient uses library defaults, so the
 * behaviour that matters is set per query:
 * - fresh for a minute: moving between pages reuses the cache instead of refetching every table;
 * - no refetch on focus/reconnect: useAutoRefresh already owns timed and tab-return refreshes;
 * - no retries: a failed fetch reports once (one toast) like before, and keeps the old rows;
 * - networkMode 'always': an offline first load fails (error state) instead of waiting on a skeleton.
 */
export const SHARED_QUERY_OPTIONS = {
  // Try the request even when the browser thinks it is offline. The default would pause it and leave a
  // first load on a skeleton forever; this makes it fail fast and show the error state with a retry.
  networkMode: 'always',
  staleTime: 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
} as const;

/**
 * Drop every cached table that belongs to a different user. Called when the signed-in identity
 * changes, so a previous account's rows are gone from memory (not just hidden by the key).
 */
export const removeOtherUsersSharedData = (client: QueryClient, userId: string | null | undefined): void => {
  client.removeQueries({ predicate: (query) => isOtherUsersSharedKey(query.queryKey, userId) });
};

// ---------------------------------------------------------------------------
// Loading / error state
// ---------------------------------------------------------------------------

/**
 * Where a shared table is in its life, from one screen's point of view:
 *
 * - `loading`: no rows yet and nothing has failed (or we do not know who is signed in yet).
 *   Show a skeleton, never "0" or "no data".
 * - `ready`:   the table loaded successfully at least once. An empty list is a TRUE empty list.
 *              `refreshFailed` is set when a LATER refetch failed: the rows are still the last
 *              good ones, but they may be out of date.
 * - `error`:   the FIRST load failed, so there are no rows. An empty list here means "unknown",
 *              not "none". Show an error with a retry.
 * - `idle`:    nobody is signed in, so there is nothing to load.
 */
export type SharedTablePhase = 'loading' | 'ready' | 'error' | 'idle';

export interface SharedTableState {
  phase: SharedTablePhase;
  /** The first load failed and there are no rows (`phase === 'error'`). */
  loadFailed: boolean;
  /** A refetch failed but earlier rows are kept (`phase === 'ready'`). The data may be stale. */
  refreshFailed: boolean;
  /** The last error the table query reported, or null. */
  error: unknown;
}

/** The parts of a React Query state this module needs (QueryState is assignable to it). */
export interface SharedQuerySnapshot {
  status: 'pending' | 'error' | 'success';
  data: unknown;
  error: unknown;
}

export const deriveSharedTableState = (input: {
  signedIn: boolean;
  /** The signed-in user is still being worked out. */
  authLoading: boolean;
  /** `queryClient.getQueryState(key)` for the signed-in user's key; undefined when never created. */
  query: SharedQuerySnapshot | undefined;
}): SharedTableState => {
  const { signedIn, authLoading, query } = input;
  if (!signedIn) {
    return { phase: authLoading ? 'loading' : 'idle', loadFailed: false, refreshFailed: false, error: null };
  }
  const failed = query?.status === 'error';
  const error = failed ? query!.error : null;
  if (query && query.data !== undefined) {
    return { phase: 'ready', loadFailed: false, refreshFailed: failed, error };
  }
  if (failed) return { phase: 'error', loadFailed: true, refreshFailed: false, error };
  return { phase: 'loading', loadFailed: false, refreshFailed: false, error: null };
};

/**
 * Text of a caught error for the activity log. Supabase errors are plain objects with a `message`,
 * not `Error` instances, so look at the property instead of using `instanceof`.
 */
export const errorText = (error: unknown, fallback: string): string => {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message ? message : fallback;
};

// ---------------------------------------------------------------------------
// Pure list helpers
// ---------------------------------------------------------------------------

export type Compare<T> = (a: T, b: T) => number;

/** Newest date first (ISO `YYYY-MM-DD` strings compare correctly as text). */
export const byDateDesc = <T extends { date: string }>(a: T, b: T): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

/** Meals: newest date first, then latest time first (matches the meals query ordering). */
export const byDateTimeDesc = <T extends { date: string; time: string }>(a: T, b: T): number =>
  byDateDesc(a, b) || (a.time < b.time ? 1 : a.time > b.time ? -1 : 0);

/** Extra activities: newest date first, then most recently created first (matches the query ordering). */
export const byDateCreatedDesc = <T extends { date: string; created_at: string }>(a: T, b: T): number =>
  byDateDesc(a, b) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

/**
 * Insert or replace one item so the list stays in the same order the database query returns.
 *
 * - An item that is already in the list and still fits between its neighbours stays exactly
 *   where it is (editing a row must not shuffle rows that share its date).
 * - Otherwise it is removed and inserted at its sorted place; on a tie the new item goes first.
 * - Matching uses the id, or `isSame` when one row can replace another (for example one note per date).
 *
 * Never mutates the input.
 */
export const upsertSorted = <T extends { id: string }>(
  list: readonly T[],
  item: T,
  compare: Compare<T>,
  isSame: (existing: T, incoming: T) => boolean = (existing, incoming) => existing.id === incoming.id,
): T[] => {
  const matches = list.filter((existing) => isSame(existing, item));
  if (matches.length === 1) {
    const at = list.indexOf(matches[0]);
    const before = list[at - 1];
    const after = list[at + 1];
    const fits = (before === undefined || compare(before, item) <= 0) && (after === undefined || compare(item, after) <= 0);
    if (fits) return list.map((existing, i) => (i === at ? item : existing));
  }
  const rest = matches.length === 0 ? list : list.filter((existing) => !isSame(existing, item));
  const at = rest.findIndex((existing) => compare(item, existing) <= 0);
  return at === -1 ? [...rest, item] : [...rest.slice(0, at), item, ...rest.slice(at)];
};

/** Remove one item by id. Returns the same array when nothing matched (no needless re-render). */
export const removeById = <T extends { id: string }>(list: readonly T[], id: string): T[] => {
  const next = list.filter((item) => item.id !== id);
  return next.length === list.length ? (list as T[]) : next;
};

/** Replace one item by id. Returns the same array when nothing matched. */
export const replaceById = <T extends { id: string }>(list: readonly T[], id: string, next: T): T[] => {
  if (!list.some((item) => item.id === id)) return list as T[];
  return list.map((item) => (item.id === id ? next : item));
};

// ---------------------------------------------------------------------------
// Cache patching
// ---------------------------------------------------------------------------

/**
 * Apply a change to one user's cached rows of one table.
 *
 * - Does nothing when there is no user or nothing cached yet (the first fetch will load it).
 * - Keeps the entry's last successful fetch time. A local patch is not a fetch, and the meals
 *   freshness label is based on the last query that really succeeded.
 * - If a fetch is running, it may have started before this write and would overwrite the patch
 *   with older rows. So it is replaced by a fresh fetch (the patch stays visible meanwhile).
 *
 * Returns true when the cache was changed.
 */
export const patchSharedList = <T>(
  client: QueryClient,
  userId: string | null | undefined,
  table: SharedTable,
  updater: (list: T[]) => T[],
): boolean => {
  if (!userId) return false;
  const queryKey = sharedDataKey(userId, table);
  const state = client.getQueryState<T[]>(queryKey);
  const fetching = client.isFetching({ queryKey, exact: true }) > 0;
  if (!state || state.data === undefined) {
    // First load still running: it may have started before this write, so drop it and load again.
    // (Invalidating alone would let the running request finish; with no rows yet it is not replaced.)
    if (fetching) {
      void client
        .cancelQueries({ queryKey, exact: true })
        .then(() => client.invalidateQueries({ queryKey, exact: true }));
    }
    return false;
  }

  const next = updater(state.data);
  if (next !== state.data) {
    client.setQueryData<T[]>(queryKey, next, { updatedAt: state.dataUpdatedAt });
    if (state.status === 'error') {
      // setQueryData marks the query as a success. A local write says nothing about the rows we
      // failed to refresh, so keep the "last refresh failed" flag.
      client.getQueryCache().find({ queryKey, exact: true })?.setState({
        status: 'error',
        error: state.error,
        errorUpdatedAt: state.errorUpdatedAt,
        errorUpdateCount: state.errorUpdateCount,
      });
    }
  }
  if (fetching) void client.invalidateQueries({ queryKey, exact: true });
  return next !== state.data;
};

/** Mark one table stale and refetch it now. Resolves when the refetch is done; never rejects. */
export const invalidateSharedTable = async (
  client: QueryClient,
  userId: string | null | undefined,
  table: SharedTable,
): Promise<void> => {
  if (!userId) return;
  try {
    await client.invalidateQueries({ queryKey: sharedDataKey(userId, table), exact: true });
  } catch {
    /* the table query reports its own fetch errors */
  }
};
