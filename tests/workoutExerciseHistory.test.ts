import { describe, it, expect } from 'bun:test';
import { parseWorkoutNotes } from '../src/lib/workoutNotes';
import { normalizeAliases } from '../src/lib/exerciseAliases';
import { buildExerciseHistory, exerciseHistoryTargets, isWeightedExercise } from '../src/lib/workoutExerciseHistory';
import { exerciseHistory } from '../src/lib/workoutStats';

const NOTES = 'Start:18:00 End:18:55 | 1.Bench press: W:5@20kg S1:12@40kg@18:10 S2:10@40kg | 2.Pull-ups: S1:8 S2:7 | 3.Seated Row: S1:10@60kg | 4.Plank: W:1@5kg | 5.Curl: S1:12@15kg [note: easy]';
const session = (id: string, date: string, notes: string, extra: Record<string, unknown> = {}) => ({ id, exercise: 'Day', date, notes, ...extra });
const none = normalizeAliases({});

describe('isWeightedExercise', () => {
  const parsed = parseWorkoutNotes(NOTES);
  it('needs a working set with reps and a weight', () => {
    expect(parsed.exercises.map(isWeightedExercise)).toEqual([true, false, true, false, true]);
  });
});

describe('exerciseHistoryTargets (original indexes, unweighted suppressed)', () => {
  const s = session('s1', '2026-10-01', NOTES);
  const parsed = parseWorkoutNotes(NOTES);
  const aliases = normalizeAliases({ 'Seated Row': 'Cable Row' });
  const targets = exerciseHistoryTargets(s, parsed, aliases);

  it('has one entry per saved exercise with its saved index, even when others are not openable', () => {
    expect(targets.map((t) => t.index)).toEqual([0, 1, 2, 3, 4]);
    expect(targets.map((t) => t.name)).toEqual(parsed.exercises.map((e) => e.name));
    expect(targets.map((t) => t.openable)).toEqual([true, false, true, false, true]);
  });
  it('bodyweight and warm-up-only exercises are not openable', () => {
    expect(targets[1].openable).toBe(false); // Pull-ups, no weight
    expect(targets[3].openable).toBe(false); // Plank, warm-up only
  });
  it('shows the merged name an exercise is counted under', () => {
    expect(targets[2]).toMatchObject({ name: 'Seated Row', canonical: 'Cable Row', openable: true });
  });
  it('does not reorder or mutate the parsed workout', () => {
    const before = JSON.stringify(parsed);
    exerciseHistoryTargets(s, parsed, aliases);
    expect(JSON.stringify(parsed)).toBe(before);
    expect(parsed.exercises[0].sets.map((x) => [x.label, x.reps, x.weightKg, x.time])).toEqual([['W', 5, 20, null], [1, 12, 40, '18:10'], [2, 10, 40, null]]);
  });
  it('a name the records code would split differently is not offered (no dead-end dialog)', () => {
    const notes = '1.Press: incline: S1:8@30kg';
    const t = exerciseHistoryTargets(session('c', '2026-10-01', notes), parseWorkoutNotes(notes), none);
    expect(t).toHaveLength(1);
    expect(t[0].openable).toBe(false);
  });
  it('a workout with no notes has no targets', () => {
    expect(exerciseHistoryTargets({ id: 'x', exercise: 'Jog', date: '2026-10-01' }, parseWorkoutNotes(undefined), none)).toEqual([]);
  });
});

