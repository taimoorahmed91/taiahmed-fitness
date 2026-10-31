import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QueryClient } from '@tanstack/react-query';
import {
  INITIAL_SOURCE_STATUS,
  LOADED_SOURCE_STATUS,
  createGlobalRefresh,
  createRefreshSource,
  deriveSourceState,
  type RefreshLoad,
} from '../src/app/globalRefresh';
import { tableView } from '../src/components/feedback/tableView';

const sleep = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

// --- state a hook exposes ---------------------------------------------------

test('deriveSourceState: first load, loaded, stale and failed-first-load are four different answers', () => {
  assert.equal(deriveSourceState(INITIAL_SOURCE_STATUS).phase, 'loading');

  const ready = deriveSourceState(LOADED_SOURCE_STATUS);
  assert.deepEqual(ready, { phase: 'ready', loadFailed: false, refreshFailed: false, error: null });

  const boom = new Error('boom');
  const stale = deriveSourceState({ loaded: true, failed: true, error: boom });
  assert.deepEqual(stale, { phase: 'ready', loadFailed: false, refreshFailed: true, error: boom });

  const failedFirst = deriveSourceState({ loaded: false, failed: true, error: boom });
  assert.deepEqual(failedFirst, { phase: 'error', loadFailed: true, refreshFailed: false, error: boom });
});

test('the derived state works with the shared tableView() pages already use', () => {
  assert.equal(tableView(deriveSourceState(INITIAL_SOURCE_STATUS)), 'loading');
  assert.equal(tableView(deriveSourceState(LOADED_SOURCE_STATUS)), 'ready');
  assert.equal(tableView(deriveSourceState({ loaded: true, failed: true, error: 1 })), 'ready');
  assert.equal(tableView(deriveSourceState({ loaded: false, failed: true, error: 1 })), 'error');
});

// --- createRefreshSource ----------------------------------------------------

test('reload is single flight; a failure rejects reload but never refetch or restart', async () => {
  let calls = 0;
  let fail = false;
  const source = createRefreshSource(() => async () => {
    calls++;
    await sleep();
    if (fail) throw new Error('down');
  });

  const [a, b] = [source.reload(), source.reload()];
  assert.equal(a, b, 'a second caller gets the running load');
  await a;
  assert.equal(calls, 1);

  fail = true;
  await assert.rejects(source.reload(), /down/);
  await source.refetch(); // swallowed: the hook's own state records it
  await source.restart(); // swallowed too
  assert.equal(calls, 4);
});

test('restart makes the running load stale so it cannot commit, and does not join it', async () => {
  const committed: string[] = [];
  let n = 0;
  const load: RefreshLoad = async ({ isStale }) => {
    const mine = `load-${++n}`;
    await sleep(mine === 'load-1' ? 20 : 2);
    if (isStale()) return;
    committed.push(mine);
  };
  const source = createRefreshSource(() => load);
  const first = source.reload();
  await source.restart();
  await first;
  assert.deepEqual(committed, ['load-2']);
});

test('the load function can change every render without changing the returned functions', async () => {
  let current: RefreshLoad = async () => {};
  const source = createRefreshSource(() => current);
  const { reload, refetch, restart } = source;
  let ran = '';
  current = async () => { ran = 'new'; };
  await reload();
  assert.equal(ran, 'new');
  assert.equal(source.reload, reload);
  assert.equal(source.refetch, refetch);
  assert.equal(source.restart, restart);
});

// --- global refresh with hook-owned sources ----------------------------------

const sourceThat = (state: { calls: number; fail: boolean }) =>
  createRefreshSource(() => async () => {
    state.calls++;
    if (state.fail) throw new Error('down');
  });

test('manual refresh and demo regeneration await every registered source and count failures', async () => {
  const names = ['templates', 'settings', 'goals', 'personal', 'summary'] as const;
  const states = Object.fromEntries(names.map((n) => [n, { calls: 0, fail: false }])) as Record<(typeof names)[number], { calls: number; fail: boolean }>;
  const refresh = createGlobalRefresh(() => newClient());
  const unregister = names.map((n) => refresh.registerTask(sourceThat(states[n]).reload));

  const manual = await refresh.run();
  assert.equal(manual.outcome, 'success');
  assert.equal(manual.total, 5);
  assert.ok(names.every((n) => states[n].calls === 1));

  // Demo regeneration: the server data changed, so every source loads once more.
  const demo = await refresh.run({ invalidate: true });
  assert.equal(demo.total, 5);
  assert.ok(names.every((n) => states[n].calls === 2), 'templates, settings, goals, personal data and summary all reloaded');

  states.goals.fail = true;
  const partial = await refresh.run();
  assert.equal(partial.outcome, 'partial');
  assert.equal(partial.failed, 1);

  names.forEach((n) => { states[n].fail = true; });
  const all = await refresh.run({ invalidate: true });
  assert.equal(all.outcome, 'failure');
  assert.equal(all.failed, 5);

  unregister.forEach((u) => u());
  assert.equal(refresh.hasWork(), false);
  assert.equal((await refresh.run()).outcome, 'nothing-to-refresh');
});

// --- wiring guards (source) -------------------------------------------------

test('every owned hook registers its refresh task through useRefreshSource, once, and not by hand', () => {
  for (const file of ['useWorkoutTemplates', 'useUserSettings', 'useGoals', 'useDailySummary', 'usePersonalData']) {
    const src = read(`src/hooks/${file}.ts`);
    assert.equal((src.match(/useRefreshSource\(/g) ?? []).length, 1, `${file} calls useRefreshSource once`);
    assert.ok(!/registerTask\(|useRegisterRefreshTask\(/.test(src), `${file} does not register a second task itself`);
    for (const field of ['state', 'phase', 'loadFailed', 'refreshFailed', 'error']) {
      assert.match(src, new RegExp(`\\b${field}\\b`), `${file} exposes ${field}`);
    }
  }
  const ctx = read('src/app/globalRefreshContext.ts');
  assert.equal((ctx.match(/useRegisterRefreshTask\(source\.reload\)/g) ?? []).length, 1);
});
