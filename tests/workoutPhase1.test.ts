import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseHistory, notesVolume, volumeChange, readinessLevel } from '../src/lib/workoutStats';

const sessions = [
  { exercise: 'Pull', date: '2026-10-20', notes: '1.Row: S1:10@50kg S2:8@55kg | 2.Curl: S1:12@10kg' },
  { exercise: 'Pull B', date: '2026-10-10', notes: '1.Cable Row: S1:10@45kg' },
];

test('exercise history is oldest-first and merges aliases', () => {
  const h = exerciseHistory(sessions, 'Row', { 'Cable Row': 'Row' });
  assert.deepEqual(h.map((e) => e.date), ['2026-10-10', '2026-10-20']);
  assert.equal(h[1].topWeight, 55);
  assert.equal(h[1].volume, 940);
});

test('session volume sums working sets', () => {
  assert.equal(notesVolume(sessions[0].notes), 1060);
});

test('volume change needs a previous volume', () => {
  assert.equal(volumeChange(1100, 0), null);
  assert.deepEqual(volumeChange(1100, 1000), { diff: 100, pct: 10 });
});

test('readiness bands', () => {
  assert.equal(readinessLevel(67), 'high');
  assert.equal(readinessLevel(66), 'medium');
  assert.equal(readinessLevel(34), 'medium');
  assert.equal(readinessLevel(33), 'low');
  assert.equal(readinessLevel(null), null);
});
