import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  createGlobalRefresh,
  describeDemoRegeneration,
  describeManualRefresh,
  type GlobalRefreshResult,
} from '../src/app/globalRefresh';
import {
  SHARED_QUERY_OPTIONS,
  deriveSharedTableState,
  patchSharedList,
  sharedDataKey,
  upsertSorted,
  byDateDesc,
  type SharedTable,
} from '../src/lib/sharedData';
import { deriveFreshness } from '../src/lib/refreshState';

type Row = { id: string; date: string };
const row = (id: string, date = '2026-03-01'): Row => ({ id, date });
const ids = (list: Row[] | undefined) => (list ?? []).map((r) => r.id);
const sleep = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

/** A screen reading one table: an active observer on the table's shared key (what a mounted hook is). */
const mount = (client: QueryClient, table: SharedTable, queryFn: () => Promise<Row[]>, userId = 'u1') => {
  const observer = new QueryObserver(client, { queryKey: sharedDataKey(userId, table), queryFn, ...SHARED_QUERY_OPTIONS });
  const unsubscribe = observer.subscribe(() => {});
  return { observer, unsubscribe, key: sharedDataKey(userId, table) };
};

const counting = (rows: () => Row[] = () => [row('1')]) => {
  const state = { calls: 0, fail: false };
  const queryFn = async () => {
    state.calls++;
    if (state.fail) throw new Error('network down');
    return rows();
  };
  return { state, queryFn };
};

// --- shell-level refresh: no Dashboard involved -----------------------------

test('shell refresh reloads every active table from a non-Dashboard page (nothing registered by a page)', async () => {
  const client = newClient();
  const sleepTable = counting();
  const weightTable = counting();
  const a = mount(client, 'sleep', sleepTable.queryFn);
  const b = mount(client, 'weight', weightTable.queryFn);
  await sleep();
  assert.equal(sleepTable.state.calls, 1);

  const refresh = createGlobalRefresh(() => client);
  assert.equal(refresh.hasWork(), true);
  const result = await refresh.run();

  assert.equal(result.outcome, 'success');
  assert.equal(result.total, 2);
  assert.equal(sleepTable.state.calls, 2);
  assert.equal(weightTable.state.calls, 2);
  assert.equal(refresh.getSnapshot().refreshing, false);
  a.unsubscribe();
  b.unsubscribe();
});

test('refresh ignores tables nobody is reading, and says so truthfully', async () => {
  const client = newClient();
  const table = counting();
  const m = mount(client, 'meals', table.queryFn);
  await sleep();
  m.unsubscribe(); // the page left: the cache entry stays, but nothing is subscribed

  const refresh = createGlobalRefresh(() => client);
  assert.equal(refresh.hasWork(), false);
  const result = await refresh.run();
  assert.equal(result.outcome, 'nothing-to-refresh');
  assert.equal(table.state.calls, 1, 'no fetch for an unread table');
  const message = describeManualRefresh(result);
  assert.equal(message.kind, 'info');
  assert.doesNotMatch(message.message, /refreshed|updated|loaded/i);
});

