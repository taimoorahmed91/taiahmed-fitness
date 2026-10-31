// Service-worker policy: the small, pure decisions around registering and updating.
// No browser globals are touched here (everything is passed in), so it is all unit tested.
//
// ===========================================================================
// SAFETY MODEL (read this before changing anything in src/pwa or vite.config.ts)
//
// 1. The service worker only precaches the app shell (JS, CSS, HTML, icons, fonts)
//    and runtime-caches Google Fonts. It NEVER caches Supabase, edge functions or any API
//    response: those hosts are routed NetworkOnly in the generated worker (see vite.config.ts).
//    Offline data (templates, last sessions) lives in localStorage instead
//    (src/lib/workoutOfflineCache.ts) where the app, not the worker, controls it.
//
// 2. Updates use the PROMPT strategy. A new worker installs and then WAITS. Nothing skips
//    waiting or reloads the page by itself. A reload happens only when something calls
//    applyUpdate(), and never while a workout is in progress (ACTIVE_WORKOUT_KEY exists)
//    unless the caller explicitly allows it.
//
// 3. KILL SWITCH / RECOVERY if a bad worker ever ships:
//      open  https://<app>/?sw=off   -> unregisters every worker, deletes every cache, remembers
//                                       the choice (localStorage SW_DISABLED_KEY) and reloads once
//                                       without a worker. The app then runs straight from the network.
//      open  https://<app>/?sw=on    -> forgets the choice; the worker registers again next load.
//    It is implemented THREE times so one broken layer cannot lock you out:
//      a) inline <script> in index.html (runs before any bundle, so it works even if the JS is broken),
//      b) public/sw-recovery.js, imported INSIDE the worker: answers a ?sw=off navigation itself,
//         even when the cached index.html is an old one without (a),
//      c) register.ts, which honours the saved choice and skips registration.
//    The worker can also be told to remove itself: postMessage({ type: 'FITTRACK_SW_SELF_DESTRUCT' }).
//    Last resort for users: browser settings -> site data -> clear for this site.
// ===========================================================================

/** The stored in-progress workout. Presence of this key means "do not interrupt". */
export const ACTIVE_WORKOUT_KEY = 'fittrack-active-workout';
/** Set by ?sw=off, cleared by ?sw=on. Must match the inline script in index.html and public/sw-recovery.js. */
export const SW_DISABLED_KEY = 'fittrack:v1:sw-disabled';
export const SW_PARAM = 'sw';
export const SW_SELF_DESTRUCT_MESSAGE = 'FITTRACK_SW_SELF_DESTRUCT';

interface ReadableStorage {
  getItem(key: string): string | null;
}

/** True while a workout is saved on this device. Any non-empty value counts, even if it looks corrupt: never risk it. */
export const hasActiveWorkout = (storage: ReadableStorage | null): boolean => {
  if (!storage) return false;
  try {
    const raw = storage.getItem(ACTIVE_WORKOUT_KEY);
    return raw !== null && raw !== '';
  } catch {
    return false;
  }
};

export type KillSwitchAction = 'disable' | 'enable' | 'none';

export interface KillSwitchDecision {
  /** What the URL asked for. */
  action: KillSwitchAction;
  /** Should the worker stay off for this load (asked now, or remembered)? */
  disabled: boolean;
  /** The URL search string without the sw param (keeps every other parameter). */
  cleanSearch: string;
}

export const resolveKillSwitch = (search: string, storage: ReadableStorage | null): KillSwitchDecision => {
  const params = new URLSearchParams(search);
  const asked = params.get(SW_PARAM);
  const action: KillSwitchAction = asked === 'off' ? 'disable' : asked === 'on' ? 'enable' : 'none';
  params.delete(SW_PARAM);
  const rest = params.toString();
  let remembered = false;
  try {
    remembered = storage?.getItem(SW_DISABLED_KEY) === '1';
  } catch {
    remembered = false;
  }
  return {
    action,
    disabled: action === 'disable' || (action === 'none' && remembered),
    cleanSearch: rest ? `?${rest}` : '',
  };
};

export interface RegisterContext {
  dev: boolean;
  hasServiceWorkerApi: boolean;
  disabled: boolean;
}

/** Register the worker only in production builds, in browsers that support it, and when not switched off. */
export const shouldRegister = (ctx: RegisterContext): boolean => !ctx.dev && ctx.hasServiceWorkerApi && !ctx.disabled;

// --- Update gating ---------------------------------------------------------

export interface UpdateGateInput {
  /** A new version is installed and waiting. */
  needRefresh: boolean;
  /** A workout is saved on this device. */
  activeWorkout: boolean;
}

export type UpdateStatus = 'none' | 'ready' | 'blocked-by-workout';

/**
 * What a UI should show: nothing, "Update ready", or "Update ready — finish your workout first".
 * A waiting update is never applied by itself in any of these states.
 */
export const updateStatus = ({ needRefresh, activeWorkout }: UpdateGateInput): UpdateStatus =>
  !needRefresh ? 'none' : activeWorkout ? 'blocked-by-workout' : 'ready';

export interface ApplyOptions {
  /** The person explicitly chose to update now even though a workout is saved (it is kept and restored). */
  allowDuringWorkout?: boolean;
}

export type ApplyDecision = 'apply' | 'blocked' | 'nothing-to-apply';

/** Whether an explicit applyUpdate() call may proceed. This is the ONLY path that reloads the page. */
export const decideApply = (input: UpdateGateInput, options: ApplyOptions = {}): ApplyDecision => {
  if (!input.needRefresh) return 'nothing-to-apply';
  if (input.activeWorkout && !options.allowDuringWorkout) return 'blocked';
  return 'apply';
};
