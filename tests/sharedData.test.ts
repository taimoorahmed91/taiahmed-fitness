import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  SHARED_DATA_ROOT,
  SHARED_TABLES,
  SHARED_QUERY_OPTIONS,
  byDateCreatedDesc,
  byDateDesc,
  byDateTimeDesc,
  invalidateSharedTable,
  isOtherUsersSharedKey,
  isSharedDataKey,
  patchSharedList,
  removeById,
  removeOtherUsersSharedData,
  replaceById,
  sharedDataKey,
  sharedDataUserKey,
  upsertSorted,
} from '../src/lib/sharedData';

type Row = { id: string; date: string; label?: string };
const row = (id: string, date: string, label?: string): Row => ({ id, date, label });
const ids = (list: Row[]) => list.map((r) => r.id);
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

// --- keys ------------------------------------------------------------------

test('keys name the user and the table, and differ per user and per table', () => {
  assert.deepEqual(sharedDataKey('u1', 'meals'), [SHARED_DATA_ROOT, 'u1', 'meals']);
  assert.notDeepEqual(sharedDataKey('u1', 'meals'), sharedDataKey('u2', 'meals'));
  assert.notDeepEqual(sharedDataKey('u1', 'meals'), sharedDataKey('u1', 'weight'));
  assert.deepEqual(sharedDataUserKey('u1'), [SHARED_DATA_ROOT, 'u1']);
});

test('signed out (null / undefined) uses the null-user key, never a real user key', () => {
  assert.deepEqual(sharedDataKey(null, 'sleep'), [SHARED_DATA_ROOT, null, 'sleep']);
  assert.deepEqual(sharedDataKey(undefined, 'sleep'), sharedDataKey(null, 'sleep'));
  assert.notDeepEqual(sharedDataKey(null, 'sleep'), sharedDataKey('u1', 'sleep'));
});

test('every shared table has its own distinct key for one user', () => {
  const keys = SHARED_TABLES.map((t) => JSON.stringify(sharedDataKey('u1', t)));
  assert.equal(new Set(keys).size, SHARED_TABLES.length);
  for (const t of SHARED_TABLES) assert.ok(isSharedDataKey(sharedDataKey('u1', t)));
});

test('isSharedDataKey / isOtherUsersSharedKey only recognise our keys', () => {
  assert.equal(isSharedDataKey(['goals', 'u1']), false);
  assert.equal(isSharedDataKey([SHARED_DATA_ROOT, 'u1', 'unknown-table']), false);
  assert.equal(isSharedDataKey([SHARED_DATA_ROOT, 5, 'meals']), false);
  assert.equal(isOtherUsersSharedKey(sharedDataKey('u1', 'meals'), 'u1'), false);
  assert.equal(isOtherUsersSharedKey(sharedDataKey('u1', 'meals'), 'u2'), true);
  assert.equal(isOtherUsersSharedKey(sharedDataKey('u1', 'meals'), null), true);
  assert.equal(isOtherUsersSharedKey(sharedDataKey(null, 'meals'), null), false);
  assert.equal(isOtherUsersSharedKey(['goals', 'u1'], 'u2'), false);
});

test('query options keep one-fetch behaviour: fresh window, no focus/reconnect refetch, no retries', () => {
  assert.ok(SHARED_QUERY_OPTIONS.staleTime > 0);
  assert.equal(SHARED_QUERY_OPTIONS.refetchOnWindowFocus, false);
  assert.equal(SHARED_QUERY_OPTIONS.refetchOnReconnect, false);
  assert.equal(SHARED_QUERY_OPTIONS.retry, false);
  assert.equal(SHARED_QUERY_OPTIONS.networkMode, 'always', 'an offline first load must fail fast, not wait on a skeleton');
});

// --- cache isolation --------------------------------------------------------

test('removeOtherUsersSharedData keeps the current user and unrelated queries only', () => {
  const client = newClient();
  client.setQueryData(sharedDataKey('a', 'meals'), [row('1', '2026-01-01')]);
  client.setQueryData(sharedDataKey('a', 'weight'), [row('2', '2026-01-01')]);
  client.setQueryData(sharedDataKey('b', 'meals'), [row('3', '2026-01-01')]);
  client.setQueryData(['goals', 'a'], { keep: true });

  removeOtherUsersSharedData(client, 'a');
  assert.ok(client.getQueryData(sharedDataKey('a', 'meals')));
  assert.ok(client.getQueryData(sharedDataKey('a', 'weight')));
  assert.equal(client.getQueryData(sharedDataKey('b', 'meals')), undefined);
  assert.ok(client.getQueryData(['goals', 'a']));
});

