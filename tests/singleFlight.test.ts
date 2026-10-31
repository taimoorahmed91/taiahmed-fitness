import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlight } from '../src/hooks/useSingleFlight';

test('concurrent calls share one run and pending flips on/off once', async () => {
  let calls = 0;
  const changes: boolean[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const run = createSingleFlight(async (n: number) => {
    calls++;
    await gate;
    return n * 2;
  }, (p) => changes.push(p));

  const a = run(1);
  const b = run(2);
  assert.equal(a, b);
  release();
  assert.equal(await a, 2);
  assert.equal(calls, 1);
  assert.deepEqual(changes, [true, false]);
});

test('allows a new run after success or failure', async () => {
  let calls = 0;
  const run = createSingleFlight(async (fail: boolean) => {
    calls++;
    if (fail) throw new Error('boom');
    return 'ok';
  });
  await assert.rejects(run(true), /boom/);
  assert.equal(await run(false), 'ok');
  assert.equal(calls, 2);
});

test('sync functions and sync throws are handled', async () => {
  const run = createSingleFlight((x: number) => {
    if (x < 0) throw new Error('neg');
    return x;
  });
  await assert.rejects(run(-1), /neg/);
  assert.equal(await run(3), 3);
});
