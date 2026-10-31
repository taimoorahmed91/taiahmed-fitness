import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Mounted check of the account menu's "Refresh app & data": what the person sees and which calls happen.
// The update controller is the REAL one (seeded where getPwaController() looks), with a fake browser check
// and a fake "apply" so no page ever reloads. caches / serviceWorker are spies: nothing may be touched.
// Run through tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/accountMenuRefresh.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

type Toast = { kind: string; message: string; opts?: { id?: string; description?: string } };
const toasts: Toast[] = [];
const record = (kind: string) => (message: string, opts?: Toast['opts']) => { toasts.push({ kind, message, opts }); return opts?.id ?? 'tid'; };
mock.module('sonner', () => ({
  toast: Object.assign(record('default'), { loading: record('loading'), info: record('info'), success: record('success'), warning: record('warning'), error: record('error') }),
}));
mock.module('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), auth: {}, functions: { invoke: async () => ({}) } } }));
mock.module('@/contexts/UserContext', () => ({
  useUser: () => ({ user: { id: 'u', email: 'tai@example.com', user_metadata: { full_name: 'Tai' } }, logout: async () => {} }),
}));

describe('mounted: Refresh app & data', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rig: any;

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    act = React.act;
  });
  after(() => env?.window.close());

  beforeEach(async () => {
    toasts.length = 0;
    env.window.localStorage.clear();
    const { createUpdateController } = await import('../../src/pwa/updateController');
    const controller = createUpdateController({ storage: env.window.localStorage });
    const calls = { check: [] as boolean[], apply: [] as (boolean | undefined)[], data: 0, cachesTouched: 0, swTouched: 0 };
    rig = { controller, calls, onCheck: async () => 'checked' as const, data: async () => ({ outcome: 'success', total: 2, failed: 0, startedAt: 1, finishedAt: 2 }), gate: null as null | Promise<void> };
    controller.setUpdater(async (reload: boolean) => { calls.apply.push(reload); });
    controller.setChecker(async ({ force }: { force: boolean }) => { calls.check.push(force); return rig.onCheck(controller); });
    (globalThis as Record<string, unknown>).__fittrackPwaController = controller;
    // Anything destructive would have to go through these.
    (globalThis as Record<string, unknown>).caches = { keys: async () => { calls.cachesTouched++; return []; }, delete: async () => { calls.cachesTouched++; return true; } };
    Object.defineProperty(env.window.navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: async () => { calls.swTouched++; return []; }, getRegistration: async () => { calls.swTouched++; } } });
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });

  const doc = () => env.window.document as Document;
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });

  const mountMenu = async () => {
    const { AccountMenu } = await import('../../src/components/layout/AccountMenu');
    const { GlobalRefreshContext } = await import('../../src/app/globalRefreshContext');
    const { EMPTY_GLOBAL_SNAPSHOT } = await import('../../src/app/globalRefresh');
    const globalRefresh = {
      run: async () => { rig.calls.data++; if (rig.gate) await rig.gate; return rig.data(); },
      registerTask: () => () => {}, hasWork: () => true, getSnapshot: () => EMPTY_GLOBAL_SNAPSHOT, subscribe: () => () => {},
    };
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, React.createElement(GlobalRefreshContext.Provider, { value: globalRefresh }, React.createElement(AccountMenu)))));
  };
  const openMenu = async () => {
    if (doc().querySelector('[role="menu"]')) return; // already open (a disabled item keeps the menu open)
    const trigger = doc().querySelector('button[aria-label^="Account menu"]') as HTMLElement;
    await act(async () => { trigger.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await flush(10);
  };
  const item = () => [...doc().querySelectorAll('[role="menuitem"]')].find((e) => /Refresh|Refreshing/.test(e.textContent ?? '')) as HTMLElement | undefined;
  const tap = async () => { await openMenu(); await act(async () => click(env.window, item()!)); await flush(20); };
  const last = () => toasts[toasts.length - 1];
  const untouched = () => { assert.equal(rig.calls.cachesTouched, 0, 'no cache was read or deleted'); assert.equal(rig.calls.swTouched, 0, 'the service worker registration was not touched'); };

  test('the menu item says "Refresh app & data" (never the old wording) with a hidden icon', async () => {
    await mountMenu();
    await openMenu();
    const el = item()!;
    assert.equal(el.textContent, 'Refresh app & data');
    assert.equal(el.querySelector('svg')?.getAttribute('aria-hidden'), 'true');
    assert.equal(el.getAttribute('aria-disabled'), null);
    assert.equal(/Refresh data/.test(doc().body.textContent ?? ''), false);
  });

  test('data ok + no update: one forced check, no apply, "latest version" and no claim of a change', async () => {
    await mountMenu();
    await tap();
    assert.deepEqual(rig.calls.check, [true]);
    assert.equal(rig.calls.data, 1);
    assert.deepEqual(rig.calls.apply, []);
    assert.equal(toasts[0].kind, 'loading');
    assert.equal(last().kind, 'success');
    assert.equal(last().message, 'Data refreshed.');
    assert.match(last().opts?.description ?? '', /latest version/);
    assert.equal(last().opts?.id, 'tid', 'the loading toast (id from toast.loading) is replaced, not stacked');
    untouched();
  });

  test('update found, no workout: pre-reload wording first, then the gated apply (reload requested once)', async () => {
    rig.onCheck = async (c: { markNeedRefresh: (v: boolean) => void }) => { c.markNeedRefresh(true); return 'checked'; };
    await mountMenu();
    await tap();
    assert.deepEqual(rig.calls.apply, [true]);
    const starting = toasts.find((t) => t.message === 'Installing the new version…')!;
    assert.ok(starting, 'said so before reloading');
    assert.equal(starting.kind, 'info');
    assert.match(starting.opts?.description ?? '', /reload once/);
    assert.equal(toasts.some((t) => t.kind === 'success'), false, 'no success claim');
    untouched();
  });

  test('active workout: no reload, "ready and will wait" toast, draft preserved', async () => {
    env.window.localStorage.setItem('fittrack-active-workout', '{"templateId":"t","sets":[1,2,3]}');
    rig.onCheck = async (c: { markNeedRefresh: (v: boolean) => void }) => { c.markNeedRefresh(true); return 'checked'; };
    await mountMenu();
    await tap();
    assert.deepEqual(rig.calls.apply, []);
    assert.equal(last().kind, 'info');
    assert.match(last().message, /New version ready/);
    assert.match(last().opts?.description ?? '', /workout is kept/);
    assert.equal(env.window.localStorage.getItem('fittrack-active-workout'), '{"templateId":"t","sets":[1,2,3]}');
    untouched();
  });

  test('update check error: data still refreshed, and the toast keeps the two outcomes apart', async () => {
    rig.onCheck = async () => { throw new Error('offline'); };
    await mountMenu();
    await tap();
    assert.equal(rig.calls.data, 1);
    assert.equal(last().kind, 'warning');
    assert.equal(last().message, 'Data refreshed.');
    assert.match(last().opts?.description ?? '', /Couldn't check for a new version/);
    untouched();
  });

  test('data failure + no update: an error about the data, app reported separately', async () => {
    rig.data = async () => ({ outcome: 'failure', total: 2, failed: 2, startedAt: 1, finishedAt: 2 });
    await mountMenu();
    await tap();
    assert.equal(last().kind, 'error');
    assert.equal(last().message, "Couldn't refresh your data.");
    assert.match(last().opts?.description ?? '', /latest version/);
  });

  test('repeat taps while running: disabled + aria-busy + busy label, one data refresh and one check; usable again afterwards', async () => {
    let release: () => void = () => {};
    rig.gate = new Promise<void>((resolve) => { release = resolve; });
    await mountMenu();
    await tap();
    assert.equal(rig.calls.data, 1, 'first tap started the run');
    await openMenu();
    const busy = item()!;
    assert.equal(busy.textContent, 'Refreshing app & data…');
    assert.equal(busy.getAttribute('aria-disabled'), 'true');
    assert.equal(busy.getAttribute('aria-busy'), 'true');
    assert.match(busy.querySelector('svg')?.getAttribute('class') ?? '', /animate-spin motion-reduce:animate-none/);
    await act(async () => click(env.window, busy));
    await flush(10);
    assert.equal(rig.calls.data, 1, 'no second data refresh');
    assert.equal(rig.calls.check.length, 1, 'no second check');
    release();
    await flush(30);
    await openMenu();
    assert.equal(item()!.textContent, 'Refresh app & data');
    assert.equal(item()!.getAttribute('aria-disabled'), null);
  });
});