describe('buildExerciseHistory', () => {
  const sessions = [
    session('b', '2026-10-08', '1.Cable Row: S1:10@55kg'),
    session('a', '2026-10-01', '1.Seated Row: S1:10@60kg S2:8@60kg | 2.Cable Row: S1:10@50kg'),
    session('c', '2026-10-08', '1.Cable Row: S1:8@57.5kg', { start_time: '19:00' }),
    session('n', '2026-10-09', 'just a note'),
  ];
  const aliases = normalizeAliases({ 'Seated Row': 'Cable Row' });

  it('same-name aliases merge into one oldest-first timeline, matching the Records numbers', () => {
    const view = buildExerciseHistory(sessions, 'Cable Row', aliases);
    expect(view.entries.map((e) => [e.sessionId, e.date, e.topWeight])).toEqual([['a', '2026-10-01', 60], ['b', '2026-10-08', 55], ['c', '2026-10-08', 57.5]]);
    expect(view.names).toEqual(['Cable Row', 'Seated Row']);
    // identical to the shared stats helper for the same input
    const expected = exerciseHistory(sessions, 'Cable Row', aliases).map((e) => [e.date, e.topWeight, e.volume]);
    expect(view.entries.map((e) => [e.date, e.topWeight, e.volume]).sort()).toEqual([...expected].sort());
  });
  it('asking for a merged name shows the kept name and says what was asked', () => {
    const view = buildExerciseHistory(sessions, 'Seated Row', aliases);
    expect(view.exercise).toBe('Cable Row');
    expect(view.requestedAs).toBe('Seated Row');
    expect(view.entries).toHaveLength(3);
    expect(buildExerciseHistory(sessions, 'Cable Row', aliases).requestedAs).toBeNull();
  });
  it('without the merge, the other name is a separate history', () => {
    expect(buildExerciseHistory(sessions, 'Cable Row', none).entries.map((e) => e.sessionId)).toEqual(['a', 'b', 'c']);
    expect(buildExerciseHistory(sessions, 'Seated Row', none).entries.map((e) => e.sessionId)).toEqual(['a']);
  });
  it('no history: empty entries, no origin', () => {
    const view = buildExerciseHistory(sessions, 'Deadlift', none, { sessionId: 'a' });
    expect(view.entries).toEqual([]);
    expect(view.originIndex).toBe(-1);
  });
  it('marks the exact session, never another one on the same date', () => {
    const view = buildExerciseHistory(sessions, 'Cable Row', aliases, { sessionId: 'c', date: '2026-10-08' });
    expect(view.entries.map((e) => [e.sessionId, e.isOrigin])).toEqual([['a', false], ['b', false], ['c', true]]);
    const other = buildExerciseHistory(sessions, 'Cable Row', aliases, { sessionId: 'b', date: '2026-10-08' });
    expect(other.entries.filter((e) => e.isOrigin).map((e) => e.sessionId)).toEqual(['b']);
  });
  it('orders same-date workouts by start time, then input order', () => {
    const view = buildExerciseHistory([
      session('late', '2026-10-08', '1.Cable Row: S1:5@80kg', { start_time: '19:00' }),
      session('early', '2026-10-08', '1.Cable Row: S1:5@70kg', { start_time: '07:30' }),
    ], 'Cable Row', none);
    expect(view.entries.map((e) => e.sessionId)).toEqual(['early', 'late']);
  });
  it('a date alone marks only when exactly one workout has it', () => {
    expect(buildExerciseHistory(sessions, 'Cable Row', aliases, { date: '2026-10-01' }).originIndex).toBe(0);
    const ambiguous = buildExerciseHistory(sessions, 'Cable Row', aliases, { date: '2026-10-08' });
    expect(ambiguous.originIndex).toBe(-1);
    expect(ambiguous.originAmbiguous).toBe(true);
    expect(ambiguous.entries.some((e) => e.isOrigin)).toBe(false);
  });
  it('an unknown session id marks nothing', () => {
    expect(buildExerciseHistory(sessions, 'Cable Row', aliases, { sessionId: 'zzz', date: '2026-10-01' }).entries.some((e) => e.isOrigin)).toBe(false);
  });
  it('does not change the sessions it reads', () => {
    const copy = JSON.stringify(sessions);
    buildExerciseHistory(sessions, 'Cable Row', aliases, { sessionId: 'a' });
    expect(JSON.stringify(sessions)).toBe(copy);
  });
});
