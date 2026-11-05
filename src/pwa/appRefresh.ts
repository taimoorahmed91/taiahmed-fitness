// "Refresh app & data": the one explicit action that refreshes the data on screen AND looks for a new app
// version. No React and no browser globals (everything is injected), so every branch is unit tested.
//
// What it guarantees
//  - Single flight: a second call while one runs gets the SAME run, it never starts another.
//  - Data and the version check run side by side; one failing never cancels the other.
//  - Applying a found version goes through the existing applyUpdate() gate, which refuses while a workout
//    is saved on this device. When that happens nothing reloads and the draft is untouched.
//  - Because applying may reload the page, the caller gets `beforeApply` (awaited) to say so first.
//  - It never unregisters a worker and never deletes a cache. It only asks for a check and, when allowed, applies.
import type { GlobalRefreshResult } from '../app/globalRefresh';
import type { ApplyResult, CheckResult, PwaState } from './updateController';
import { defaultSchedule, type Schedule } from './updateCheck';

export const DOWNLOAD_WAIT_MS = 60_000;

export type DataRefreshOutcome =
  | { kind: 'result'; result: GlobalRefreshResult }
  /** Outside the signed-in shell: the page was asked to refresh itself, how it went is not known. */
  | { kind: 'requested' }
  | { kind: 'none' }
  | { kind: 'error' };

/**
 *  - applied:       a waiting version was activated; the page is reloading (or about to)
 *  - blocked:       a version is waiting but a workout is in progress, so it was NOT applied
 *  - current:       the check really ran and nothing newer is waiting
 *  - check-failed:  the check threw or timed out and nothing is waiting
 *  - unavailable:   no worker here (dev build, ?sw=off, unsupported browser)
 *  - apply-failed:  a version is waiting but activating it failed
 *  - downloading:   a new version is still downloading after the bounded wait
 */
export type UpdateOutcome = 'applied' | 'blocked' | 'current' | 'check-failed' | 'unavailable' | 'apply-failed' | 'downloading';

export interface AppRefreshResult {
  data: DataRefreshOutcome;
  update: UpdateOutcome;
}

export interface AppRefreshController {
  checkForUpdate(options?: { force?: boolean }): Promise<CheckResult>;
  applyUpdate(): Promise<ApplyResult>;
  /** Re-reads whether a workout is saved, then returns the state. */
  refresh(): void;
  getState(): Pick<PwaState, 'needRefresh' | 'activeWorkout' | 'installing'>;
  subscribe(listener: () => void): () => void;
}

export interface AppRefreshDeps {
  refreshData: () => Promise<DataRefreshOutcome>;
  controller: AppRefreshController;
  schedule?: Schedule;
  downloadTimeoutMs?: number;
}

export interface AppRefreshRunOptions {
  /** Awaited right before a reload-causing apply, with everything known so far. */
  beforeApply?: (result: AppRefreshResult) => void | Promise<void>;
  onDownloading?: () => void;
}

export const createAppRefresh = ({ refreshData, controller, schedule = defaultSchedule, downloadTimeoutMs = DOWNLOAD_WAIT_MS }: AppRefreshDeps) => {
  let inflight: Promise<AppRefreshResult> | null = null;

  const waitForDownload = (): Promise<'ready' | 'check-failed' | 'downloading'> => new Promise((resolve) => {
    let done = false;
    let unsubscribe = () => {};
    let cancel = () => {};
    const finish = (outcome: 'ready' | 'check-failed' | 'downloading') => {
      if (done) return;
      done = true;
      unsubscribe();
      cancel();
      resolve(outcome);
    };
    const inspect = () => {
      const state = controller.getState();
      if (state.needRefresh) finish('ready');
      else if (!state.installing) finish('check-failed');
    };
    unsubscribe = controller.subscribe(inspect);
    cancel = schedule(() => finish('downloading'), downloadTimeoutMs);
    inspect(); // Covers a transition between the check and subscribing.
  });

  const execute = async (options: AppRefreshRunOptions): Promise<AppRefreshResult> => {
    const [data, check] = await Promise.all([
      refreshData().catch((): DataRefreshOutcome => ({ kind: 'error' })),
      controller.checkForUpdate({ force: true }),
    ]);

    // A version may already have been waiting (the banner), or may have just been found by the check.
    controller.refresh();
    let state = controller.getState();
    if (!state.needRefresh && (check === 'installing' || state.installing)) {
      options.onDownloading?.();
      const outcome = await waitForDownload();
      if (outcome !== 'ready') return { data, update: outcome };
      controller.refresh(); // A workout may have started while the version was downloading.
      state = controller.getState();
    }
    if (!state.needRefresh) {
      return { data, update: check === 'unavailable' ? 'unavailable' : check === 'failed' ? 'check-failed' : 'current' };
    }
    if (state.activeWorkout) return { data, update: 'blocked' };

    await options.beforeApply?.({ data, update: 'applied' });
    try {
      const applied = await controller.applyUpdate();
      // The gate looks again at apply time: a workout started a moment ago still wins.
      if (applied === 'blocked') return { data, update: 'blocked' };
      if (applied === 'nothing-to-apply') return { data, update: 'apply-failed' };
      return { data, update: 'applied' };
    } catch {
      return { data, update: 'apply-failed' };
    }
  };

  return {
    run: (options: AppRefreshRunOptions = {}): Promise<AppRefreshResult> => {
      if (inflight) return inflight;
      inflight = execute(options).finally(() => {
        inflight = null;
      });
      return inflight;
    },
    isRunning: () => inflight !== null,
  };
};

export type AppRefresh = ReturnType<typeof createAppRefresh>;