test('signing out removes every user\'s shared rows from memory', () => {
  const client = newClient();
  client.setQueryData(sharedDataKey('a', 'meals'), [row('1', '2026-01-01')]);
  client.setQueryData(sharedDataKey('b', 'sleep'), [row('2', '2026-01-01')]);
  removeOtherUsersSharedData(client, null);
  assert.equal(client.getQueryData(sharedDataKey('a', 'meals')), undefined);
  assert.equal(client.getQueryData(sharedDataKey('b', 'sleep')), undefined);
});

test('a new identity reads an empty key, not the previous user\'s rows', () => {
  const client = newClient();
  client.setQueryData(sharedDataKey('a', 'meals'), [row('1', '2026-01-01')]);
  assert.equal(client.getQueryData(sharedDataKey('b', 'meals')), undefined);
  assert.equal(client.getQueryData(sharedDataKey(null, 'meals')), undefined);
});

test('patching one user\'s table never touches another user\'s cache', () => {
  const client = newClient();
  client.setQueryData(sharedDataKey('a', 'weight'), [row('1', '2026-01-01')]);
  client.setQueryData(sharedDataKey('b', 'weight'), [row('9', '2026-01-01')]);
  patchSharedList<Row>(client, 'a', 'weight', (l) => upsertSorted(l, row('2', '2026-01-02'), byDateDesc));
  assert.deepEqual(ids(client.getQueryData<Row[]>(sharedDataKey('a', 'weight'))!), ['2', '1']);
  assert.deepEqual(ids(client.getQueryData<Row[]>(sharedDataKey('b', 'weight'))!), ['9']);
});

// --- network dedupe ---------------------------------------------------------

test('many hook instances on one key share a single fetch', async () => {
  const client = newClient();
  let calls = 0;
  const queryFn = async () => {
    calls++;
    return [row('1', '2026-01-01')];
  };
  const key = sharedDataKey('a', 'meals');
  const observers = [1, 2, 3, 4].map(() => new QueryObserver(client, { queryKey: key, queryFn, ...SHARED_QUERY_OPTIONS }));
  const unsubscribe = observers.map((o) => o.subscribe(() => {}));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 1);
  for (const o of observers) assert.deepEqual(ids(o.getCurrentResult().data as Row[]), ['1']);
  unsubscribe.forEach((u) => u());
});

test('different users do not share a fetch', async () => {
  const client = newClient();
  const seen: string[] = [];
  const mk = (userId: string) =>
    new QueryObserver(client, {
      queryKey: sharedDataKey(userId, 'meals'),
      queryFn: async ({ queryKey }) => {
        seen.push(String(queryKey[1]));
        return [row(userId, '2026-01-01')];
      },
      ...SHARED_QUERY_OPTIONS,
    });
  const a = mk('a');
  const b = mk('b');
  const ua = a.subscribe(() => {});
  const ub = b.subscribe(() => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen.sort(), ['a', 'b']);
  assert.deepEqual(ids(a.getCurrentResult().data as Row[]), ['a']);
  assert.deepEqual(ids(b.getCurrentResult().data as Row[]), ['b']);
  ua();
  ub();
});

test('a manual refetch that joins a running fetch does not start another', async () => {
  const client = newClient();
  const key = sharedDataKey('a', 'meals');
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => {
      calls++;
      await gate;
      return [row('1', '2026-01-01')];
    },
    ...SHARED_QUERY_OPTIONS,
  });
  const unsubscribe = observer.subscribe(() => {});
  const first = client.refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: false });
  const second = client.refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: false });
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  unsubscribe();
});

test('a failed refetch resolves (awaitable) and keeps the last successful rows and time', async () => {
  const client = newClient();
  const key = sharedDataKey('a', 'meals');
  let fail = false;
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => {
      if (fail) throw new Error('boom');
      return [row('1', '2026-01-01')];
    },
    ...SHARED_QUERY_OPTIONS,
  });
  const unsubscribe = observer.subscribe(() => {});
  await new Promise((r) => setTimeout(r, 20));
  const okAt = client.getQueryState(key)!.dataUpdatedAt;
  assert.ok(okAt > 0);

  fail = true;
  await new Promise((r) => setTimeout(r, 5));
  await client.refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: false });
  const state = client.getQueryState(key)!;
  assert.equal(state.status, 'error');
  assert.equal(state.dataUpdatedAt, okAt, 'last successful time does not move on failure');
  assert.deepEqual(ids(state.data as Row[]), ['1']);
  unsubscribe();
});

