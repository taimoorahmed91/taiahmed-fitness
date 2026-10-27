import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyDigest } from '../src/lib/crossMetricIntelligence';

const empty = { meals: [], gym: [], weight: [], waist: [], sleep: [], recovery: [] };

test('weeks are the 7 days ending today and the 7 before', () => {
  const d = weeklyDigest({ ...empty, gym: [
    { date: '2026-10-21', duration: 60, notes: '1.Squat: S1:10@100kg' },
    { date: '2026-10-20', duration: 50, notes: '' },
  ] }, '2026-10-27');
  assert.deepEqual([d.current.workouts, d.current.minutes, d.current.tonnage], [1, 60, 1000]);
  assert.equal(d.previous.workouts, 1);
});

test('calorie average is per logged day; sleep uses the longer entry per day', () => {
  const d = weeklyDigest({ ...empty,
    meals: [{ date: '2026-10-27', calories: 1000 }, { date: '2026-10-27', calories: 1000 }, { date: '2026-10-26', calories: 1000 }],
    sleep: [{ date: '2026-10-27', hours: 6 }, { date: '2026-10-27', hours: 7 }, { date: '2026-10-26', hours: 8 }],
  }, '2026-10-27');
  assert.equal(d.current.avgCalories, 1500);
  assert.equal(d.current.avgSleep, 7.5);
});

test('body deltas need two entries in the week', () => {
  const one = weeklyDigest({ ...empty, weight: [{ date: '2026-10-27', value: 80 }] }, '2026-10-27');
  assert.equal(one.current.weightDelta, null);
  const two = weeklyDigest({ ...empty, weight: [{ date: '2026-10-27', value: 79.4 }, { date: '2026-10-22', value: 80 }] }, '2026-10-27');
  assert.equal(two.current.weightDelta, -0.6);
});
