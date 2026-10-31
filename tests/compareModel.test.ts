import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComparison,
  buildEntries,
  buildGymSetComparison,
  buildHeadline,
  CATEGORY_INFO,
  CATEGORY_TABLE,
  categoryAvailability,
  noticeCategories,
  tileCountText,
  computeDelta,
  describeGap,
  formatCompactDay,
  formatFullDay,
  gapPhrase,
  parseGymNotes,
  pruneSelection,
  resultsState,
  roundValue,
  selectionStatus,
  slotOf,
  swapSelection,
  toggleSelection,
} from '../src/components/compare/compareModel';

const KG = CATEGORY_INFO.weight.unit;
const CAL = CATEGORY_INFO.meals.unit;

describe('compare: picking records', () => {
  test('ticking adds up to two, then a third drops A and the old B becomes A', () => {
    assert.deepEqual(toggleSelection([], 'x'), ['x']);
    assert.deepEqual(toggleSelection(['x'], 'y'), ['x', 'y']);
    assert.deepEqual(toggleSelection(['x', 'y'], 'z'), ['y', 'z']);
  });
  test('unticking removes just that record and keeps the rest in order', () => {
    assert.deepEqual(toggleSelection(['x', 'y'], 'x'), ['y']);
    assert.deepEqual(toggleSelection(['x', 'y'], 'y'), ['x']);
  });
  test('toggling never mutates its input', () => {
    const picks = Object.freeze(['x', 'y']) as readonly string[];
    assert.deepEqual(toggleSelection(picks, 'z'), ['y', 'z']);
    assert.deepEqual([...picks], ['x', 'y']);
  });
  test('swap exchanges A and B only when both are picked', () => {
    assert.deepEqual(swapSelection(['x', 'y']), ['y', 'x']);
    assert.deepEqual(swapSelection(['x']), ['x']);
    assert.deepEqual(swapSelection([]), []);
  });
  test('slots follow pick order', () => {
    assert.equal(slotOf(['x', 'y'], 'x'), 'A');
    assert.equal(slotOf(['x', 'y'], 'y'), 'B');
    assert.equal(slotOf(['x', 'y'], 'z'), null);
  });
  test('a pick whose record vanished is dropped', () => {
    assert.deepEqual(pruneSelection(['x', 'y'], new Set(['y', 'q'])), ['y']);
  });
});

