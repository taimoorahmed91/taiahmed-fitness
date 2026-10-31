import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIVE_WORKOUT_KEY, decideApply, hasActiveWorkout, resolveKillSwitch, shouldRegister, SW_DISABLED_KEY,
  SW_SELF_DESTRUCT_MESSAGE, updateStatus,
} from '../src/pwa/swPolicy';
import { createUpdateController } from '../src/pwa/updateController';

const store = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    set: (k: string, v: string) => m.set(k, v),
    remove: (k: string) => m.delete(k),
  };
};

describe('active workout detection', () => {
  test('uses the existing storage key and never changes its shape', () => {
    assert.equal(ACTIVE_WORKOUT_KEY, 'fittrack-active-workout');
    assert.equal(hasActiveWorkout(store()), false);
    assert.equal(hasActiveWorkout(store({ [ACTIVE_WORKOUT_KEY]: '{"templateId":"t"}' })), true);
    assert.equal(hasActiveWorkout(store({ [ACTIVE_WORKOUT_KEY]: '' })), false);
  });

  test('a corrupt saved workout still blocks (never risk it)', () => {
    assert.equal(hasActiveWorkout(store({ [ACTIVE_WORKOUT_KEY]: '{oops' })), true);
  });

  test('unreadable storage means "no workout" rather than a crash', () => {
    assert.equal(hasActiveWorkout({ getItem() { throw new Error('blocked'); } }), false);
    assert.equal(hasActiveWorkout(null), false);
  });
});

describe('update gating', () => {
  test('status shows nothing, ready, or blocked-by-workout', () => {
    assert.equal(updateStatus({ needRefresh: false, activeWorkout: false }), 'none');
    assert.equal(updateStatus({ needRefresh: false, activeWorkout: true }), 'none');
    assert.equal(updateStatus({ needRefresh: true, activeWorkout: false }), 'ready');
    assert.equal(updateStatus({ needRefresh: true, activeWorkout: true }), 'blocked-by-workout');
  });

  test('apply is blocked during a workout unless explicitly allowed', () => {
    assert.equal(decideApply({ needRefresh: true, activeWorkout: true }), 'blocked');
    assert.equal(decideApply({ needRefresh: true, activeWorkout: true }, { allowDuringWorkout: false }), 'blocked');
    assert.equal(decideApply({ needRefresh: true, activeWorkout: true }, { allowDuringWorkout: true }), 'apply');
    assert.equal(decideApply({ needRefresh: true, activeWorkout: false }), 'apply');
    assert.equal(decideApply({ needRefresh: false, activeWorkout: false }), 'nothing-to-apply');
  });
});

describe('update controller', () => {
  test('a waiting update is never applied by itself', async () => {
    const s = store();
    const calls: (boolean | undefined)[] = [];
    const c = createUpdateController({ storage: s });
    c.setUpdater(async (reload) => { calls.push(reload); });
    c.markNeedRefresh(true);
    c.markChecked();
    c.refresh();
    assert.deepEqual(calls, []);
    assert.equal(c.getState().status, 'ready');
  });

  test('applyUpdate reloads only when no workout is saved', async () => {
    const s = store({ [ACTIVE_WORKOUT_KEY]: '{"templateId":"t"}' });
    const calls: (boolean | undefined)[] = [];
    const c = createUpdateController({ storage: s });
    c.setUpdater(async (reload) => { calls.push(reload); });
    c.markNeedRefresh(true);
    assert.equal(c.getState().status, 'blocked-by-workout');
    assert.equal(await c.applyUpdate(), 'blocked');
    assert.deepEqual(calls, []);

    // The workout finishes (key removed): the same call now goes through, with a reload.
    s.remove(ACTIVE_WORKOUT_KEY);
    assert.equal(await c.applyUpdate(), 'applied');
    assert.deepEqual(calls, [true]);
  });

  test('a workout that starts after the prompt appeared still blocks (storage is re-read at apply time)', async () => {
    const s = store();
    const calls: unknown[] = [];
    const c = createUpdateController({ storage: s });
    c.setUpdater(async () => { calls.push(1); });
    c.markNeedRefresh(true);
    assert.equal(c.getState().status, 'ready');
    s.set(ACTIVE_WORKOUT_KEY, '{"templateId":"t"}'); // started in this tab: no storage event fires
    assert.equal(await c.applyUpdate(), 'blocked');
    assert.deepEqual(calls, []);
  });

  test('explicit "update anyway" is possible and is the only override', async () => {
    const s = store({ [ACTIVE_WORKOUT_KEY]: '{"templateId":"t"}' });
    const calls: unknown[] = [];
    const c = createUpdateController({ storage: s });
    c.setUpdater(async () => { calls.push(1); });
    c.markNeedRefresh(true);
    assert.equal(await c.applyUpdate({ allowDuringWorkout: true }), 'applied');
    assert.equal(calls.length, 1);
  });

  test('nothing to apply when no update is waiting or no updater is registered', async () => {
    const c = createUpdateController({ storage: store() });
    assert.equal(await c.applyUpdate(), 'nothing-to-apply');
    c.markNeedRefresh(true);
    assert.equal(await c.applyUpdate(), 'nothing-to-apply'); // no updater yet
  });

  test('snapshots are stable until something changes, and subscribers are notified', () => {
    const s = store();
    const c = createUpdateController({ storage: s });
    const first = c.getState();
    c.refresh();
    assert.equal(c.getState(), first);
    let notified = 0;
    const off = c.subscribe(() => notified++);
    c.markNeedRefresh(true);
    assert.equal(notified, 1);
    assert.notEqual(c.getState(), first);
    s.set(ACTIVE_WORKOUT_KEY, 'x');
    c.refresh();
    assert.equal(notified, 2);
    assert.equal(c.getState().status, 'blocked-by-workout');
    c.refresh();
    assert.equal(notified, 2);
    off();
    c.markOfflineReady();
    assert.equal(notified, 2);
  });

  test('dismissing hides the prompt without applying anything', async () => {
    const calls: unknown[] = [];
    const c = createUpdateController({ storage: store() });
    c.setUpdater(async () => { calls.push(1); });
    c.markNeedRefresh(true);
    c.dismissUpdate();
    assert.equal(c.getState().status, 'none');
    assert.deepEqual(calls, []);
  });
});

