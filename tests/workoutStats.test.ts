import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseVolume, isPersonalRecord, bestWeights } from '../src/lib/workoutStats';
import { projectMassChange } from '../src/lib/energyBalance';

test('volume sums reps x weight for working sets, ignoring warmup', () => {
  assert.equal(exerciseVolume({ warmup: '10', warmupWeight: '40', set1: '10', set1Weight: '60', set2: '8', set2Weight: '62.5' }), 1100);
});

test('volume uses decimal-comma weights and the default weight', () => {
  assert.equal(exerciseVolume({ set1: '10', set1Weight: '20,5', set2: '10' }, '20'), 405);
});

test('PR only when strictly heavier than all-time best', () => {
  const best = bestWeights([{ Bench: { set1: '5', set1Weight: '80' } }, { Bench: { set1: '3', set1Weight: '85' } }]);
  assert.equal(isPersonalRecord({ set1: '1', set1Weight: '85' }, best.Bench), false);
  assert.equal(isPersonalRecord({ set1: '1', set1Weight: '87.5' }, best.Bench), true);
  assert.equal(isPersonalRecord({ set1: '1', set1Weight: '100' }, best.Squat), false);
});

test('7700 kcal deficit projects -1 kg, skipping incomplete days', () => {
  const r = projectMassChange([{ consumed: 2000, burned: 5850 }, { consumed: 2000, burned: 5850 }, { consumed: 0, burned: 3000 }]);
  assert.equal(r.days, 2);
  assert.equal(r.deficit, 7700);
  assert.equal(r.kg, -1);
});
