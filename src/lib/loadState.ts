/**
 * Decides what a list should honestly say: still loading, failed to load,
 * truly empty, or ready. A list must never say "nothing here yet" while the
 * data is still on its way or when the request failed.
 *
 * Data hooks are owned elsewhere. Some of them report a failure (`error`,
 * `isError` or `loadError`) and some do not yet, so this reads those fields
 * only if they exist. A hook that has none simply never reports "error".
 */

export type ListStatus = 'loading' | 'error' | 'empty' | 'ready';

/** True when a data hook says its last load failed, whichever of the known field names it uses. */
export const hookLoadFailed = (hook: object): boolean => {
  const state = hook as { error?: unknown; isError?: unknown; loadError?: unknown };
  const present = (v: unknown) => v !== undefined && v !== null && v !== false;
  return present(state.error) || present(state.loadError) || state.isError === true;
};

export const resolveListStatus = ({ loading, failed, count }: { loading: boolean; failed: boolean; count: number }): ListStatus => {
  if (loading) return 'loading';
  // Rows we already have stay on screen even if a refresh failed; only an empty list becomes an error.
  if (count > 0) return 'ready';
  return failed ? 'error' : 'empty';
};
