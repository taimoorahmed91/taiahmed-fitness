import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRefreshEventHandler,
  createRefreshRunner,
  deriveFreshness,
  type RefreshSnapshot,
} from '../src/lib/refreshState';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test('single flight: overlapping runs share one batch and fire each task once', async () => {
  const gate = deferred();
  let calls = 0;
  const runner = createRefreshRunner(() => [async () => { calls++; await gate.promise; }]);
  const a = runner.run();
  const b = runner.run();
  assert.equal(a, b);
  assert.equal(runner.getSnapshot().refreshing, true);
  gate.resolve();
  await a;
  assert.equal(calls, 1);
  assert.equal(runner.getSnapshot().refreshing, false);
  await runner.run(); // a new batch is allowed after the first one ends
  assert.equal(calls, 2);
});

test('one failing task is counted, does not throw, and does not stop the others', async () => {
  let ran = 0;
  const runner = createRefreshRunner(() => [
    () => { throw new Error('sync'); },
    async () => { throw new Error('async'); },
    async () => { ran++; },
  ]);
  await runner.run();
  assert.equal(ran, 1);
  assert.equal(runner.getSnapshot().lastFailures, 2);
  assert.equal(runner.getSnapshot().refreshing, false);
});

test('snapshot records start and finish times and reports every change', async () => {
  let t = 1000;
  const seen: RefreshSnapshot[] = [];
  const runner = createRefreshRunner(() => [async () => { t = 2500; }], { now: () => t, onChange: (s) => seen.push(s) });
  await runner.run();
  assert.deepEqual(seen.map((s) => s.refreshing), [true, false]);
  assert.equal(seen[0].lastStartedAt, 1000);
  assert.equal(seen[0].lastFinishedAt, null);
  assert.equal(seen[1].lastStartedAt, 1000);
  assert.equal(seen[1].lastFinishedAt, 2500);
});

test('tasks are read when the batch starts (latest refetch functions win)', async () => {
  let current = ['a'];
  const log: string[] = [];
  const runner = createRefreshRunner(() => current.map((n) => () => { log.push(n); }));
  await runner.run();
  current = ['b', 'c'];
  await runner.run();
  assert.deepEqual(log, ['a', 'b', 'c']);
});

test('manual refresh event: calls preventDefault and reuses the single-flight batch', async () => {
  const gate = deferred();
  let calls = 0;
  const runner = createRefreshRunner(() => [async () => { calls++; await gate.promise; }]);
  const handler = createRefreshEventHandler(() => runner.run());
  let prevented = 0;
  const event = { preventDefault: () => { prevented++; } };
  handler(event);
  handler(event);
  handler(event);
  assert.equal(prevented, 3);
  assert.equal(calls, 1);
  gate.resolve();
  await runner.run();
});

const base = { fetchedAt: null, loading: false, refreshing: false, lastStartedAt: null, lastFinishedAt: null, now: 10_000_000, staleAfterMs: 35 * 60_000 };

test('freshness: loading, never-succeeded and refreshing', () => {
  assert.equal(deriveFreshness({ ...base, loading: true }), 'loading');
  assert.equal(deriveFreshness({ ...base }), 'unavailable');
  assert.equal(deriveFreshness({ ...base, refreshing: true, fetchedAt: 1 }), 'refreshing');
});

test('freshness comes from the last successful fetch, not from when the batch ran', () => {
  const fetchedAt = base.now - 60_000;
  assert.equal(deriveFreshness({ ...base, fetchedAt }), 'fresh');
  // Batch started and ended after fetchedAt: meals query failed (hook swallowed the error) -> stale.
  assert.equal(
    deriveFreshness({ ...base, fetchedAt, lastStartedAt: base.now - 30_000, lastFinishedAt: base.now - 20_000 }),
    'stale',
  );
  // Meals query succeeded during the batch -> fresh.
  assert.equal(
    deriveFreshness({ ...base, fetchedAt: base.now - 10_000, lastStartedAt: base.now - 30_000, lastFinishedAt: base.now - 5_000 }),
    'fresh',
  );
});

test('freshness: old data is stale even with no failed attempt', () => {
  assert.equal(deriveFreshness({ ...base, fetchedAt: base.now - 36 * 60_000 }), 'stale');
  assert.equal(deriveFreshness({ ...base, fetchedAt: base.now - 34 * 60_000 }), 'fresh');
});
