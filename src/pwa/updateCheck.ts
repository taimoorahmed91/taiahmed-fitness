// Looks for a new service-worker version on a registration and waits, for a bounded time, until it is
// either waiting to be applied or clearly not coming. No React, no browser globals (the registration and
// the timer are injected), so the rules are unit tested. It only ever calls registration.update():
// it never unregisters a worker, never touches caches and never activates anything.

export interface WorkerLike {
  state: string;
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
}

export interface RegistrationLike {
  update(): Promise<unknown>;
  installing: WorkerLike | null;
  waiting: WorkerLike | null;
}

/** How long a check waits before reporting that installation is still in progress. */
export const SETTLE_TIMEOUT_MS = 6_000;
/** Hard ceiling for one whole explicit check (network fetch of the worker file included). */
export const CHECK_TIMEOUT_MS = 12_000;

export type Schedule = (fn: () => void, ms: number) => () => void;

export const defaultSchedule: Schedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export interface CheckRegistrationOptions {
  /** Called when a new version is waiting (installed, not yet active). Safe to call more than once. */
  onWaiting: () => void;
  onInstalling?: () => void;
  onSettled?: () => void;
  schedule?: Schedule;
  settleTimeoutMs?: number;
}

/**
 * Ask the browser to fetch the worker file now. If that finds a new version, wait (bounded) for it to
 * install. Resolves within `settleTimeoutMs` after update() returned, retaining the worker listener
 * if installation is still in progress. Rejects only if update() itself rejects (offline, server error).
 */
export const checkRegistrationForUpdate = async (reg: RegistrationLike, options: CheckRegistrationOptions): Promise<'waiting' | 'none' | 'installing'> => {
  const schedule = options.schedule ?? defaultSchedule;
  const settleMs = options.settleTimeoutMs ?? SETTLE_TIMEOUT_MS;
  await reg.update();
  if (reg.waiting) {
    options.onWaiting();
    return 'waiting';
  }
  const installing = reg.installing;
  if (!installing || installing.state === 'redundant') return 'none';
  return new Promise<'waiting' | 'none' | 'installing'>((resolve) => {
    let cancel: () => void = () => {};
    const finish = () => {
      cancel();
      installing.removeEventListener('statechange', onChange);
      options.onSettled?.();
      resolve(reg.waiting ? 'waiting' : 'none');
    };
    const onChange = () => {
      if (installing.state === 'installed' || installing.state === 'activated') {
        if (reg.waiting) options.onWaiting();
        finish();
      } else if (installing.state === 'redundant') {
        finish();
      }
    };
    installing.addEventListener('statechange', onChange);
    // The short check ends here, but the worker still owns its listener until installation ends.
    cancel = schedule(() => { cancel(); resolve('installing'); }, settleMs);
    options.onInstalling?.();
    onChange(); // it may already have moved on while we were setting up
  });
};
