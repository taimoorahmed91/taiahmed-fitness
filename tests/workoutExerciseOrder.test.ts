import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutExerciseOrder } from '../src/lib/workoutExerciseOrder';

test('display follows previous sequence while retaining original data indexes', () => {
  assert.deepEqual(workoutExerciseOrder(['Bench', 'Squat', 'Row'], { Bench: 3, Squat: 1, Row: 2 }), [
    { exercise: 'Squat', index: 1 }, { exercise: 'Row', index: 2 }, { exercise: 'Bench', index: 0 },
  ]);
});

test('unsequenced exercises follow sequenced exercises in original order', () => {
  assert.deepEqual(workoutExerciseOrder(['New', 'Bench', 'Extra'], { Bench: 2 }).map(x => x.index), [1, 0, 2]);
});

test('without history retain template order and do not mutate exercises', () => {
  const exercises = ['Bench', 'Squat'];
  assert.deepEqual(workoutExerciseOrder(exercises, {}).map(x => x.index), [0, 1]);
  assert.deepEqual(exercises, ['Bench', 'Squat']);
});