describe('compare: dates are calendar days, never shifted by the time zone', () => {
  test('a plain ISO day keeps its own date', () => {
    assert.equal(formatCompactDay('2026-10-30'), 'Oct 30, 2026');
    assert.equal(formatCompactDay('2026-01-01'), 'Jan 1, 2026');
    assert.equal(formatFullDay('2026-10-30'), 'Fri, Oct 30, 2026');
  });
  test('the formatter gives the same text whatever the process time zone', () => {
    const before = process.env.TZ;
    try {
      for (const tz of ['Pacific/Honolulu', 'UTC', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        assert.equal(formatCompactDay('2026-03-01'), 'Mar 1, 2026', tz);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
  test('an invalid day falls back to the raw text instead of "Invalid Date"', () => {
    assert.equal(formatCompactDay('not-a-date'), 'not-a-date');
    assert.equal(formatFullDay('2026-02-31'), '2026-02-31');
  });
  test('the gap is worded from A to B, across month and year ends', () => {
    assert.equal(describeGap('2026-10-23', '2026-10-30'), 'B is 7 days after A');
    assert.equal(describeGap('2026-10-30', '2026-10-29'), 'B is 1 day before A');
    assert.equal(describeGap('2026-10-30', '2026-10-30'), 'Both on the same day');
    assert.equal(describeGap('2025-12-31', '2026-01-01'), 'B is 1 day after A');
    assert.equal(describeGap('bad', '2026-01-01'), null);
    assert.equal(gapPhrase('2026-10-23', '2026-10-30'), '7 days later');
    assert.equal(gapPhrase('2026-10-30', '2026-10-29'), '1 day earlier');
    assert.equal(gapPhrase('2026-10-30', '2026-10-30'), 'on the same day');
  });
});

describe('compare: change is B minus A, neutral and exact', () => {
  test('direction, sign and unit', () => {
    const up = computeDelta(70, 70.5, KG)!;
    assert.equal(up.value, 0.5);
    assert.equal(up.direction, 'higher');
    assert.equal(up.text, '+0.5 kg');
    assert.equal(up.phrase, '0.5 kg higher');
    const down = computeDelta(300, 250, CAL)!;
    assert.equal(down.direction, 'lower');
    assert.equal(down.text, '\u221250 cal');
    assert.equal(down.phrase, '50 calories lower');
  });
  test('floating point noise is rounded away', () => {
    assert.equal(roundValue(70.5 - 70.2), 0.3);
    assert.equal(computeDelta(70.2, 70.5, KG)!.text, '+0.3 kg');
  });
  test('equal values (and values that only differ in noise) read as no change', () => {
    const same = computeDelta(70.1, 70.1, KG)!;
    assert.equal(same.direction, 'same');
    assert.equal(same.text, 'No change');
    assert.equal(computeDelta(0.1 + 0.2, 0.3, KG)!.direction, 'same');
  });
  test('a missing side gives no change at all, never a number built from 0', () => {
    assert.equal(computeDelta(null, 5, KG), null);
    assert.equal(computeDelta(5, undefined, KG), null);
    assert.equal(computeDelta(Number.NaN, 5, KG), null);
  });
  test('the wording never calls a direction good or bad', () => {
    const texts = [computeDelta(1, 2, KG)!, computeDelta(2, 1, KG)!, computeDelta(1, 1, KG)!].flatMap((d) => [d.text, d.word, d.phrase]).join(' ');
    assert.equal(/better|worse|improv|gain|loss|good|bad|great/i.test(texts), false);
    assert.equal(/better|worse|improv|good|bad/i.test(buildHeadline(CATEGORY_INFO.meals, computeDelta(1, 2, CAL), '2 days later')), false);
  });
});

const meal = (over = {}) => ({ id: 'm1', food: 'Oats', calories: 300, protein: 12, carbs: 50, time: '08:05:00', date: '2026-10-23', ...over });

describe('compare: building the comparison', () => {
  test('meals: calories lead, then food, time and macros, each with its unit', () => {
    const c = buildComparison('meals', meal(), meal({ id: 'm2', food: 'Eggs', calories: 420, protein: 30, carbs: null, time: '12:00', date: '2026-10-30' }));
    assert.deepEqual(c.primary, { label: 'Calories', a: '300 cal', b: '420 cal', delta: computeDelta(300, 420, CAL) });
    assert.equal(c.primary.delta!.text, '+120 cal');
    assert.equal(c.headline, 'B is 120 calories higher than A, 7 days later.');
    const byKey = Object.fromEntries(c.rows.map((r) => [r.key, r]));
    assert.equal(byKey.food.same, false);
    assert.equal(byKey.time.a, '08:05');
    assert.equal(byKey.protein.b, '30 g');
    assert.equal(byKey.protein.delta!.text, '+18 g');
    // Carbs were not logged on B: shown as such, no change invented.
    assert.equal(byKey.carbs.b, 'Not logged');
    assert.equal(byKey.carbs.delta, null);
  });
  test('weight: kg values, neutral headline, both days named', () => {
    const c = buildComparison('weight', { id: 'a', weight: 71, date: '2026-10-01' }, { id: 'b', weight: 70.4, date: '2026-10-29' });
    assert.equal(c.primary.a, '71 kg');
    assert.equal(c.primary.delta!.text, '\u22120.6 kg');
    assert.equal(c.headline, 'B is 0.6 kg lower than A, 28 days later.');
    assert.deepEqual(c.rows, []);
  });
  test('weight and sleep show a notes row only when a note exists', () => {
    const c = buildComparison('sleep', { id: 'a', hours: 7, date: '2026-10-01', notes: 'late coffee' }, { id: 'b', hours: 8, date: '2026-10-02' });
    assert.equal(c.rows.length, 1);
    assert.equal(c.rows[0].a, 'late coffee');
    assert.equal(c.rows[0].b, 'Not logged');
    assert.equal(c.primary.delta!.phrase, '1 hour higher');
  });
  test('identical values say so', () => {
    const c = buildComparison('sleep', { id: 'a', hours: 7.5, date: '2026-10-01' }, { id: 'b', hours: 7.5, date: '2026-10-01' });
    assert.equal(c.headline, 'Sleep is the same on both records, on the same day.');
  });
  test('gym: duration leads and the workout name is a row', () => {
    const c = buildComparison('gym', { id: 'a', exercise: 'Push', duration: 50, date: '2026-10-01' }, { id: 'b', exercise: 'Pull', duration: 45, date: '2026-10-03' });
    assert.equal(c.primary.delta!.text, '\u22125 min');
    assert.equal(c.rows[0].label, 'Workout');
    assert.equal(c.rows[0].same, false);
  });
  test('a missing primary value is not turned into a number', () => {
    const c = buildComparison('meals', meal({ calories: Number.NaN }), meal());
    assert.equal(c.primary.a, 'Not logged');
    assert.equal(c.primary.delta, null);
    assert.match(c.headline, /not logged on both records/);
  });
});

describe('compare: workout notes', () => {
  const notesA = 'Start:09:30 End:10:15 | 1.Bench press: W:5@20kg@09:31 S1:12@40kg@09:35 S2:10@40kg [note: felt heavy] | 2.Row: S1:10@30kg';
  const notesB = 'Start:18:00 End:18:50 | 1.Bench press: S1:12@42.5kg S2:10@40kg S3:8@40kg | 3.Curl: S1:12@10kg';

  test('parses timing, exercises in saved order, sets and notes', () => {
    const p = parseGymNotes(notesA);
    assert.equal(p.startTime, '09:30');
    assert.equal(p.endTime, '10:15');
    assert.deepEqual(p.exercises.map((e) => e.name), ['Bench press', 'Row']);
    assert.deepEqual(p.exercises[0].sets.map((s) => s.label), ['Warmup', 'Set 1', 'Set 2']);
    assert.equal(p.exercises[0].sets[1].weight, '40');
    assert.equal(p.exercises[0].sets[1].time, '09:35');
    assert.equal(p.exercises[0].note, 'felt heavy');
  });
  test('empty or missing notes parse to nothing', () => {
    assert.deepEqual(parseGymNotes(undefined), { exercises: [] });
    assert.deepEqual(parseGymNotes(''), { exercises: [] });
  });
  test('sets are matched by name and label, with signed changes and statuses', () => {
    const r = buildGymSetComparison(
      { id: 'a', exercise: 'Push', duration: 45, date: '2026-10-01', notes: notesA },
      { id: 'b', exercise: 'Push', duration: 50, date: '2026-10-08', notes: notesB },
    );
    assert.deepEqual(r.timing, { a: '09:30 / 10:15', b: '18:00 / 18:50' });
    const bench = r.exercises.find((e) => e.name === 'Bench press')!;
    assert.equal(bench.status, 'different');
    assert.deepEqual(bench.sets.map((s) => s.label), ['Warmup', 'Set 1', 'Set 2', 'Set 3']);
    const set1 = bench.sets.find((s) => s.label === 'Set 1')!;
    assert.equal(set1.same, false);
    assert.deepEqual(set1.changes, [{ text: '+2.5 kg', direction: 'higher' }]);
    assert.deepEqual(set1.a, ['12 reps', '@ 40 kg (09:35)']);
    const set2 = bench.sets.find((s) => s.label === 'Set 2')!;
    assert.equal(set2.same, true);
    assert.deepEqual(set2.changes, []);
    // A set only one side did is shown as "Not logged" on the other, never as zero.
    const set3 = bench.sets.find((s) => s.label === 'Set 3')!;
    assert.deepEqual(set3.a, ['Not logged']);
    assert.equal(set3.same, false);
    assert.equal(r.exercises.find((e) => e.name === 'Row')!.status, 'only-a');
    assert.equal(r.exercises.find((e) => e.name === 'Curl')!.status, 'only-b');
    assert.equal(bench.noteA, 'felt heavy');
  });
  test('identical workouts are all "same"', () => {
    const g = { id: 'a', exercise: 'Push', duration: 45, date: '2026-10-01', notes: notesA };
    const r = buildGymSetComparison(g, { ...g, id: 'b' });
    assert.equal(r.exercises.every((e) => e.status === 'same'), true);
  });
  test('workouts without saved sets give an empty list, not an error', () => {
    const r = buildGymSetComparison({ id: 'a', exercise: 'Run', duration: 30, date: '2026-10-01' }, { id: 'b', exercise: 'Run', duration: 35, date: '2026-10-02' });
    assert.deepEqual(r, { timing: null, exercises: [] });
  });
});

const state = (phase: 'loading' | 'ready' | 'error', refreshFailed = false) => ({ phase, loadFailed: phase === 'error', refreshFailed, error: null }) as const;
const allReady = () => ({ meals: state('ready'), gym: state('ready'), weight: state('ready'), sleep: state('ready') });

describe('compare: records and guidance', () => {
  const source = {
    meals: [meal()],
    gym: [{ id: 'g1', exercise: 'Push', duration: 45, date: '2026-10-01' }],
    weight: [{ id: 'w1', weight: 70.5, date: '2026-10-02', notes: 'morning' }],
    sleep: [{ id: 's1', hours: 7.5, date: '2026-10-03' }],
  };
  test('each metric lists its own records with the unit and date context', () => {
    assert.equal(buildEntries(null, source).length, 0);
    const meals = buildEntries('meals', source);
    assert.equal(meals[0].primary, 'Oats');
    assert.equal(meals[0].secondary, '300 cal · 08:05');
    assert.equal(buildEntries('gym', source)[0].secondary, '45 min');
    assert.equal(buildEntries('weight', source)[0].primary, '70.5 kg');
    assert.equal(buildEntries('sleep', source)[0].primary, '7.5 h');
    assert.equal(buildEntries('sleep', source)[0].summary, '7.5 hours');
  });
  test('every empty state names the next step', () => {
    assert.deepEqual(resultsState({ category: null, view: 'ready', recordCount: 0, pickedCount: 0 }), { kind: 'no-category' });
    assert.deepEqual(resultsState({ category: 'meals', view: 'loading', recordCount: 0, pickedCount: 0 }), { kind: 'loading' });
    assert.deepEqual(resultsState({ category: 'meals', view: 'ready', recordCount: 0, pickedCount: 0 }), { kind: 'no-records', category: 'meals' });
    assert.deepEqual(resultsState({ category: 'meals', view: 'ready', recordCount: 5, pickedCount: 0 }), { kind: 'needs-two', picked: 0 });
    assert.deepEqual(resultsState({ category: 'meals', view: 'ready', recordCount: 5, pickedCount: 1 }), { kind: 'needs-two', picked: 1 });
    assert.deepEqual(resultsState({ category: 'meals', view: 'ready', recordCount: 5, pickedCount: 2 }), { kind: 'ready' });
  });
  test('loading is never reported as "no records"', () => {
    assert.equal(resultsState({ category: 'gym', view: 'loading', recordCount: 0, pickedCount: 0 }).kind, 'loading');
  });
  test('the spoken status follows the picks', () => {
    const [a, b] = buildEntries('weight', { ...source, weight: [{ id: 'w1', weight: 70, date: '2026-10-02' }, { id: 'w2', weight: 71, date: '2026-10-09' }] });
    assert.match(selectionStatus([]), /0 of 2/);
    assert.match(selectionStatus([a]), /1 of 2 records selected: A is 70 kg on Oct 2, 2026/);
    assert.match(selectionStatus([a, b]), /2 of 2.*B is 71 kg on Oct 9, 2026.*ready/);
  });
});

describe('compare: loading vs failed vs empty vs stale', () => {
  test('each metric reads its own shared table', () => {
    assert.deepEqual(CATEGORY_TABLE, { meals: 'meals', gym: 'gym_sessions', weight: 'weight', sleep: 'sleep' });
  });
  test('a failed first load is "unavailable", never "no records" (even with zero rows and nothing loading)', () => {
    assert.deepEqual(resultsState({ category: 'weight', view: 'error', recordCount: 0, pickedCount: 0 }), { kind: 'unavailable', category: 'weight' });
    assert.deepEqual(resultsState({ category: 'weight', view: 'error', recordCount: 0, pickedCount: 2 }), { kind: 'unavailable', category: 'weight' });
    // The same zero rows after a SUCCESSFUL load really are empty.
    assert.deepEqual(resultsState({ category: 'weight', view: 'ready', recordCount: 0, pickedCount: 0 }), { kind: 'no-records', category: 'weight' });
  });
  test('availability follows each table: loading, error, ready and stale are four different things', () => {
    const a = categoryAvailability({ meals: state('loading'), gym: state('error'), weight: state('ready'), sleep: state('ready', true) });
    assert.deepEqual(a.meals, { view: 'loading', stale: false });
    assert.deepEqual(a.gym, { view: 'error', stale: false });
    assert.deepEqual(a.weight, { view: 'ready', stale: false });
    assert.deepEqual(a.sleep, { view: 'ready', stale: true });
  });
  test('a failed refresh keeps the rows usable: stale, not unavailable', () => {
    const a = categoryAvailability({ ...allReady(), weight: state('ready', true) });
    assert.equal(a.weight.view, 'ready');
    assert.equal(resultsState({ category: 'weight', view: a.weight.view, recordCount: 3, pickedCount: 2 }).kind, 'ready');
  });
  test('tiles never call a failed or loading source empty', () => {
    const ready = { view: 'ready', stale: false } as const;
    assert.equal(tileCountText('weight', 0, ready), 'None logged yet');
    assert.equal(tileCountText('weight', 1, ready), '1 weigh-in');
    assert.equal(tileCountText('weight', 15, ready), '15 weigh-ins');
    assert.equal(tileCountText('weight', 0, { view: 'error', stale: false }), "Couldn't load");
    assert.equal(tileCountText('weight', undefined, { view: 'error', stale: false }), "Couldn't load");
    assert.equal(tileCountText('weight', 0, { view: 'loading', stale: false }), 'Loading…');
    assert.equal(tileCountText('weight', undefined, ready), 'Loading…');
    // Stale rows keep their count.
    assert.equal(tileCountText('weight', 4, { view: 'ready', stale: true }), '4 weigh-ins');
  });
  test('the page notice skips the open failed metric (step 2 explains it) but names others and every stale one', () => {
    const a = categoryAvailability({ meals: state('error'), gym: state('error'), weight: state('ready', true), sleep: state('ready') });
    assert.deepEqual(noticeCategories(a, null), { failed: ['meals', 'gym'], stale: ['weight'] });
    assert.deepEqual(noticeCategories(a, 'meals'), { failed: ['gym'], stale: ['weight'] });
    // An open stale metric stays in the notice: its rows are still shown and may be old.
    assert.deepEqual(noticeCategories(a, 'weight'), { failed: ['meals', 'gym'], stale: ['weight'] });
    assert.deepEqual(noticeCategories(categoryAvailability(allReady()), 'meals'), { failed: [], stale: [] });
  });
});
