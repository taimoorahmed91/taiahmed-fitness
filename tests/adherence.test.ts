import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adherenceSummary } from '../src/lib/targets';

test('streak skips an in-progress today and stops at a miss', () => {
  const s = adherenceSummary({ '2026-10-27': 'under', '2026-10-26': 'within', '2026-10-25': 'within', '2026-10-24': 'over' }, '2026-10-27');
  assert.equal(s.streak, 2);
});

test('today within range extends the streak', () => {
  assert.equal(adherenceSummary({ '2026-10-27': 'within', '2026-10-26': 'within' }, '2026-10-27').streak, 2);
});

test('unlogged day breaks the streak', () => {
  assert.equal(adherenceSummary({ '2026-10-26': 'within', '2026-10-24': 'within' }, '2026-10-27').streak, 1);
});

test('rates ignore unlogged days and window is 30 cells', () => {
  const s = adherenceSummary({ '2026-10-27': 'within', '2026-10-26': 'over', '2026-10-01': 'within' }, '2026-10-27');
  assert.equal(s.cells.length, 30);
  assert.deepEqual(s.week, { hit: 1, logged: 2, pct: 50 });
  assert.equal(s.month.hit, 2);
});
