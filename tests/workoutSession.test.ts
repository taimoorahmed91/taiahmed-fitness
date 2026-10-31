import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySetUpdate, applyUseLastForSet, applyUseLastWeights, addExtraExercise, collectWorkoutEntries,
  fieldOrder, formatLast, formatWorkoutNotes, initialWorkoutData, nextInOrder, normalizeSetInput,
  parseNotesToPreviousReps, planUseLastForSet, restoreWorkoutData, buildActiveWorkoutState,
  type ActiveWorkoutState, type AnyExerciseKey, type WorkoutData,
} from '../src/lib/workoutSession';
import { serializeRestTimer, startRest } from '../src/lib/workoutTiming';
import { workoutExerciseOrder } from '../src/lib/workoutExerciseOrder';

const T = '10:15';
const fresh = (n = 3): WorkoutData => initialWorkoutData(n);
const type = (d: WorkoutData, index: number, key: AnyExerciseKey, value: string, time = T) => applySetUpdate(d, { index, key, value, time });

describe('original-index ordering', () => {
  test('presenting by a previous session never moves index-keyed data', () => {
    const exercises = ['Bench', 'Squat', 'Row'];
    const shown = workoutExerciseOrder(exercises, { Row: 1, Bench: 2, Squat: 3 });
    assert.deepEqual(shown.map((x) => x.index), [2, 0, 1]);

    let data = fresh(3);
    // Type into the exercise displayed FIRST (Row = original index 2).
    data = type(data, shown[0].index, 'set1', '8').data;
    data = type(data, shown[0].index, 'set1Weight', '102.5').data;
    assert.equal(data.exerciseSets[2].set1, '8');
    assert.equal(data.exerciseSets[2].set1Weight, '102.5');
    assert.equal(data.exerciseSets[0].set1, '');
    assert.equal(data.exerciseSequence[2], 1);
    assert.equal(data.exerciseSequence[0], undefined);
  });

  test('saved entries follow the order the user trained in, not display or index order', () => {
    const exercises = ['Bench', 'Squat', 'Row'];
    let data = fresh(3);
    data = type(data, 2, 'set1', '10').data; // Row first
    data = type(data, 0, 'set1', '5').data; // then Bench
    const entries = collectWorkoutEntries(exercises, data.exerciseSets, data.exerciseSequence, data.exerciseTimestamps, data.exerciseNotes, data.exerciseSetCount);
    assert.deepEqual(entries.map((e) => [e.exercise, e.index, e.seq]), [['Row', 2, 1], ['Bench', 0, 2]]);
  });

  test('extra exercises are appended and existing indexes stay put', () => {
    const data = type(fresh(2), 1, 'set1', '9').data;
    const r = addExtraExercise(data, 2, 'Curl');
    assert.equal(r.index, 2);
    assert.deepEqual(r.data.extraExercises, ['Curl']);
    assert.equal(r.data.exerciseSets[1].set1, '9');
    assert.deepEqual(r.data.exerciseSets[2], { set1: '', set2: '', set3: '' });
    const again = addExtraExercise(r.data, 2, 'Dips');
    assert.equal(again.index, 3);
  });
});

