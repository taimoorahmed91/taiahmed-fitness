// Service-worker registration entry. Loaded by a <script type="module"> in index.html, so the app
// (main.tsx / App.tsx) needs no changes. Safety model and the ?sw=off kill switch: see ./swPolicy.ts.
import { registerSW } from 'virtual:pwa-register';
import { defaultStorage } from '../lib/workoutOfflineCache';
import { getPwaController } from './pwaController';
import { resolveKillSwitch, shouldRegister, SW_DISABLED_KEY } from './swPolicy';
import { startThemeColorSync } from './themeColor';
import { checkRegistrationForUpdate } from './updateCheck';

const CHECK_EVERY_MS = 60 * 60 * 1000; // hourly
const MIN_CHECK_GAP_MS = 5 * 60 * 1000; // never check more than every 5 minutes

/** Unregisters every worker and deletes every cache of this origin. Resolves true if anything was removed. */
const removeEverything = async (): Promise<boolean> => {
  let removed = false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    removed = removed || regs.length > 0;
  } catch {
    /* ignore */
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      removed = removed || keys.length > 0;
    }
  } catch {
    /* ignore */
  }
  return removed;
};

const start = () => {
  const controller = getPwaController();
  const storage = defaultStorage();
  const hasApi = 'serviceWorker' in navigator;
  controller.setSupported(hasApi);

  startThemeColorSync();

  const decision = resolveKillSwitch(location.search, storage);
  // The inline script in index.html normally handled ?sw=on/off already; this is the second layer.
  try {
    if (decision.action === 'disable') storage?.setItem(SW_DISABLED_KEY, '1');
    if (decision.action === 'enable') storage?.removeItem(SW_DISABLED_KEY);
  } catch {
    /* storage blocked */
  }

  const dev = import.meta.env.DEV;
  if (!shouldRegister({ dev, hasServiceWorkerApi: hasApi, disabled: decision.disabled })) {
    controller.markDisabled(true);
    // Switched off: make sure nothing from an earlier install keeps serving this page.
    if (hasApi && !dev && decision.disabled) {
      const wasControlled = !!navigator.serviceWorker.controller;
      void removeEverything().then((removed) => {
        if (removed && wasControlled) location.reload();
      });
    }
    return;
  }

  let lastCheck = 0;
  let registration: ServiceWorkerRegistration | undefined;

  // The one way this page looks for a new version. Looking never applies it: the prompt strategy keeps a
  // found version waiting, and applyUpdate() (active-workout gated) is the only thing that activates it.
  // Automatic checks keep the 5 minute gap and stay quiet offline; an explicit one (the account menu's
  // "Refresh app & data") skips the gap and reports a real failure instead of silently doing nothing.
  // It only calls registration.update(): nothing is unregistered and no cache is touched.
  controller.setChecker(async ({ force }) => {
    if (!registration) throw new Error('No service worker is registered yet.');
    if (!navigator.onLine) {
      if (force) throw new Error('Offline');
      return 'skipped';
    }
    if (!force && Date.now() - lastCheck < MIN_CHECK_GAP_MS) return 'skipped';
    lastCheck = Date.now();
    await checkRegistrationForUpdate(registration, { onWaiting: () => controller.markNeedRefresh(true) });
    return 'checked';
  });
  const checkForUpdate = () => { void controller.checkForUpdate(); };

  const begin = () => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => controller.markNeedRefresh(true),
      onOfflineReady: () => controller.markOfflineReady(true),
      onRegisteredSW: (_url, reg) => {
        registration = reg;
        controller.markRegistered(!!reg);
        controller.markError(null);
        if (reg) window.setInterval(checkForUpdate, CHECK_EVERY_MS);
      },
      onRegisterError: (error) => {
        controller.markError(error instanceof Error ? error.message : String(error));
      },
    });
    controller.setUpdater(updateSW);
  };
  begin();

  // Durable: when the page comes back (or the network returns) look for updates, and if the browser
  // dropped the registration (storage eviction), register again once.
  let reRegistering = false;
  const onResume = async () => {
    if (document.hidden) return;
    checkForUpdate();
    if (reRegistering) return;
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      if (!existing && !resolveKillSwitch('', storage).disabled) {
        reRegistering = true;
        controller.markRegistered(false);
        begin();
        window.setTimeout(() => { reRegistering = false; }, 30_000);
      }
    } catch {
      /* ignore */
    }
  };
  document.addEventListener('visibilitychange', onResume);
  window.addEventListener('online', onResume);
};

try {
  start();
} catch (error) {
  // Registration problems must never break the app.
  console.error('Service worker setup failed:', error);
}