// --- list helpers -----------------------------------------------------------

test('upsertSorted inserts newest-first, new row first on a date tie, without mutating', () => {
  const list = [row('a', '2026-03-02'), row('b', '2026-03-01')];
  const snapshot = [...list];
  assert.deepEqual(ids(upsertSorted(list, row('n', '2026-03-03'), byDateDesc)), ['n', 'a', 'b']);
  assert.deepEqual(ids(upsertSorted(list, row('n', '2026-03-02'), byDateDesc)), ['n', 'a', 'b']);
  assert.deepEqual(ids(upsertSorted(list, row('n', '2026-03-01'), byDateDesc)), ['a', 'n', 'b']);
  assert.deepEqual(ids(upsertSorted(list, row('n', '2026-02-01'), byDateDesc)), ['a', 'b', 'n']);
  assert.deepEqual(upsertSorted([], row('n', '2026-02-01'), byDateDesc), [row('n', '2026-02-01')]);
  assert.deepEqual(list, snapshot);
});

test('upsertSorted keeps an edited row in place while it still fits, so same-date rows do not shuffle', () => {
  const list = [row('a', '2026-03-02'), row('b', '2026-03-02'), row('c', '2026-03-02'), row('d', '2026-03-01')];
  const edited = upsertSorted(list, row('b', '2026-03-02', 'edited'), byDateDesc);
  assert.deepEqual(ids(edited), ['a', 'b', 'c', 'd']);
  assert.equal(edited[1].label, 'edited');
});

test('upsertSorted moves an edited row when its date changes, and never duplicates it', () => {
  const list = [row('a', '2026-03-03'), row('b', '2026-03-02'), row('c', '2026-03-01')];
  assert.deepEqual(ids(upsertSorted(list, row('c', '2026-03-05'), byDateDesc)), ['c', 'a', 'b']);
  assert.deepEqual(ids(upsertSorted(list, row('a', '2026-02-01'), byDateDesc)), ['b', 'c', 'a']);
});

test('upsertSorted can replace by a custom match (one note per date)', () => {
  const sameDate = (e: Row, i: Row) => e.id === i.id || e.date === i.date;
  const list = [row('a', '2026-03-03'), row('b', '2026-03-02')];
  const out = upsertSorted(list, row('z', '2026-03-02', 'replacement'), byDateDesc, sameDate);
  assert.deepEqual(ids(out), ['a', 'z']);
  assert.equal(out[1].label, 'replacement');
});

test('meal and extra-activity comparers follow the database ordering', () => {
  const meals = [
    { id: '1', date: '2026-03-02', time: '12:00:00' },
    { id: '2', date: '2026-03-02', time: '08:00:00' },
    { id: '3', date: '2026-03-01', time: '23:00:00' },
  ];
  const out = upsertSorted(meals, { id: 'n', date: '2026-03-02', time: '10:00:00' }, byDateTimeDesc);
  assert.deepEqual(out.map((m) => m.id), ['1', 'n', '2', '3']);

  const acts = [
    { id: '1', date: '2026-03-02', created_at: '2026-03-02T10:00:00Z' },
    { id: '2', date: '2026-03-02', created_at: '2026-03-02T08:00:00Z' },
  ];
  const outActs = upsertSorted(acts, { id: 'n', date: '2026-03-02', created_at: '2026-03-02T09:00:00Z' }, byDateCreatedDesc);
  assert.deepEqual(outActs.map((a) => a.id), ['1', 'n', '2']);
});

test('removeById / replaceById return the same array when nothing matches', () => {
  const list = [row('a', '2026-03-02'), row('b', '2026-03-01')];
  assert.equal(removeById(list, 'zzz'), list);
  assert.deepEqual(ids(removeById(list, 'a')), ['b']);
  assert.equal(replaceById(list, 'zzz', row('zzz', '2026-01-01')), list);
  assert.equal(replaceById(list, 'b', row('b', '2026-03-01', 'x'))[1].label, 'x');
});

// --- cache patching ---------------------------------------------------------

