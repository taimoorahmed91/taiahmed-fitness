import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUser } from '@/contexts/UserContext';
import { shouldShowFetchError } from '@/lib/fetchErrorToast';
import {
  SHARED_QUERY_OPTIONS,
  deriveSharedTableState,
  invalidateSharedTable,
  patchSharedList,
  removeOtherUsersSharedData,
  sharedDataKey,
  type SharedTable,
  type SharedTableState,
} from '@/lib/sharedData';

interface SharedTableOptions<T> {
  table: SharedTable;
  /** Loads every row of the table for this user, already mapped to the hook's item type. */
  fetchRows: (userId: string) => Promise<T[]>;
  /** Shown once per failed fetch. */
  errorMessage: string;
  /** When set, the toast is rate limited per source (never offline, once per 10 minutes). */
  errorToastKey?: string;
}

/**
 * The one place a shared table hook talks to React Query.
 *
 * Network dedupe: the query key is [root, user id, table], so every component that calls the
 * same table hook subscribes to the same query. React Query runs one `fetchRows` for all of
 * them, and a second `refetch` while one is running joins the running request.
 */
export function useSharedTable<T extends { id: string }>({ table, fetchRows, errorMessage, errorToastKey }: SharedTableOptions<T>) {
  const { user, loading: authLoading } = useUser();
  const userId = user?.id ?? null;
  const client = useQueryClient();
  const queryKey = useMemo(() => sharedDataKey(userId, table), [userId, table]);
  // One stable empty list per hook instance, so "no rows" does not look like a change on every render.
  const emptyRef = useRef<T[]>([]);

  const query = useQuery<T[]>({
    queryKey,
    enabled: userId !== null,
    ...SHARED_QUERY_OPTIONS,
    queryFn: async ({ queryKey: [, keyUserId] }) => {
      try {
        // Always fetch for the user the key names, never for whoever is signed in by the time this runs.
        return await fetchRows(keyUserId as string);
      } catch (error) {
        console.error(`Error fetching ${table}:`, error);
        // A failed FIRST load is always reported. A failed background refresh (rows already on screen)
        // is rate limited per source, so a refresh of many tables does not stack up toasts.
        const hadRows = client.getQueryState(queryKey)?.data !== undefined;
        if (!hadRows && !errorToastKey) toast.error(errorMessage);
        else if (shouldShowFetchError(errorToastKey ?? `shared:${table}`)) toast.error(errorMessage);
        // Rethrow so the query keeps its previous rows and its last-success time.
        throw error;
      }
    },
  });

  // A new identity is a new key (so nothing from the last user is shown). Also free the last
  // user's rows from memory.
  useEffect(() => {
    removeOtherUsersSharedData(client, userId);
  }, [client, userId]);

  const data = (userId !== null ? query.data : undefined) ?? emptyRef.current;

  // Explicit load/error state. `loading` above keeps its old meaning; these tell a failed first load
  // ("error", rows unknown) apart from a real empty list, and flag a failed refresh over kept rows.
  const state = useMemo(
    () => deriveSharedTableState({ signedIn: userId !== null, authLoading, query: userId !== null ? query : undefined }),
    // `query.status`/`data`/`error` are what the state is derived from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, authLoading, query.status, query.data, query.error],
  );

  // True until the first fetch settles (success or failure), and while the signed-in user is unknown.
  const loading = authLoading || (userId !== null && query.isPending);

  const lastFetchedAt = useMemo(
    () => (userId !== null && query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt) : null),
    [userId, query.dataUpdatedAt],
  );

  /**
   * Awaitable manual refresh. Joins a fetch that is already running (a second caller never
   * starts another request) and never rejects; a failure is reported by the query's toast.
   */
  const refetch = useCallback(async (): Promise<void> => {
    if (userId === null) return;
    await client.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false });
  }, [client, queryKey, userId]);

  /** Patch this table's cache for `forUserId` (defaults to the signed-in user). */
  const patch = useCallback(
    (updater: (list: T[]) => T[], forUserId: string | null = userId) =>
      patchSharedList<T>(client, forUserId, table, updater),
    [client, table, userId],
  );

  /** Refetch this table from the server and wait for it. */
  const invalidate = useCallback(
    (forUserId: string | null = userId) => invalidateSharedTable(client, forUserId, table),
    [client, table, userId],
  );

  return {
    user,
    userId,
    client,
    data,
    loading,
    lastFetchedAt,
    refetch,
    patch,
    invalidate,
    /** 'loading' | 'ready' | 'error' | 'idle'. See SharedTablePhase. */
    phase: state.phase,
    /** The first load failed: `data` is empty because it is UNKNOWN, not because there is nothing. */
    loadFailed: state.loadFailed,
    /** A refetch failed; `data` is the last good rows and may be out of date. */
    refreshFailed: state.refreshFailed,
    error: state.error,
  };
}

/**
 * Load/error state of one shared table for any screen, without owning the fetch. It watches the same
 * cache entry the table's hook fills, so a page can show a skeleton or an error for a hook that does
 * not (yet) return its own `phase`. Mount the table's hook on the page too: this only reads.
 */
export function useSharedTableState(table: SharedTable): SharedTableState {
  const { user, loading: authLoading } = useUser();
  const userId = user?.id ?? null;
  const client = useQueryClient();
  const queryKey = useMemo(() => sharedDataKey(userId, table), [userId, table]);
  const subscribe = useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client]);
  // The query state object is replaced on every change and is stable in between.
  const query = useSyncExternalStore(
    subscribe,
    () => client.getQueryState(queryKey),
    () => undefined,
  );
  return useMemo(
    () => deriveSharedTableState({ signedIn: userId !== null, authLoading, query }),
    [userId, authLoading, query],
  );
}
