import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppRefresh, type DataRefreshOutcome } from '../src/pwa/appRefresh';
import { createUpdateController } from '../src/pwa/updateController';
import { checkRegistrationForUpdate, type RegistrationLike, type Schedule, type WorkerLike } from '../src/pwa/updateCheck';
import { ACTIVE_WORKOUT_KEY } from '../src/pwa/swPolicy';
import { describeAppRefresh, describeUpdateStarting, REFRESH_ACTION_LABEL } from '../src/components/pwa/appRefreshCopy';
import type { GlobalRefreshResult } from '../src/app/globalRefresh';

// "Refresh app & data": data refresh + a forced look for a new version + the gated apply. Everything is
// driven through the REAL update controller with fakes for storage, the checker, the updater and timers.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const store = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null), set: (k: string, v: string) => m.set(k, v), has: (k: string) => m.has(k) };
};

const result = (outcome: GlobalRefreshResult['outcome'], total = 3, failed = 0): GlobalRefreshResult => ({ outcome, total, failed, startedAt: 1, finishedAt: 2 });
const ok = (outcome: GlobalRefreshResult['outcome'] = 'success', total = 3, failed = 0): DataRefreshOutcome => ({ kind: 'result', result: result(outcome, total, failed) });

/** A manual timer: nothing fires until the test says so, so "bounded" is provable without waiting. */
const manualSchedule = () => {
  const pending: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const schedule: Schedule = (fn, ms) => {
    const entry = { fn, ms, cancelled: false };
    pending.push(entry);
    return () => { entry.cancelled = true; };
  };
  return { schedule, fire: () => pending.filter((p) => !p.cancelled).forEach((p) => { p.cancelled = true; p.fn(); }), pending };
};

interface Rig {
  controller: ReturnType<typeof createUpdateController>;
  storage: ReturnType<typeof store>;
  calls: { data: number; check: { force: boolean }[]; apply: (boolean | undefined)[]; order: string[] };
  timer: ReturnType<typeof manualSchedule>;
}

/** A controller whose "browser check" runs `onCheck` (which may mark a waiting version, throw, or never end). */
const rig = (opts: { workout?: boolean; onCheck?: (c: Rig['controller']) => Promise<'checked' | 'skipped'> | 'checked' | 'skipped'; noChecker?: boolean; waiting?: boolean } = {}): Rig => {
  const storage = store(opts.workout ? { [ACTIVE_WORKOUT_KEY]: '{"templateId":"t"}' } : {});
  const timer = manualSchedule();
  const controller = createUpdateController({ storage, schedule: timer.schedule, checkTimeoutMs: 10_000, now: () => 1234 });
  const calls: Rig['calls'] = { data: 0, check: [], apply: [], order: [] };
  controller.setUpdater(async (reload) => { calls.apply.push(reload); calls.order.push('apply'); });
  if (opts.waiting) controller.markNeedRefresh(true);
  if (!opts.noChecker) {
    controller.setChecker(async ({ force }) => {
      calls.check.push({ force });
      return (await (opts.onCheck ? opts.onCheck(controller) : 'checked')) as 'checked' | 'skipped';
    });
  }
  return { controller, storage, calls, timer };
};

const run = (r: Rig, data: () => Promise<DataRefreshOutcome> | DataRefreshOutcome = () => ok(), beforeApply?: () => void) => {
  const app = createAppRefresh({ controller: r.controller, refreshData: async () => { r.calls.data++; return data(); } });
  return { app, promise: app.run({ beforeApply: () => { r.calls.order.push('beforeApply'); beforeApply?.(); } }) };
};