describe('set entry rules', () => {
  test('a new rep stamps the time, sequence and rest; a weight does not', () => {
    const w = type(fresh(), 0, 'set1Weight', '60');
    assert.equal(w.rest, null);
    assert.deepEqual(w.data.exerciseTimestamps[0], {});
    assert.equal(w.data.exerciseSequence[0], undefined);

    const r = type(w.data, 0, 'set1', '10', '09:41');
    assert.equal(r.rest, 'set');
    assert.equal(r.data.exerciseTimestamps[0].set1Time, '09:41');
    assert.equal(r.data.exerciseSequence[0], 1);
    assert.equal(r.data.nextSequence, 2);
  });

  test('rest type: warm-up and middle sets rest "set", the last visible set rests "exercise"', () => {
    assert.equal(type(fresh(), 0, 'warmup', '5').rest, 'set');
    assert.equal(type(fresh(), 0, 'set2', '5').rest, 'set');
    assert.equal(type(fresh(), 0, 'set3', '5').rest, 'exercise');
    const four = { ...fresh(), exerciseSetCount: { 0: 4, 1: 3, 2: 3 } };
    assert.equal(type(four, 0, 'set3', '5').rest, 'set');
    assert.equal(type(four, 0, 'set4', '5').rest, 'exercise');
  });

  test('editing a filled rep keeps its timestamp and starts no rest', () => {
    const a = type(fresh(), 0, 'set1', '10', '09:41');
    const b = type(a.data, 0, 'set1', '11', '09:50');
    assert.equal(b.rest, null);
    assert.equal(b.data.exerciseTimestamps[0].set1Time, '09:41');
    assert.equal(b.data.exerciseSets[0].set1, '11');
  });

  test('sequence is assigned once, only by warm-up or set 1, and never reused', () => {
    let d = type(fresh(), 0, 'set2', '8').data; // set 2 alone: no sequence yet
    assert.equal(d.exerciseSequence[0], undefined);
    d = type(d, 1, 'warmup', '5').data;
    d = type(d, 1, 'set1', '8').data; // already sequenced
    d = type(d, 0, 'set1', '8').data;
    assert.deepEqual(d.exerciseSequence, { 1: 1, 0: 2 });
    assert.equal(d.nextSequence, 3);
  });

  test('input rules: digits and one dot; comma becomes dot for weights; junk is ignored', () => {
    assert.equal(normalizeSetInput('set1Weight', '102,5'), '102.5');
    assert.equal(normalizeSetInput('set1', '1a'), null);
    assert.equal(normalizeSetInput('set1Weight', '1.2.3'), null);
    const d = fresh();
    assert.equal(type(d, 0, 'set1', 'x').data, d);
  });

  test('applySetUpdate does not mutate its input', () => {
    const d = fresh();
    const before = JSON.stringify(d);
    type(d, 0, 'set1', '10');
    assert.equal(JSON.stringify(d), before);
  });
});

