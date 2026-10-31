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

/** How long to wait for a freshly found version to finish installing before giving up on "waiting". */
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
  schedule?: Schedule;
  settleTimeoutMs?: number;
}

/**
 * Ask the browser to fetch the worker file now. If that finds a new version, wait (bounded) for it to
 * install. Resolves when the state has settled; it never waits longer than `settleTimeoutMs` after
 * update() returned, and rejects only if update() itself rejects (offline, server error).
 */
export const checkRegistrationForUpdate = async (reg: RegistrationLike, options: CheckRegistrationOptions): Promise<void> => {
  const schedule = options.schedule ?? defaultSchedule;
  const settleMs = options.settleTimeoutMs ?? SETTLE_TIMEOUT_MS;
  await reg.update();
  if (reg.waiting) {
    options.onWaiting();
    return;
  }
  const installing = reg.installing;
  if (!installing || installing.state === 'redundant') return;
  await new Promise<void>((resolve) => {
    let cancel: () => void = () => {};
    const finish = () => {
      cancel();
      installing.removeEventListener('statechange', onChange);
      resolve();
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
    cancel = schedule(finish, settleMs);
    onChange(); // it may already have moved on while we were setting up
  });
};