describe('kill switch', () => {
  test('?sw=off disables and is stripped from the URL, keeping other parameters', () => {
    const d = resolveKillSwitch('?tab=records&sw=off', store());
    assert.deepEqual(d, { action: 'disable', disabled: true, cleanSearch: '?tab=records' });
    assert.equal(resolveKillSwitch('?sw=off', store()).cleanSearch, '');
  });

  test('the choice is remembered; ?sw=on re-enables', () => {
    const remembered = store({ [SW_DISABLED_KEY]: '1' });
    assert.deepEqual(resolveKillSwitch('', remembered), { action: 'none', disabled: true, cleanSearch: '' });
    assert.deepEqual(resolveKillSwitch('?sw=on', remembered), { action: 'enable', disabled: false, cleanSearch: '' });
    assert.equal(resolveKillSwitch('', store()).disabled, false);
    assert.equal(resolveKillSwitch('?sw=banana', store()).action, 'none');
  });

  test('registration needs production, browser support and no kill switch', () => {
    assert.equal(shouldRegister({ dev: false, hasServiceWorkerApi: true, disabled: false }), true);
    assert.equal(shouldRegister({ dev: true, hasServiceWorkerApi: true, disabled: false }), false);
    assert.equal(shouldRegister({ dev: false, hasServiceWorkerApi: false, disabled: false }), false);
    assert.equal(shouldRegister({ dev: false, hasServiceWorkerApi: true, disabled: true }), false);
  });

  test('the same key and message are used by index.html, the worker recovery script and the policy', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const recovery = readFileSync(new URL('../public/sw-recovery.js', import.meta.url), 'utf8');
    assert.ok(html.includes(`'${SW_DISABLED_KEY}'`));
    assert.ok(recovery.includes(`'${SW_DISABLED_KEY}'`));
    assert.ok(recovery.includes(SW_SELF_DESTRUCT_MESSAGE));
    assert.ok(recovery.includes("'sw') !== 'off'"));
  });
});

describe('build configuration guard', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

  test('prompt strategy: nothing skips waiting or claims clients on its own', () => {
    assert.match(config, /registerType:\s*"prompt"/);
    assert.match(config, /skipWaiting:\s*false/);
    assert.match(config, /clientsClaim:\s*false/);
  });

  test('private-data hosts are NetworkOnly and are listed before any caching rule', () => {
    const neverCacheAt = config.indexOf('neverCache.map');
    const firstCaching = Math.min(...['StaleWhileRevalidate', 'CacheFirst', 'NetworkFirst'].map((h) => config.indexOf(`"${h}"`)).filter((i) => i >= 0));
    assert.ok(neverCacheAt > 0 && neverCacheAt < firstCaching);
    assert.match(config, /supabase\\\.\(co\|in\|net\)/);
    assert.equal(/NetworkFirst/.test(config), false); // no rule that could store an API response
  });

  test('the only runtime caches are Google Fonts', () => {
    const hosts = [...config.matchAll(/urlPattern:\s*\/\^https:\\\/\\\/([a-z\\.]+)\\\//g)].map((m) => m[1].replace(/\\/g, ''));
    assert.deepEqual(hosts.sort(), ['fonts.googleapis.com', 'fonts.gstatic.com']);
  });

  test('the manifest has the install fields, a maskable icon and matching theme colours', () => {
    const m = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
    assert.equal(m.id, '/');
    assert.equal(m.start_url, '/');
    assert.equal(m.scope, '/');
    assert.equal(m.display, 'standalone');
    assert.ok(m.icons.some((i: { purpose: string; sizes: string }) => i.purpose === 'maskable' && i.sizes === '512x512'));
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /name="theme-color" content="#f5f5f5" media="\(prefers-color-scheme: light\)"/);
    assert.match(html, /name="theme-color" content="#171717" media="\(prefers-color-scheme: dark\)"/);
  });
});
