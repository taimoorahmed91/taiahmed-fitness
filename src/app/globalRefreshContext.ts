import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  EMPTY_GLOBAL_SNAPSHOT,
  createRefreshSource,
  type GlobalRefresh,
  type GlobalRefreshSnapshot,
  type RefreshLoad,
  type RefreshSource,
  type RefreshTask,
} from './globalRefresh';

/**
 * Set by AppLayout. `null` outside the signed-in shell, so a component that is also used elsewhere
 * can fall back to its own refresh handling.
 */
export const GlobalRefreshContext = createContext<GlobalRefresh | null>(null);

export const useGlobalRefresh = (): GlobalRefresh | null => useContext(GlobalRefreshContext);

const noopSubscribe = () => () => {};

/** Re-renders when a global refresh batch starts or ends. */
export const useGlobalRefreshSnapshot = (refresh: GlobalRefresh | null): GlobalRefreshSnapshot =>
  useSyncExternalStore(
    refresh ? refresh.subscribe : noopSubscribe,
    () => (refresh ? refresh.getSnapshot() : EMPTY_GLOBAL_SNAPSHOT),
    () => EMPTY_GLOBAL_SNAPSHOT,
  );

/**
 * Let a screen's own (non shared-table) data join the global refresh while it is mounted, so the
 * header Refresh and demo regeneration reload it too. The task may change every render.
 */
export const useRegisterRefreshTask = (task: RefreshTask): void => {
  const refresh = useGlobalRefresh();
  const taskRef = useRef(task);
  taskRef.current = task;
  useEffect(() => {
    if (!refresh) return;
    return refresh.registerTask(() => taskRef.current());
  }, [refresh]);
};

/**
 * For a hook that owns one non-table source (settings, goals, templates, ...). Gives the hook stable
 * `reload` / `refetch` / `restart` functions (see createRefreshSource) and, when mounted under the
 * shell, registers `reload` as the hook's ONE refresh task. `reload` rejects on failure, so the global
 * batch counts it truthfully. Outside the shell nothing is registered and the hook works on its own.
 *
 * `load` may be a new function every render (it is read through a ref), so nothing here re-registers
 * or re-renders because of it.
 */
export const useRefreshSource = (load: RefreshLoad): RefreshSource => {
  const loadRef = useRef(load);
  loadRef.current = load;
  const sourceRef = useRef<RefreshSource | null>(null);
  if (!sourceRef.current) sourceRef.current = createRefreshSource(() => loadRef.current);
  const source = sourceRef.current;
  useRegisterRefreshTask(source.reload);
  return source;
};