describe('Use Last', () => {
  const prev = parseNotesToPreviousReps('1.Bench: W:5@20kg S1:10@55kg S2:8@57.5kg S3:6@60kg').reps.Bench;

  test('fills only empty fields and never overwrites what was typed', () => {
    const typed = type(fresh(), 0, 'set1Weight', '50').data;
    assert.deepEqual(planUseLastForSet(typed.exerciseSets[0], prev, 'set1'), [{ key: 'set1', value: '10' }]);
    const full = type(type(fresh(), 0, 'set1', '9').data, 0, 'set1Weight', '52').data;
    assert.deepEqual(planUseLastForSet(full.exerciseSets[0], prev, 'set1'), []);
    assert.equal(applyUseLastForSet(full, prev, 0, 'set1', T).data, full);
  });

  test('a filled rep behaves exactly like a typed rep: timestamp, sequence, set rest', () => {
    const r = applyUseLastForSet(fresh(), prev, 0, 'set1', '11:02');
    assert.equal(r.filled, 2);
    assert.equal(r.data.exerciseSets[0].set1, '10');
    assert.equal(r.data.exerciseSets[0].set1Weight, '55');
    assert.equal(r.data.exerciseTimestamps[0].set1Time, '11:02');
    assert.equal(r.data.exerciseSequence[0], 1);
    assert.equal(r.rest, 'set');
    // Same result as typing the two values by hand.
    let typedByHand = type(fresh(), 0, 'set1Weight', '55', '11:02').data;
    typedByHand = type(typedByHand, 0, 'set1', '10', '11:02').data;
    assert.deepEqual(r.data, typedByHand);
  });

  test('the last visible set asks for exercise rest', () => {
    assert.equal(applyUseLastForSet(fresh(), prev, 0, 'set3', T).rest, 'exercise');
  });

  test('weight-only fill has no timestamp, sequence or rest', () => {
    const typedRep = type(fresh(), 0, 'set2', '8', '08:00').data;
    const r = applyUseLastForSet(typedRep, prev, 0, 'set2', '12:00');
    assert.equal(r.filled, 1);
    assert.equal(r.rest, null);
    assert.equal(r.data.exerciseSets[0].set2Weight, '57.5');
    assert.equal(r.data.exerciseTimestamps[0].set2Time, '08:00');
  });

  test('no history means nothing happens', () => {
    const d = fresh();
    const r = applyUseLastForSet(d, undefined, 0, 'set1', T);
    assert.equal(r.filled, 0);
    assert.equal(r.data, d);
    assert.equal(r.rest, null);
  });

  test('exercise-level Use Last fills weights only: no timestamps, sequence or rest', () => {
    const r = applyUseLastWeights(fresh(), prev, 0, 3, '13:00');
    assert.equal(r.rest, null);
    assert.equal(r.filled, 4); // warm-up + 3 sets
    assert.deepEqual(
      [r.data.exerciseSets[0].warmupWeight, r.data.exerciseSets[0].set1Weight, r.data.exerciseSets[0].set2Weight, r.data.exerciseSets[0].set3Weight],
      ['20', '55', '57.5', '60'],
    );
    assert.equal(r.data.exerciseSets[0].set1, '');
    assert.deepEqual(r.data.exerciseTimestamps[0], {});
    assert.deepEqual(r.data.exerciseSequence, {});
    assert.equal(r.data.nextSequence, 1);
  });

  test('exercise-level Use Last only touches visible sets and skips typed weights', () => {
    const typed = type(fresh(), 0, 'set1Weight', '40').data;
    const r = applyUseLastWeights(typed, prev, 0, 2, T);
    assert.equal(r.data.exerciseSets[0].set1Weight, '40');
    assert.equal(r.data.exerciseSets[0].set2Weight, '57.5');
    assert.equal(r.data.exerciseSets[0].set3Weight, undefined);
  });

  test('visible last text', () => {
    assert.equal(formatLast({ reps: '10', weight: '102.5' }), '10 × 102.5 kg');
    assert.equal(formatLast({ reps: '10', weight: '' }), '10 reps');
    assert.equal(formatLast({ reps: '', weight: '' }), '');
  });
});

describe('keyboard flow', () => {
  test('Enter walks warm-up, then each set reps then weight, then stops', () => {
    const order = fieldOrder(2);
    assert.deepEqual(order, ['warmup', 'warmupWeight', 'set1', 'set1Weight', 'set2', 'set2Weight']);
    assert.equal(nextInOrder(order, 'warmupWeight'), 'set1');
    assert.equal(nextInOrder(order, 'set1Weight'), 'set2');
    assert.equal(nextInOrder(order, 'set2Weight'), null);
    assert.equal(nextInOrder<string>(order, 'set6x'), null);
  });
});