test('patchSharedList does nothing without a user or without cached rows', () => {
  const client = newClient();
  assert.equal(patchSharedList<Row>(client, null, 'meals', (l) => [...l, row('x', '2026-01-01')]), false);
  assert.equal(patchSharedList<Row>(client, 'a', 'meals', (l) => [...l, row('x', '2026-01-01')]), false);
  assert.equal(client.getQueryData(sharedDataKey('a', 'meals')), undefined);
});

test('patchSharedList keeps the last successful fetch time (a local edit is not a fetch)', () => {
  const client = newClient();
  const key = sharedDataKey('a', 'meals');
  client.setQueryData(key, [row('1', '2026-01-01')], { updatedAt: 1234 });
  const changed = patchSharedList<Row>(client, 'a', 'meals', (l) => upsertSorted(l, row('2', '2026-01-02'), byDateDesc));
  assert.equal(changed, true);
  assert.equal(client.getQueryState(key)!.dataUpdatedAt, 1234);
  assert.deepEqual(ids(client.getQueryData<Row[]>(key)!), ['2', '1']);
});

test('patchSharedList with an unchanged result reports no change', () => {
  const client = newClient();
  const key = sharedDataKey('a', 'meals');
  const rows = [row('1', '2026-01-01')];
  client.setQueryData(key, rows);
  assert.equal(patchSharedList<Row>(client, 'a', 'meals', (l) => removeById(l, 'nope')), false);
  assert.equal(client.getQueryData(key), rows);
});

test('a write during a running fetch is not overwritten by that older fetch', async () => {
  const client = newClient();
  const key = sharedDataKey('a', 'weight');
  client.setQueryData(key, [row('1', '2026-01-01')], { updatedAt: 1 });

  const server: Row[] = [row('1', '2026-01-01')];
  let calls = 0;
  const gates: Array<() => void> = [];
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: 0,
    queryFn: async () => {
      const snapshot = [...server]; // what the server had when this request started
      calls++;
      await new Promise<void>((r) => gates.push(r));
      return snapshot;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 1, 'fetch #1 is running');

  // The write lands on the server while fetch #1 is in flight, then the hook patches the cache.
  server.unshift(row('2', '2026-01-02'));
  patchSharedList<Row>(client, 'a', 'weight', (l) => upsertSorted(l, row('2', '2026-01-02'), byDateDesc));
  assert.deepEqual(ids(client.getQueryData<Row[]>(key)!), ['2', '1'], 'patch is visible immediately');

  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 2, 'the running fetch was replaced by a fresh one');
  gates.forEach((release) => release()); // fetch #1 (cancelled) and fetch #2 finish
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ids(client.getQueryData<Row[]>(key)!), ['2', '1'], 'stale result never wins');
  unsubscribe();
});

test('a write during the FIRST load triggers a fresh load instead of being lost', async () => {
  const client = newClient();
  const key = sharedDataKey('a', 'weight');
  const server: Row[] = [row('1', '2026-01-01')];
  let calls = 0;
  const gates: Array<() => void> = [];
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => {
      const snapshot = [...server];
      calls++;
      await new Promise<void>((r) => gates.push(r));
      return snapshot;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 1);

  server.unshift(row('2', '2026-01-02'));
  assert.equal(patchSharedList<Row>(client, 'a', 'weight', (l) => l), false, 'no rows cached yet to patch');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 2);
  gates.forEach((release) => release());
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ids(client.getQueryData<Row[]>(key)!), ['2', '1']);
  unsubscribe();
});

test('invalidateSharedTable refetches and waits; never rejects, even when the fetch fails', async () => {
  const client = newClient();
  const key = sharedDataKey('a', 'sleep');
  let n = 0;
  const observer = new QueryObserver(client, {
    queryKey: key,
    ...SHARED_QUERY_OPTIONS,
    queryFn: async () => {
      n++;
      if (n === 3) throw new Error('boom');
      return [row(String(n), '2026-01-01')];
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ids(client.getQueryData<Row[]>(key)!), ['1']);

  await invalidateSharedTable(client, 'a', 'sleep');
  assert.deepEqual(ids(client.getQueryData<Row[]>(key)!), ['2'], 'awaited: data is fresh when it resolves');

  await invalidateSharedTable(client, 'a', 'sleep'); // fetch #3 fails
  assert.deepEqual(ids(client.getQueryData<Row[]>(key)!), ['2'], 'old rows kept after a failed reload');

  await invalidateSharedTable(client, null, 'sleep'); // no user: no-op
  assert.equal(n, 3);
  unsubscribe();
});