describe('data outcome with no update waiting', () => {
  test('data success + checked + nothing new: reports the data truthfully and says the app is current, not updated', async () => {
    const r = rig();
    const out = await run(r).promise;
    assert.deepEqual(out, { data: ok(), update: 'current' });
    assert.deepEqual(r.calls.apply, [], 'nothing applied');
    assert.deepEqual(r.calls.check, [{ force: true }], 'the explicit action forces the check');
    const msg = describeAppRefresh(out);
    assert.equal(msg.kind, 'success');
    assert.equal(msg.message, 'Data refreshed.');
    assert.match(msg.description ?? '', /on the latest version/);
    assert.equal(/updated|installing|new version (is )?(ready|installed)/i.test(`${msg.message} ${msg.description}`), false, 'never claims a version change');
    assert.equal(r.controller.getState().lastCheckedAt, 1234, 'the check is recorded');
  });

  test('data failure + checked + nothing new: error headline about the data, app still reported as current', async () => {
    const r = rig();
    const out = await run(r, () => ok('failure', 3, 3)).promise;
    const msg = describeAppRefresh(out);
    assert.equal(out.update, 'current');
    assert.equal(msg.kind, 'error');
    assert.equal(msg.message, "Couldn't refresh your data.");
    assert.match(msg.description ?? '', /latest version/);
  });

  test('a data refresh that throws is an error, and the update check still ran', async () => {
    const r = rig();
    const out = await run(r, () => Promise.reject(new Error('boom'))).promise;
    assert.deepEqual(out.data, { kind: 'error' });
    assert.equal(r.calls.check.length, 1);
    assert.equal(describeAppRefresh(out).kind, 'error');
  });

  test('partial data failure keeps its counts', async () => {
    const out = await run(rig(), () => ok('partial', 4, 1)).promise;
    const msg = describeAppRefresh(out);
    assert.equal(msg.kind, 'warning');
    assert.match(msg.message, /1 of 4 sources failed/);
  });

  test('nothing to refresh + current is an info message, not a success', async () => {
    const msg = describeAppRefresh(await run(rig(), () => ok('nothing-to-refresh', 0, 0)).promise);
    assert.equal(msg.kind, 'info');
    assert.match(msg.message, /Nothing to refresh/);
  });

  test('no worker here (dev, ?sw=off, unsupported): unavailable, and the copy says only data was refreshed', async () => {
    const r = rig({ noChecker: true });
    const out = await run(r).promise;
    assert.equal(out.update, 'unavailable');
    const msg = describeAppRefresh(out);
    assert.equal(msg.kind, 'success');
    assert.match(msg.description ?? '', /only your data was refreshed/);
    assert.equal(/latest version/.test(msg.description ?? ''), false, 'no false "app is current"');
  });
});

