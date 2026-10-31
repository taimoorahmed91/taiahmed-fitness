import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ApplyOptions } from './swPolicy';
import { getPwaController } from './pwaController';
import type { ApplyResult, PwaState } from './updateController';

/**
 * Update state for a future "Update available" banner. Not wired into any screen yet.
 *
 *   const { status, applyUpdate, offlineReady } = usePwaUpdate();
 *   status === 'ready'              -> show a button that calls applyUpdate()
 *   status === 'blocked-by-workout' -> show "finish your workout first" (applyUpdate() would return 'blocked')
 *
 * Nothing here reloads by itself. See src/pwa/updateController.ts.
 */
export const usePwaUpdate = (): PwaState & {
  applyUpdate: (options?: ApplyOptions) => Promise<ApplyResult>;
  dismissUpdate: () => void;
  dismissOfflineReady: () => void;
} => {
  const controller = getPwaController();
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  // A workout can start or finish in this tab (no storage event fires for the same tab), so also
  // re-check when the page regains focus and when another tab changes storage.
  useEffect(() => {
    const recheck = () => controller.refresh();
    window.addEventListener('focus', recheck);
    window.addEventListener('storage', recheck);
    document.addEventListener('visibilitychange', recheck);
    recheck();
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('storage', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [controller]);

  const applyUpdate = useCallback((options?: ApplyOptions) => controller.applyUpdate(options), [controller]);
  return { ...state, applyUpdate, dismissUpdate: controller.dismissUpdate, dismissOfflineReady: controller.dismissOfflineReady };
};
