import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStatsStatus, daysSinceLatest, measurementStatus } from '../src/lib/statsStatus';

const now = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15 12:00 UTC

test('measurementStatus: never measured or overdue is due; otherwise counts down', () => {
  assert.deepEqual(measurementStatus(null, 7), { due: true, daysUntil: 0 });
  assert.deepEqual(measurementStatus(7, 7), { due: true, daysUntil: 0 });
  assert.deepEqual(measurementStatus(2, 7), { due: false, daysUntil: 5 });
});

test('daysSinceLatest uses the newest date regardless of order', () => {
  assert.equal(daysSinceLatest(['2026-06-01', '2026-06-13', '2026-06-05'], '2026-06-15'), 2);
  assert.equal(daysSinceLatest([], '2026-06-15'), null);
});

test('workout today / yesterday come from loaded sessions', () => {
  const s = computeStatsStatus({
    gymDates: ['2026-06-14'], weightDates: [], waistDates: [], whoopCreatedAt: [],
    weightIntervalDays: 7, waistIntervalDays: 7, now,
  });
  assert.equal(s.didWorkoutToday, false);
  assert.equal(s.didWorkoutYesterday, true);
  assert.deepEqual(s.weight, { due: true, daysUntil: 0 });
});

test('weight and waist statuses use their own intervals', () => {
  const s = computeStatsStatus({
    gymDates: [], weightDates: ['2026-06-13'], waistDates: ['2026-06-10'], whoopCreatedAt: [],
    weightIntervalDays: 7, waistIntervalDays: 3, now,
  });
  assert.deepEqual(s.weight, { due: false, daysUntil: 5 });
  assert.deepEqual(s.waist, { due: true, daysUntil: 0 });
});