describe('update discovered', () => {
  const found = (c: Rig['controller']) => { c.markNeedRefresh(true); return 'checked' as const; };

  test('applied through applyUpdate(true); the pre-reload message is delivered BEFORE the reload-causing call', async () => {
    const r = rig({ onCheck: found });
    const out = await run(r).promise;
    assert.equal(out.update, 'applied');
    assert.deepEqual(r.calls.apply, [true]);
    assert.deepEqual(r.calls.order, ['beforeApply', 'apply']);
    const msg = describeUpdateStarting(out.data);
    assert.equal(msg.message, 'Installing the new version…');
    assert.match(msg.description ?? '', /reload once/);
    assert.match(msg.description ?? '', /data and any saved workout are kept/);
    assert.match(msg.description ?? '', /Your data is refreshed/);
  });

  test('a version already waiting (the banner) is applied by the explicit action too, even if the check itself failed', async () => {
    const r = rig({ waiting: true, onCheck: () => { throw new Error('offline'); } });
    const out = await run(r).promise;
    assert.equal(out.update, 'applied');
    assert.deepEqual(r.calls.apply, [true]);
  });

  test('active workout: nothing reloads, the update waits, and the saved draft is untouched', async () => {
    const r = rig({ workout: true, onCheck: found });
    const out = await run(r).promise;
    assert.equal(out.update, 'blocked');
    assert.deepEqual(r.calls.apply, [], 'applyUpdate is never even called');
    assert.deepEqual(r.calls.order, [], 'no pre-reload message either');
    assert.equal(r.storage.has(ACTIVE_WORKOUT_KEY), true);
    assert.equal(r.storage.getItem(ACTIVE_WORKOUT_KEY), '{"templateId":"t"}');
    const msg = describeAppRefresh(out);
    assert.equal(msg.kind, 'info');
    assert.match(msg.message, /New version ready/);
    assert.match(msg.message, /wait for your workout/);
    assert.match(msg.description ?? '', /Your data is refreshed/);
    assert.match(msg.description ?? '', /workout is kept/);
    assert.equal(/installing/i.test(`${msg.message}${msg.description}`), false);
  });

  test('a workout that starts during the check still blocks (storage is re-read after the check)', async () => {
    const r = rig({ onCheck: (c) => { found(c); r.storage.set(ACTIVE_WORKOUT_KEY, '{"templateId":"t"}'); return 'checked'; } });
    const out = await run(r).promise;
    assert.equal(out.update, 'blocked');
    assert.deepEqual(r.calls.apply, []);
  });

  test('the gate is checked again at apply time: a workout started during beforeApply wins', async () => {
    const r = rig({ onCheck: found });
    const out = await run(r, undefined, () => r.storage.set(ACTIVE_WORKOUT_KEY, '{"templateId":"t"}')).promise;
    assert.equal(out.update, 'blocked');
    assert.deepEqual(r.calls.apply, [], 'the controller refused');
  });

  test('data failure + update found: the data failure leads, the update fact follows', async () => {
    const out = await run(rig({ onCheck: found }), () => ok('failure', 2, 2)).promise;
    const msg = describeAppRefresh(out);
    assert.equal(out.update, 'applied');
    assert.equal(msg.kind, 'error');
    assert.equal(msg.message, "Couldn't refresh your data.");
    assert.match(msg.description ?? '', /reload once/);
  });

  test('an updater that throws is reported as an install problem, never as success', async () => {
    const r = rig({ onCheck: found });
    r.controller.setUpdater(async () => { throw new Error('nope'); });
    const out = await run(r).promise;
    assert.equal(out.update, 'apply-failed');
    const msg = describeAppRefresh(out);
    assert.equal(msg.kind, 'warning');
    assert.match(msg.description ?? '', /couldn't be installed/);
  });
});

describe('update check problems never hide the data result', () => {
  test('check error + data success: both outcomes, clearly separate', async () => {
    const r = rig({ onCheck: () => { throw new Error('network'); } });
    const out = await run(r).promise;
    assert.deepEqual(out, { data: ok(), update: 'check-failed' });
    assert.equal(r.calls.data, 1, 'data still refreshed');
    const msg = describeAppRefresh(out);
    assert.equal(msg.kind, 'warning');
    assert.equal(msg.message, 'Data refreshed.');
    assert.match(msg.description ?? '', /Couldn't check for a new version/);
    assert.equal(/latest version/.test(msg.description ?? ''), false);
    assert.deepEqual(r.calls.apply, []);
  });

  test('a check that never finishes is cut off by the time limit (deterministic, no real waiting)', async () => {
    const r = rig({ onCheck: () => new Promise<'checked'>(() => {}) });
    const { promise } = run(r);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5)); // let the data side finish; the check is still pending
    r.timer.fire();
    const out = await promise;
    assert.equal(out.update, 'check-failed');
    assert.equal(out.data.kind, 'result');
    assert.equal(r.timer.pending.some((p) => p.ms === 10_000), true, 'the limit is the configured one');
  });
});

describe('single flight', () => {
  test('repeat calls while running share one run: one data refresh, one check', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const r = rig();
    const app = createAppRefresh({ controller: r.controller, refreshData: async () => { r.calls.data++; await gate; return ok(); } });
    const a = app.run();
    const b = app.run();
    const c = app.run();
    assert.equal(a, b);
    assert.equal(b, c);
    assert.equal(app.isRunning(), true);
    release();
    await a;
    assert.equal(r.calls.data, 1);
    assert.equal(r.calls.check.length, 1);
    assert.equal(app.isRunning(), false);
    await app.run();
    assert.equal(r.calls.data, 2, 'a later, separate action runs again');
  });

  test('the controller check is single flight too: concurrent callers share one browser check', async () => {
    let started = 0;
    let finish: () => void = () => {};
    const r = rig({ onCheck: () => { started++; return new Promise<'checked'>((resolve) => { finish = () => resolve('checked'); }); } });
    const a = r.controller.checkForUpdate({ force: true });
    const b = r.controller.checkForUpdate();
    assert.equal(a, b);
    await new Promise((resolve) => setTimeout(resolve, 0)); // the checker starts on the next tick
    finish();
    assert.equal(await a, 'checked');
    assert.equal(started, 1);
  });
});