test('the shell answers the app refresh event and every sender uses the shell owner, with no page reload', () => {
  const layout = read('src/components/layout/AppLayout.tsx');
  assert.match(layout, /createGlobalRefresh\(/);
  assert.match(layout, /APP_REFRESH_EVENT/);
  assert.match(layout, /GlobalRefreshContext\.Provider/);
  const menu = read('src/components/layout/AccountMenu.tsx');
  assert.match(menu, /describeManualRefresh\(/);
  assert.match(menu, /globalRefresh\.run\(\)/);
  assert.equal(/will update|updates by itself/i.test(menu), false, 'no promise about a later update');
  assert.equal(/location\.reload|window\.location|reload\(\)/.test(menu), false);
  // Nothing in the shell-owned refresh path depends on a page.
  const owner = read('src/app/globalRefresh.ts');
  assert.equal(/Dashboard/.test(owner.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false);
});

test('useAutoRefresh joins the shell batch instead of running its own, and stops answering the event inside the shell', () => {
  const hook = read('src/hooks/useAutoRefresh.ts');
  assert.match(hook, /useGlobalRefresh\(\)/);
  assert.match(hook, /globalRefresh\.registerTask\(/);
  assert.match(hook, /globalRefresh \? globalRefresh\.run\(\)/);
  // The legacy listener only exists for the no-shell fallback.
  assert.match(hook, /if \(globalRefresh\) return;\s*\n\s*const onRefresh = createRefreshEventHandler\(refetchAll\)/);
  assert.equal(/location\.reload/.test(hook), false);
});

// --- single flight ------------------------------------------------------------

test('single flight: header tap, timer and tab-return share one batch and fetch each table once', async () => {
  const client = newClient();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const mountedTable = mount(client, 'meals', async () => {
    calls++;
    if (calls > 1) await gate;
    return [row('1')];
  });
  await sleep();
  assert.equal(calls, 1);

  const refresh = createGlobalRefresh(() => client);
  let taskCalls = 0;
  // A screen's own refetch of the same table (what Dashboard registers) joins the running request.
  refresh.registerTask(async () => {
    taskCalls++;
    await client.refetchQueries({ queryKey: mountedTable.key, exact: true }, { cancelRefetch: false });
  });

  const header = refresh.run();
  const timer = refresh.run();
  const tabReturn = refresh.run();
  assert.equal(header, timer);
  assert.equal(timer, tabReturn);
  assert.equal(refresh.getSnapshot().refreshing, true);

  release();
  const result = await header;
  assert.equal(result.outcome, 'success');
  assert.equal(calls, 2, 'one initial load plus exactly one batch fetch');
  assert.equal(taskCalls, 1);
  assert.equal(refresh.getSnapshot().refreshing, false);

  await refresh.run(); // a new batch is fine once the first one ended
  assert.equal(calls, 3);
  assert.equal(taskCalls, 2);
  mountedTable.unsubscribe();
});

test('a registered task that fails is counted, and unregistering removes it', async () => {
  const client = newClient();
  const m = mount(client, 'weight', counting().queryFn);
  await sleep();
  const refresh = createGlobalRefresh(() => client);
  const off = refresh.registerTask(() => {
    throw new Error('settings refetch broke');
  });
  const result = await refresh.run();
  assert.equal(result.outcome, 'partial');
  assert.equal(result.failed, 1);
  assert.equal(result.total, 2);
  off();
  assert.equal((await refresh.run()).outcome, 'success');
  m.unsubscribe();
});

test('subscribers are told when a batch starts and ends', async () => {
  const client = newClient();
  const m = mount(client, 'weight', counting().queryFn);
  await sleep();
  const times = [0];
  const refresh = createGlobalRefresh(() => client, { now: () => (times[0] += 10) });
  const seen: boolean[] = [];
  const off = refresh.subscribe(() => seen.push(refresh.getSnapshot().refreshing));
  await refresh.run();
  off();
  assert.deepEqual(seen, [true, false]);
  const snap = refresh.getSnapshot();
  assert.ok(snap.lastStartedAt! < snap.lastFinishedAt!);
  m.unsubscribe();
});

// --- first-load failure vs true empty ------------------------------------------

test('state: loading, true empty, first-load failure and idle are all different', () => {
  const none = { signedIn: true, authLoading: false } as const;
  assert.equal(deriveSharedTableState({ ...none, query: undefined }).phase, 'loading');
  assert.equal(deriveSharedTableState({ ...none, query: { status: 'pending', data: undefined, error: null } }).phase, 'loading');
  assert.equal(deriveSharedTableState({ signedIn: false, authLoading: true, query: undefined }).phase, 'loading');
  assert.equal(deriveSharedTableState({ signedIn: false, authLoading: false, query: undefined }).phase, 'idle');

  const empty = deriveSharedTableState({ ...none, query: { status: 'success', data: [], error: null } });
  assert.deepEqual([empty.phase, empty.loadFailed, empty.refreshFailed], ['ready', false, false]);

  const failed = deriveSharedTableState({ ...none, query: { status: 'error', data: undefined, error: new Error('x') } });
  assert.deepEqual([failed.phase, failed.loadFailed, failed.refreshFailed], ['error', true, false]);
});

test('first-load failure is an error state (rows unknown), not a valid empty list', async () => {
  const client = newClient();
  const failing = counting();
  failing.state.fail = true;
  const empty = counting(() => []);
  const bad = mount(client, 'meals', failing.queryFn);
  const ok = mount(client, 'weight', empty.queryFn);
  await sleep();

  const badState = deriveSharedTableState({ signedIn: true, authLoading: false, query: client.getQueryState(bad.key) });
  assert.equal(badState.phase, 'error');
  assert.equal(badState.loadFailed, true);
  assert.equal(client.getQueryData(bad.key), undefined, 'no rows are invented');

  const okState = deriveSharedTableState({ signedIn: true, authLoading: false, query: client.getQueryState(ok.key) });
  assert.equal(okState.phase, 'ready');
  assert.deepEqual(client.getQueryData(ok.key), [], 'a real empty list is ready');

  // Retry (what the Try again button calls) recovers the first load.
  failing.state.fail = false;
  await client.refetchQueries({ queryKey: bad.key, exact: true }, { cancelRefetch: false });
  assert.equal(deriveSharedTableState({ signedIn: true, authLoading: false, query: client.getQueryState(bad.key) }).phase, 'ready');
  bad.unsubscribe();
  ok.unsubscribe();
});

// --- retained rows after a failed refetch --------------------------------------

test('a failed refetch keeps the last good rows, flags them stale, and a later success clears the flag', async () => {
  const client = newClient();
  const meals = counting(() => [row('1'), row('2')]);
  const m = mount(client, 'meals', meals.queryFn);
  await sleep();
  const okAt = client.getQueryState(m.key)!.dataUpdatedAt;
  assert.ok(okAt > 0);

  meals.state.fail = true;
  await sleep(5);
  const refresh = createGlobalRefresh(() => client);
  const result = await refresh.run();
  assert.equal(result.outcome, 'failure');
  assert.equal(result.failed, 1);

  const state = client.getQueryState(m.key)!;
  assert.deepEqual(ids(state.data as Row[]), ['1', '2'], 'previous rows are preserved');
  assert.equal(state.dataUpdatedAt, okAt, 'last successful fetch time did not move');
  const derived = deriveSharedTableState({ signedIn: true, authLoading: false, query: state });
  assert.deepEqual([derived.phase, derived.refreshFailed, derived.loadFailed], ['ready', true, false]);
  assert.equal(describeManualRefresh(result).kind, 'error');
  assert.match(describeManualRefresh(result).description ?? '', /last data/i);

  meals.state.fail = false;
  await sleep(5);
  assert.equal((await refresh.run()).outcome, 'success');
  const recovered = deriveSharedTableState({ signedIn: true, authLoading: false, query: client.getQueryState(m.key) });
  assert.equal(recovered.refreshFailed, false);
  m.unsubscribe();
});

test('a local write after a failed refresh keeps the stale flag (the other rows are still unverified)', async () => {
  const client = newClient();
  const meals = counting(() => [row('1', '2026-03-01')]);
  const m = mount(client, 'meals', meals.queryFn);
  await sleep();
  meals.state.fail = true;
  await sleep(5);
  await client.refetchQueries({ queryKey: m.key, exact: true }, { cancelRefetch: false });
  assert.equal(client.getQueryState(m.key)!.status, 'error');

  patchSharedList<Row>(client, 'u1', 'meals', (l) => upsertSorted(l, row('2', '2026-03-02'), byDateDesc));
  const state = client.getQueryState(m.key)!;
  assert.deepEqual(ids(state.data as Row[]), ['2', '1'], 'the write is visible');
  assert.equal(state.status, 'error', 'still marked as a failed refresh');
  assert.equal(deriveSharedTableState({ signedIn: true, authLoading: false, query: state }).refreshFailed, true);
  m.unsubscribe();
});

test('freshness stays tied to the last successful meals fetch, not to the batch', async () => {
  const client = newClient();
  const meals = counting();
  const m = mount(client, 'meals', meals.queryFn);
  await sleep();
  const fetchedAt = client.getQueryState(m.key)!.dataUpdatedAt;

  meals.state.fail = true;
  await sleep(5);
  const refresh = createGlobalRefresh(() => client);
  await refresh.run();
  const snap = refresh.getSnapshot();
  assert.ok(snap.lastFinishedAt! >= snap.lastStartedAt!);
  assert.equal(client.getQueryState(m.key)!.dataUpdatedAt, fetchedAt, 'batch end time did not become the fetch time');
  const status = deriveFreshness({
    fetchedAt,
    loading: false,
    refreshing: false,
    lastStartedAt: snap.lastStartedAt,
    lastFinishedAt: snap.lastFinishedAt,
    now: snap.lastFinishedAt!,
    staleAfterMs: 60 * 60 * 1000,
  });
  assert.equal(status, 'stale');
  m.unsubscribe();
});

// --- demo regeneration -----------------------------------------------------------

test('demo invalidation reloads active tables and marks unread ones stale for their next use', async () => {
  const client = newClient();
  let server = [row('old')];
  const meals = counting(() => server);
  const m = mount(client, 'meals', meals.queryFn);
  // A table cached earlier whose page is no longer open:
  client.setQueryData(sharedDataKey('u1', 'sleep'), [row('cached-old')]);
  await sleep();
  assert.deepEqual(ids(client.getQueryData(m.key)), ['old']);

  server = [row('new')]; // the demo data was regenerated on the server
  const refresh = createGlobalRefresh(() => client);
  const result = await refresh.run({ invalidate: true });

  assert.equal(result.outcome, 'success');
  assert.deepEqual(ids(client.getQueryData(m.key)), ['new'], 'the open page shows the new data');
  assert.equal(client.getQueryState(sharedDataKey('u1', 'sleep'))!.isInvalidated, true, 'unread table reloads on next use');
  assert.equal(describeDemoRegeneration(result).message, 'New sample data loaded.');
  m.unsubscribe();
});

test('demo invalidation never reuses a batch that began before the change: one fresh follow-up batch, shared by all callers', async () => {
  const client = newClient();
  let server = [row('old')];
  const gates: Array<() => void> = [];
  let running = 0;
  let maxRunning = 0;
  let calls = 0;
  const m = mount(client, 'meals', async () => {
    calls++;
    const snapshot = [...server]; // what the server held when this request started
    running++;
    maxRunning = Math.max(maxRunning, running);
    if (calls > 1) await new Promise<void>((r) => gates.push(r));
    running--;
    return snapshot;
  });
  await sleep();

  const refresh = createGlobalRefresh(() => client);
  const inFlight = refresh.run(); // a timer refresh starts; its request sees the OLD data
  await sleep(5);
  assert.equal(calls, 2);

  server = [row('new')]; // regeneration finished on the server
  const demoA = refresh.run({ invalidate: true });
  const demoB = refresh.run({ invalidate: true });
  assert.equal(demoA, demoB, 'all demo callers share the follow-up batch');
  assert.notEqual(demoA, inFlight);
  assert.equal(refresh.run(), demoA, 'a plain refresh now joins the newest batch');

  gates.shift()!(); // the old batch's request finishes (with old rows)
  await inFlight;
  await sleep(10);
  gates.forEach((release) => release());
  const result = await demoA;

  assert.equal(result.outcome, 'success');
  assert.deepEqual(ids(client.getQueryData(m.key)), ['new'], 'the old in-flight result did not win');
  assert.equal(maxRunning, 1, 'batches never overlapped');
  m.unsubscribe();
});

test('demo regeneration reports a failed reload honestly instead of claiming success', async () => {
  const client = newClient();
  const meals = counting();
  const m = mount(client, 'meals', meals.queryFn);
  await sleep();
  meals.state.fail = true;
  await sleep(5);
  const result = await createGlobalRefresh(() => client).run({ invalidate: true });
  assert.equal(result.outcome, 'failure');
  const message = describeDemoRegeneration(result);
  assert.equal(message.kind, 'error');
  assert.match(message.message, /couldn't load/i);
  assert.deepEqual(ids(client.getQueryData(m.key)), ['1'], 'old rows stay visible');
  m.unsubscribe();
});

test('DemoBanner regenerates through the shell owner (invalidate + await), never reloading the page', () => {
  const banner = read('src/components/DemoBanner.tsx');
  assert.match(banner, /globalRefresh\.run\(\{ invalidate: true \}\)/);
  assert.match(banner, /describeDemoRegeneration\(/);
  assert.equal(/location\.reload|window\.location|reload\(\)/.test(banner), false);
  assert.match(banner, /finally \{\s*setBusy\(false\)/, 'the button always comes back, success or failure');
});

test('result wording never overstates', () => {
  const base = { total: 3, failed: 0, startedAt: 0, finishedAt: 1 };
  const r = (outcome: GlobalRefreshResult['outcome'], failed = 0): GlobalRefreshResult => ({ ...base, outcome, failed });
  assert.equal(describeManualRefresh(r('success')).kind, 'success');
  assert.equal(describeManualRefresh(r('partial', 1)).kind, 'warning');
  assert.match(describeManualRefresh(r('partial', 1)).message, /1 of 3/);
  assert.equal(describeManualRefresh(r('failure', 3)).kind, 'error');
  assert.equal(describeDemoRegeneration(r('partial', 1)).kind, 'warning');
});

// --- Meals page contract ---------------------------------------------------------

test('Meals never shows zero summaries or an empty history before the first successful load', () => {
  const page = read('src/pages/Meals.tsx');
  assert.match(page, /useSharedTableState\('meals'\)/);
  assert.match(page, /mealsFailed \? \(\s*<DataLoadError/);
  assert.match(page, /summaryPending \? \(\s*<CardSkeleton/);
  assert.match(page, /listPending \? \(\s*<CardSkeleton/);
  // The phone "left today" line is behind the same gate.
  assert.match(page, /!summaryPending && !mealsFailed && \(\s*<MealRemainingSummary/);
  assert.match(page, /StaleDataNotice/);
  assert.match(page, /onRetry=\{refetchMeals\}/);
});