describe('restore and storage shape', () => {
  const started = new Date('2026-10-30T09:00:00.000Z');

  test('state written then restored is identical, including a running rest timer', () => {
    let data = type(fresh(3), 2, 'warmup', '5', '09:05').data;
    data = type(data, 2, 'set1Weight', '102.5').data;
    data = type(data, 2, 'set1', '8', '09:07').data;
    data = { ...data, exerciseNotes: { 2: 'felt strong' } };
    const rest = startRest('set', 60, Date.parse('2026-10-30T09:07:00.000Z'));
    const stored = buildActiveWorkoutState({
      templateId: 't1', templateName: 'Pull', exercises: ['Bench', 'Squat', 'Row'], startTime: started,
      data, previousSequences: { Row: 1 }, expandedExercise: 2, restTimer: serializeRestTimer(rest),
    });
    const roundTrip = JSON.parse(JSON.stringify(stored)) as ActiveWorkoutState;
    assert.deepEqual(restoreWorkoutData(roundTrip, 3), data);
    assert.deepEqual(roundTrip.restTimer, { remaining: 60, total: 60, type: 'set', startedAt: '2026-10-30T09:07:00.000Z' });
    assert.equal(roundTrip.startTime, '2026-10-30T09:00:00.000Z');
  });

  test('the stored rest timer does not change second to second', () => {
    const rest = startRest('exercise', 90, 1_000_000);
    assert.deepEqual(serializeRestTimer(rest), serializeRestTimer({ ...rest }));
    assert.equal(serializeRestTimer({ ...rest, status: 'over' }), null);
  });

  test('older and partial saved workouts still restore without losing data', () => {
    const legacy = {
      templateId: 't', templateName: 'Push', exercises: ['A', 'B'], startTime: started.toISOString(),
      exerciseSets: { 0: { set1: '10', set2: '', set3: '', set1Weight: '40' } },
      expandedExercise: 0, nextSequence: 2, exerciseSequence: { 0: 1 },
    } as unknown as ActiveWorkoutState;
    const d = restoreWorkoutData(legacy, 2);
    assert.equal(d.exerciseSets[0].set1, '10');
    assert.equal(d.exerciseSets[0].set1Weight, '40');
    assert.deepEqual(d.exerciseSets[1], { set1: '', set2: '', set3: '' }); // missing row gets an empty one
    assert.deepEqual(d.exerciseSequence, { 0: 1 });
    assert.equal(d.nextSequence, 2);
    assert.deepEqual(d.extraExercises, []);
    assert.deepEqual(d.exerciseSetCount, { 0: 3, 1: 3 });
  });

  test('garbage fields fall back to safe defaults', () => {
    const d = restoreWorkoutData({ exerciseSets: 'x', nextSequence: -4, extraExercises: 5 } as unknown as ActiveWorkoutState, 1);
    assert.deepEqual(d.exerciseSets, { 0: { set1: '', set2: '', set3: '' } });
    assert.equal(d.nextSequence, 1);
    assert.deepEqual(d.extraExercises, []);
  });

  test('saved set counts and extra exercises are kept', () => {
    const saved = { extraExercises: ['Curl'], exerciseSets: { 2: { set1: '12', set2: '', set3: '' } }, exerciseSetCount: { 0: 5 } } as unknown as ActiveWorkoutState;
    const d = restoreWorkoutData(saved, 2);
    assert.deepEqual(d.extraExercises, ['Curl']);
    assert.equal(d.exerciseSets[2].set1, '12');
    assert.equal(d.exerciseSetCount[0], 5);
    assert.equal(d.exerciseSetCount[1], 3);
  });
});

describe('saved notes format', () => {
  test('notes keep reps, weights, timestamps, sequence and notes, and read back', () => {
    const exercises = ['Bench', 'Squat'];
    let d = fresh(2);
    d = type(d, 1, 'warmup', '5', '09:00').data;
    d = type(d, 1, 'warmupWeight', '20').data;
    d = type(d, 1, 'set1Weight', '102.5').data;
    d = type(d, 1, 'set1', '8', '09:02').data;
    d = type(d, 0, 'set1', '10', '09:10').data;
    d = { ...d, exerciseNotes: { 1: 'deep [x] | fast' } };
    const entries = collectWorkoutEntries(exercises, d.exerciseSets, d.exerciseSequence, d.exerciseTimestamps, d.exerciseNotes, d.exerciseSetCount);
    const notes = formatWorkoutNotes(entries, '09:00', '09:30');
    assert.equal(notes, 'Start:09:00 End:09:30 | 1.Squat: W:5@20kg@09:00 S1:8@102.5kg@09:02 [note: deep x  fast] | 2.Bench: S1:10@09:10');
    const parsed = parseNotesToPreviousReps(notes.split(' | ').slice(1).join(' | '));
    assert.equal(parsed.reps.Squat.set1Weight, '102.5');
    assert.deepEqual(parsed.sequences, { Squat: 1, Bench: 2 });
  });
});