describe('UpdateController.checkForUpdate', () => {
  test('unavailable without a checker; force is passed through; skipped does not record a check', async () => {
    const c = createUpdateController({ storage: store(), now: () => 99 });
    assert.equal(await c.checkForUpdate({ force: true }), 'unavailable');
    const seen: boolean[] = [];
    c.setChecker(async ({ force }) => { seen.push(force); return force ? 'checked' : 'skipped'; });
    assert.equal(await c.checkForUpdate(), 'skipped');
    assert.equal(c.getState().lastCheckedAt, null);
    assert.equal(await c.checkForUpdate({ force: true }), 'checked');
    assert.equal(c.getState().lastCheckedAt, 99);
    assert.deepEqual(seen, [false, true]);
  });
  test('a throwing checker is "failed", never a rejection, and never applies anything', async () => {
    const calls: unknown[] = [];
    const c = createUpdateController({ storage: store() });
    c.setUpdater(async () => { calls.push(1); });
    c.setChecker(async () => { throw new Error('x'); });
    assert.equal(await c.checkForUpdate({ force: true }), 'failed');
    assert.deepEqual(calls, []);
  });
});

describe('checkRegistrationForUpdate (the only code that touches the registration)', () => {
  const worker = (state: string) => {
    const listeners = new Set<() => void>();
    const w = { state, addEventListener: (_t: 'statechange', l: () => void) => { listeners.add(l); }, removeEventListener: (_t: 'statechange', l: () => void) => { listeners.delete(l); }, move: (next: string) => { w.state = next; [...listeners].forEach((l) => l()); }, listeners } satisfies WorkerLike & { move(s: string): void; listeners: Set<() => void> };
    return w;
  };
  const registration = (over: Partial<RegistrationLike> = {}) => {
    const spy = { update: 0, unregister: 0 };
    const reg = { update: async () => { spy.update++; }, installing: null, waiting: null, unregister: () => { spy.unregister++; }, ...over } as RegistrationLike & { unregister(): void };
    return { reg, spy };
  };

  test('nothing new: update() is called once, nothing waits, nothing is unregistered', async () => {
    const { reg, spy } = registration();
    let waiting = 0;
    await checkRegistrationForUpdate(reg, { onWaiting: () => waiting++ });
    assert.deepEqual(spy, { update: 1, unregister: 0 });
    assert.equal(waiting, 0);
  });
  test('already waiting: reported immediately', async () => {
    const { reg } = registration({ waiting: worker('installed') });
    let waiting = 0;
    await checkRegistrationForUpdate(reg, { onWaiting: () => waiting++ });
    assert.equal(waiting, 1);
  });
  test('installing then installed: waits for it, then reports a waiting version', async () => {
    const installing = worker('installing');
    const { reg } = registration({ installing });
    const timer = manualSchedule();
    let waiting = 0;
    const p = checkRegistrationForUpdate(reg, { onWaiting: () => waiting++, schedule: timer.schedule });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(waiting, 0, 'still installing');
    (reg as { waiting: WorkerLike | null }).waiting = installing;
    installing.move('installed');
    await p;
    assert.equal(waiting, 1);
    assert.equal(installing.listeners.size, 0, 'listener removed');
    assert.equal(timer.pending.every((x) => x.cancelled), true, 'timer cleaned up');
  });
  test('redundant (install failed): settles without a waiting version', async () => {
    const installing = worker('installing');
    const { reg } = registration({ installing });
    let waiting = 0;
    const p = checkRegistrationForUpdate(reg, { onWaiting: () => waiting++, schedule: manualSchedule().schedule });
    await Promise.resolve(); await Promise.resolve();
    installing.move('redundant');
    await p;
    assert.equal(waiting, 0);
  });
  test('an install that never finishes is bounded by the settle timeout', async () => {
    const installing = worker('installing');
    const { reg } = registration({ installing });
    const timer = manualSchedule();
    let waiting = 0;
    const p = checkRegistrationForUpdate(reg, { onWaiting: () => waiting++, schedule: timer.schedule, settleTimeoutMs: 6000 });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(timer.pending[0].ms, 6000);
    timer.fire();
    await p;
    assert.equal(waiting, 0);
    assert.equal(installing.listeners.size, 0);
  });
  test('update() rejecting (offline / server error) rejects, so the controller reports "failed"', async () => {
    const { reg } = registration({ update: async () => { throw new Error('offline'); } });
    await assert.rejects(checkRegistrationForUpdate(reg, { onWaiting: () => {} }), /offline/);
  });
});

