import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { exercisePreview, parseWorkoutNotes, workoutNoteStats } from '../src/lib/workoutNotes';

const FULL =
  'Start:09:30 End:10:15 | 1.Bench press: W:5@20kg@09:31 S1:12@40kg@09:35 S2:10@40kg@09:38 S3:8@42.5kg [note: felt heavy] | 2.Pull-ups: S1:8 S2:7 S3:6';

describe('workout notes parser: the saved format', () => {
  const parsed = parseWorkoutNotes(FULL);

  test('reads the timing part and every exercise in saved order', () => {
    assert.equal(parsed.startTime, '09:30');
    assert.equal(parsed.endTime, '10:15');
    assert.deepEqual(parsed.exercises.map((e) => [e.seq, e.name]), [[1, 'Bench press'], [2, 'Pull-ups']]);
    assert.deepEqual(parsed.unparsed, []);
    assert.equal(parsed.complete, true);
  });
  test('sets: warm-up, reps, weight and quiet time are separate fields', () => {
    const [bench] = parsed.exercises;
    assert.deepEqual(bench.sets[0], { label: 'W', warmup: true, reps: 5, weightKg: 20, time: '09:31' });
    assert.deepEqual(bench.sets[1], { label: 1, warmup: false, reps: 12, weightKg: 40, time: '09:35' });
    assert.deepEqual(bench.sets[3], { label: 3, warmup: false, reps: 8, weightKg: 42.5, time: null });
    assert.equal(bench.note, 'felt heavy');
  });
  test('a set with a time but no weight is not misread as a weight', () => {
    const p = parseWorkoutNotes('1.Row: S1:10@09:41 S2:10');
    assert.deepEqual(p.exercises[0].sets[0], { label: 1, warmup: false, reps: 10, weightKg: null, time: '09:41' });
    assert.equal(p.complete, true);
  });
  test('sets without a weight are kept as null weight, not 0', () => {
    const pullups = parsed.exercises[1];
    assert.deepEqual(pullups.sets.map((s) => s.weightKg), [null, null, null]);
  });
  test('comma decimals and single-digit clocks are accepted', () => {
    const p = parseWorkoutNotes('Start:9:05 End:9:50 | 1.Curl: S1:10@12,5kg@9:10');
    assert.equal(p.startTime, '09:05');
    assert.equal(p.exercises[0].sets[0].weightKg, 12.5);
    assert.equal(p.exercises[0].sets[0].time, '09:10');
  });
  test('exercise names may contain colons', () => {
    const p = parseWorkoutNotes('1.Bench: close grip: S1:10@40kg');
    assert.equal(p.exercises[0].name, 'Bench: close grip');
    assert.equal(p.exercises[0].sets[0].reps, 10);
  });
  test('legacy notes without numbering or timing parse; the 999 placeholder is not shown as a number', () => {
    const p = parseWorkoutNotes('Squat: S1:5@100kg S2:5@100kg | 999.Plank: S1:60');
    assert.deepEqual(p.exercises.map((e) => [e.seq, e.name]), [[null, 'Squat'], [null, 'Plank']]);
    assert.equal(p.complete, true);
  });
});

describe('workout notes parser: boundaries and fallbacks', () => {
  test('empty, blank and missing notes are not "complete" and have no stats', () => {
    for (const value of [undefined, null, '', '   ']) {
      const p = parseWorkoutNotes(value);
      assert.deepEqual([p.exercises.length, p.unparsed.length, p.complete], [0, 0, false]);
      assert.equal(workoutNoteStats(p), null);
    }
  });
  test('free text is preserved verbatim as unparsed and yields no counts', () => {
    const p = parseWorkoutNotes('Felt great, short on time');
    assert.deepEqual(p.unparsed, ['Felt great, short on time']);
    assert.equal(p.complete, false);
    assert.equal(workoutNoteStats(p), null);
  });
  test('a part that is not understood is kept, and counts are withheld instead of being wrong', () => {
    const p = parseWorkoutNotes('1.Bench: S1:10@40kg | 2.Mystery: S1:ten@forty | Cardio 20 min');
    assert.deepEqual(p.exercises.map((e) => e.name), ['Bench']);
    assert.deepEqual(p.unparsed, ['2.Mystery: S1:ten@forty', 'Cardio 20 min']);
    assert.equal(p.complete, false);
    assert.equal(workoutNoteStats(p), null);
    // The preview can still name what was understood.
    assert.equal(exercisePreview(p), 'Bench');
  });
  test('an unknown token inside a set list sends the whole exercise to the fallback', () => {
    const p = parseWorkoutNotes('1.Bench: S1:10@40kg S2:10@40lb');
    assert.equal(p.exercises.length, 0);
    assert.equal(p.unparsed.length, 1);
  });
  test('timing-only notes are understood but have no exercise stats', () => {
    const p = parseWorkoutNotes('Start:07:00 End:07:45');
    assert.equal(p.complete, true);
    assert.equal(workoutNoteStats(p), null);
  });
  test('notes inside brackets keep their text and an empty note is dropped', () => {
    const p = parseWorkoutNotes('1.Row: S1:10@50kg [note: ] | 2.Curl: S1:10@10kg [note: slow reps]');
    assert.equal(p.exercises[0].note, null);
    assert.equal(p.exercises[1].note, 'slow reps');
  });
});

describe('workout note stats: volume only where it can be calculated', () => {
  test('volume = reps x kg over working sets with both; warm-ups excluded', () => {
    const stats = workoutNoteStats(parseWorkoutNotes(FULL));
    // 12x40 + 10x40 + 8x42.5 = 480 + 400 + 340 = 1220; pull-ups have no weight.
    assert.deepEqual(stats, { exerciseCount: 2, setCount: 6, volumeKg: 1220, volumePartial: true });
  });
  test('fully weighted workout is not partial', () => {
    const stats = workoutNoteStats(parseWorkoutNotes('1.Squat: S1:5@100kg S2:5@100kg S3:5@100kg'));
    assert.deepEqual(stats, { exerciseCount: 1, setCount: 3, volumeKg: 1500, volumePartial: false });
  });
  test('no weights anywhere: volume is null (omitted), never 0', () => {
    const stats = workoutNoteStats(parseWorkoutNotes('1.Push-ups: S1:20 S2:18 S3:15'));
    assert.deepEqual(stats, { exerciseCount: 1, setCount: 3, volumeKg: null, volumePartial: false });
  });
  test('a warm-up only exercise adds no sets and no volume', () => {
    const stats = workoutNoteStats(parseWorkoutNotes('1.Bar: W:10@20kg | 2.Bench: S1:5@60kg'));
    assert.deepEqual(stats, { exerciseCount: 2, setCount: 1, volumeKg: 300, volumePartial: false });
  });
  test('volume is rounded to one decimal', () => {
    const stats = workoutNoteStats(parseWorkoutNotes('1.Fly: S1:7@12.5kg S2:7@12.5kg S3:7@12.5kg'));
    assert.equal(stats?.volumeKg, 262.5);
  });
});

describe('exercise preview', () => {
  test('first three names then "+N"', () => {
    const p = parseWorkoutNotes('1.A: S1:1@1kg | 2.B: S1:1@1kg | 3.C: S1:1@1kg | 4.D: S1:1@1kg | 5.E: S1:1@1kg');
    assert.equal(exercisePreview(p), 'A, B, C +2');
    assert.equal(exercisePreview(parseWorkoutNotes('1.A: S1:1@1kg')), 'A');
    assert.equal(exercisePreview(parseWorkoutNotes('')), null);
  });
});
