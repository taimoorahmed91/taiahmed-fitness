import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  elapsedSeconds, formatClock, REST_OVER_MESSAGE, restProgressPercent, restRemaining, restoreRestTimer,
  serializeRestTimer, shouldChime, startRest, transitionRestOver,
} from '../src/lib/workoutTiming';

const NOW = Date.parse('2026-10-30T12:00:00.000Z');

describe('workout clocks', () => {
  test('elapsed and remaining come from wall-clock start times and never go negative', () => {
    assert.equal(elapsedSeconds(NOW - 125_900, NOW), 125);
    assert.equal(elapsedSeconds(NOW + 5_000, NOW), 0);
    assert.equal(restRemaining(NOW - 20_000, 60, NOW), 40);
    assert.equal(restRemaining(NOW - 200_000, 60, NOW), 0);
  });

  test('a throttled background tab catches up in one step', () => {
    // No ticks for 10 minutes, then one read: still exact.
    assert.equal(elapsedSeconds(NOW - 600_000, NOW), 600);
    assert.equal(restRemaining(NOW - 59_000, 60, NOW), 1);
  });

  test('clock text keeps mm:ss and does not cap minutes', () => {
    assert.equal(formatClock(0), '00:00');
    assert.equal(formatClock(65), '01:05');
    assert.equal(formatClock(75 * 60 + 9), '75:09');
    assert.equal(formatClock(-3), '00:00');
  });

  test('progress is clamped to 0..100', () => {
    assert.equal(restProgressPercent(60, 60), 0);
    assert.equal(restProgressPercent(60, 15), 75);
    assert.equal(restProgressPercent(60, -5), 100);
    assert.equal(restProgressPercent(0, 0), 0);
  });
});

describe('rest over state', () => {
  test('running becomes over exactly once; repeats and stale timers do not announce', () => {
    const rest = startRest('set', 60, NOW);
    const first = transitionRestOver(rest, NOW);
    assert.equal(first.announce, true);
    assert.equal(first.rest?.status, 'over');
    const second = transitionRestOver(first.rest, NOW);
    assert.equal(second.announce, false);
    assert.equal(second.rest, first.rest);
    // A timer that was replaced by a newer one must not flip the new timer.
    const replaced = startRest('exercise', 90, NOW + 5_000);
    const stale = transitionRestOver(replaced, NOW);
    assert.equal(stale.announce, false);
    assert.equal(stale.rest?.status, 'running');
    assert.equal(transitionRestOver(null, NOW).announce, false);
  });

  test('the visual message does not depend on sound or vibration', () => {
    assert.match(REST_OVER_MESSAGE, /Rest over/);
    // The decision to chime is separate from the state change.
    const { rest } = transitionRestOver(startRest('set', 60, NOW), NOW);
    assert.equal(rest?.status, 'over');
  });

  test('chime only when the rest just ran out', () => {
    assert.equal(shouldChime(NOW - 61_000, 60, NOW), true);
    assert.equal(shouldChime(NOW - 66_000, 60, NOW), false);
  });
});

describe('persisted timer metadata', () => {
  test('start metadata is stable: remaining is written once, as the full duration', () => {
    const rest = startRest('exercise', 90, NOW);
    const a = serializeRestTimer(rest);
    const b = serializeRestTimer(rest);
    assert.deepEqual(a, b);
    assert.deepEqual(a, { remaining: 90, total: 90, type: 'exercise', startedAt: '2026-10-30T12:00:00.000Z' });
  });

  test('restore recomputes from startedAt and ignores any stored remaining', () => {
    const saved = { remaining: 3, total: 60, type: 'set', startedAt: new Date(NOW - 20_000).toISOString() };
    const r = restoreRestTimer(saved, NOW);
    assert.equal(r?.status, 'running');
    assert.equal(restRemaining(r!.startedAt, r!.total, NOW), 40);
  });

  test('expired, missing or malformed timers are dropped', () => {
    assert.equal(restoreRestTimer({ total: 60, type: 'set', startedAt: new Date(NOW - 61_000).toISOString() }, NOW), null);
    assert.equal(restoreRestTimer(null, NOW), null);
    assert.equal(restoreRestTimer({ total: 'x', startedAt: 'nope' }, NOW), null);
    assert.equal(restoreRestTimer({ total: 0, type: 'set', startedAt: new Date(NOW).toISOString() }, NOW), null);
  });
});