describe('never destructive, never outside the safety gate (source)', () => {
  const FILES = ['src/pwa/appRefresh.ts', 'src/pwa/updateCheck.ts', 'src/pwa/updateController.ts', 'src/components/pwa/appRefreshCopy.ts', 'src/components/layout/AccountMenu.tsx'];
  test('no unregister, no cache deletion, no reload of its own in the explicit refresh path', () => {
    for (const f of FILES) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.equal(/unregister\s*\(|caches\s*\.|getRegistrations|\.reload\s*\(|location\.(href|replace|assign)|skipWaiting|postMessage/.test(src), false, f);
    }
  });
  test('in register.ts the checker wiring only calls update through checkRegistrationForUpdate', () => {
    const src = read('src/pwa/register.ts');
    const wiring = src.slice(src.indexOf('controller.setChecker('), src.indexOf('const begin = () =>'));
    assert.match(wiring, /checkRegistrationForUpdate\(registration/);
    assert.equal(/unregister|caches|removeEverything/.test(wiring), false);
    // ?sw=off stays the only place that removes workers and caches.
    assert.match(src.slice(src.indexOf('decision.disabled'), src.indexOf('return;', src.indexOf('decision.disabled'))), /removeEverything/);
    assert.equal((src.match(/removeEverything\(\)/g) ?? []).length, 1, 'removeEverything has exactly one caller: the kill switch');
  });
  test('force skips only the 5 minute gap (and fails loudly offline); automatic checks keep gap and quiet offline', () => {
    const src = read('src/pwa/register.ts');
    assert.match(src, /if \(!force && Date\.now\(\) - lastCheck < MIN_CHECK_GAP_MS\) return 'skipped'/);
    assert.match(src, /if \(force\) throw new Error\('Offline'\);\s*return 'skipped'/);
    assert.match(src, /const checkForUpdate = \(\) => \{ void controller\.checkForUpdate\(\); \}/);
    assert.match(src, /window\.setInterval\(checkForUpdate, CHECK_EVERY_MS\)/);
  });
  test('the banner, its gating and its words are unchanged: applyUpdate is still the only reload path', () => {
    const src = read('src/pwa/updateController.ts');
    assert.equal((src.match(/updater\(true\)/g) ?? []).length, 1);
    assert.match(read('src/components/pwa/PwaFeedback.tsx'), /applyUpdate\(\)/);
  });
});

describe('AccountMenu wiring (source)', () => {
  const menu = read('src/components/layout/AccountMenu.tsx');
  test('one visible action, renamed, with a busy label; no old wording', () => {
    assert.equal(REFRESH_ACTION_LABEL, 'Refresh app & data');
    assert.match(menu, /REFRESH_ACTION_LABEL/);
    assert.equal(/>Refresh data<|'Refresh data'/.test(menu), false);
  });
  test('data goes through the shell single-flight owner; the app half through createAppRefresh with the pwa controller', () => {
    assert.match(menu, /globalRefresh\.run\(\)/);
    assert.match(menu, /createAppRefresh\(\{[\s\S]*controller: getPwaController\(\)/);
    assert.match(menu, /beforeApply/);
  });
  test('repeat taps: a ref guard, a disabled + aria-busy item, a spinner that is hidden from screen readers and stops for reduced motion', () => {
    assert.match(menu, /if \(runningRef\.current\) return;/);
    assert.match(menu, /disabled=\{busy\} aria-busy=\{busy\}/);
    assert.match(menu, /<RefreshCw className=\{`mr-2 h-4 w-4 \$\{busy \? 'animate-spin motion-reduce:animate-none' : ''\}`\} aria-hidden="true" \/>/);
    assert.match(menu, /min-h-10/);
  });
});
