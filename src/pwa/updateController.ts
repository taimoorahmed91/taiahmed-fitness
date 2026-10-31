// The update-state store behind usePwaUpdate(). It has no React and no browser
// globals (storage and the "apply" function are injected), so the gating rules are unit tested.
//
// Contract with the future UI:
//  - state.status === 'ready'              -> show "Update available" with a button calling applyUpdate().
//  - state.status === 'blocked-by-workout' -> a workout is saved on this device. Show "Update ready, finish
//                                             your workout first" and do NOT offer a one-tap reload.
//                                             (applyUpdate({ allowDuringWorkout: true }) exists for an
//                                             explicit "update anyway" choice; the workout is kept and restored.)
//  - Nothing in this file ever reloads on its own. Only applyUpdate() can, and only after decideApply().
import { decideApply, hasActiveWorkout, updateStatus, type ApplyOptions, type UpdateStatus } from './swPolicy';

export interface PwaState {
  /** This browser can run service workers. */
  supported: boolean;
  /** A worker is registered for this page. */
  registered: boolean;
  /** Switched off by ?sw=off (or a remembered choice) or unavailable (dev build). */
  disabled: boolean;
  /** The app has been cached once: it can open without a connection. */
  offlineReady: boolean;
  /** A new version is installed and waiting. */
  needRefresh: boolean;
  /** A workout is saved on this device right now. */
  activeWorkout: boolean;
  status: UpdateStatus;
  lastCheckedAt: number | null;
  error: string | null;
}

export type ApplyResult = 'applied' | 'blocked' | 'nothing-to-apply';

type StorageReader = { getItem(key: string): string | null } | null;
type Updater = (reloadPage?: boolean) => Promise<void> | void;

export interface UpdateControllerDeps {
  storage: StorageReader;
  now?: () => number;
}

export const createUpdateController = (deps: UpdateControllerDeps) => {
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();
  let updater: Updater | null = null;
  let base = { supported: false, registered: false, disabled: false, offlineReady: false, needRefresh: false, lastCheckedAt: null as number | null, error: null as string | null };
  let state: PwaState = derive();

  function derive(): PwaState {
    const activeWorkout = hasActiveWorkout(deps.storage);
    return { ...base, activeWorkout, status: updateStatus({ needRefresh: base.needRefresh, activeWorkout }) };
  }

  const same = (a: PwaState, b: PwaState) => (Object.keys(a) as (keyof PwaState)[]).every((k) => a[k] === b[k]);

  // The snapshot object only changes when a value changes, which useSyncExternalStore requires.
  const refresh = () => {
    const next = derive();
    if (same(next, state)) return;
    state = next;
    listeners.forEach((l) => l());
  };

  const patch = (changes: Partial<typeof base>) => {
    base = { ...base, ...changes };
    refresh();
  };

  return {
    getState: (): PwaState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Re-read whether a workout is saved (call on focus / storage events). */
    refresh,
    setSupported: (supported: boolean) => patch({ supported }),
    markRegistered: (registered: boolean) => patch({ registered }),
    markDisabled: (disabled: boolean) => patch({ disabled }),
    markOfflineReady: (offlineReady = true) => patch({ offlineReady }),
    markNeedRefresh: (needRefresh = true) => patch({ needRefresh }),
    markChecked: () => patch({ lastCheckedAt: now() }),
    markError: (error: string | null) => patch({ error }),
    /** Provide the function that activates the waiting worker (from virtual:pwa-register). */
    setUpdater: (fn: Updater | null) => {
      updater = fn;
    },
    /** Hide the "ready to work offline" notice. */
    dismissOfflineReady: () => patch({ offlineReady: false }),
    /** Hide the update prompt for now (it comes back on the next check). */
    dismissUpdate: () => patch({ needRefresh: false }),
    /**
     * Activate the waiting version and reload. Blocked while a workout is saved unless the caller
     * explicitly allows it. This is the only code path that can reload the page.
     */
    applyUpdate: async (options: ApplyOptions = {}): Promise<ApplyResult> => {
      refresh();
      const decision = decideApply({ needRefresh: state.needRefresh, activeWorkout: state.activeWorkout }, options);
      if (decision === 'blocked') return 'blocked';
      if (decision === 'nothing-to-apply' || !updater) return 'nothing-to-apply';
      await updater(true);
      return 'applied';
    },
  };
};

export type UpdateController = ReturnType<typeof createUpdateController>;
