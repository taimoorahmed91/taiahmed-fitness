// Pure active-workout logic: stored shape, set entry rules, "Use last", restore
// and note formatting. No React, no storage, no clock reads, so every rule here
// is unit tested. Exercise data is always keyed by the ORIGINAL exercise index;
// anything shown in a different order goes through workoutExerciseOrder.
import { PersistedRestTimer, RestType } from './workoutTiming';

export interface ExerciseSets {
  warmup?: string;
  warmupWeight?: string;
  set1: string;
  set2: string;
  set3: string;
  set4?: string;
  set5?: string;
  set6?: string;
  set1Weight?: string;
  set2Weight?: string;
  set3Weight?: string;
  set4Weight?: string;
  set5Weight?: string;
  set6Weight?: string;
}

export interface ExerciseTimestamps {
  warmupTime?: string;
  set1Time?: string;
  set2Time?: string;
  set3Time?: string;
  set4Time?: string;
  set5Time?: string;
  set6Time?: string;
}

export type SetKey = 'warmup' | 'set1' | 'set2' | 'set3' | 'set4' | 'set5' | 'set6';
export type WeightKey =
  | 'warmupWeight' | 'set1Weight' | 'set2Weight' | 'set3Weight' | 'set4Weight' | 'set5Weight' | 'set6Weight';
export type AnyExerciseKey = SetKey | WeightKey;

export interface ExerciseSequence {
  [exerciseIndex: number]: number; // 1-based order the exercise was started in
}

export interface PreviousReps {
  [exerciseName: string]: ExerciseSets;
}

export const MIN_SETS = 3;
export const MAX_SETS = 6;

/** Everything the user has entered so far. Same fields as the stored workout. */
export interface WorkoutData {
  extraExercises: string[];
  exerciseSets: Record<number, ExerciseSets>;
  exerciseTimestamps: Record<number, ExerciseTimestamps>;
  exerciseSequence: ExerciseSequence;
  nextSequence: number;
  exerciseNotes: Record<number, string>;
  exerciseSetCount: Record<number, number>;
}

/** The localStorage shape. Unchanged: older saved workouts keep restoring. */
export interface ActiveWorkoutState extends WorkoutData {
  templateId: string;
  templateName: string;
  exercises: string[];
  startTime: string;
  previousSequences?: Record<string, number>;
  expandedExercise: number | null;
  restTimer?: PersistedRestTimer | null;
}

type Dict = Record<string, string | undefined>;
const asDict = (v: unknown) => v as Dict | undefined;

export const emptySets = (): ExerciseSets => ({ set1: '', set2: '', set3: '' });

export const initialWorkoutData = (exerciseCount: number): WorkoutData => {
  const exerciseSets: Record<number, ExerciseSets> = {};
  const exerciseTimestamps: Record<number, ExerciseTimestamps> = {};
  const exerciseSetCount: Record<number, number> = {};
  for (let i = 0; i < exerciseCount; i++) {
    exerciseSets[i] = emptySets();
    exerciseTimestamps[i] = {};
    exerciseSetCount[i] = MIN_SETS;
  }
  return { extraExercises: [], exerciseSets, exerciseTimestamps, exerciseSequence: {}, nextSequence: 1, exerciseNotes: {}, exerciseSetCount };
};

// Extract the leading numeric weight value from an exercise name (e.g. "60kg Bench Press" -> "60")
export const extractWeightFromExerciseName = (name: string): string => {
  const match = name.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : '';
};

export const setKeyFor = (n: number): SetKey => `set${n}` as SetKey;
export const weightKeyFor = (key: SetKey): WeightKey => `${key}Weight` as WeightKey;
const weightKey = weightKeyFor;
export const timeKeyFor = (key: SetKey): keyof ExerciseTimestamps => `${key}Time` as keyof ExerciseTimestamps;

export const hasAnySet = (sets: ExerciseSets | undefined): boolean =>
  !!sets && !!(sets.warmup || sets.set1 || sets.set2 || sets.set3 || sets.set4 || sets.set5 || sets.set6);

// ---------------------------------------------------------------------------
// Entering values
// ---------------------------------------------------------------------------

/** Same input rules the fields always had. Returns null for a rejected value. */
export const normalizeSetInput = (key: AnyExerciseKey, value: string): string | null => {
  let next = value;
  // Weight fields accept a comma as the decimal separator.
  if (key.endsWith('Weight')) next = next.replace(',', '.');
  if (next && !/^\d*\.?\d*$/.test(next)) return null;
  return next;
};

/** HH:mm exactly as the stored notes have always stamped it. */
export const formatHHMM = (d: Date): string =>
  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

export interface SetUpdateResult {
  data: WorkoutData;
  /** Rest timer to start, if this entry finished a set. */
  rest: RestType | null;
}

/**
 * The one place a value enters the workout (typing and Use Last both land here).
 *  - A REP value that was empty and is now filled stamps that set's time, assigns the
 *    exercise's sequence number (first warm-up/set 1 only) and asks for a rest timer:
 *    warm-up and middle sets rest "set", the last visible set rests "exercise".
 *  - Weights and edits to an already-filled rep never stamp or start rest.
 */
export const applySetUpdate = (
  data: WorkoutData,
  update: { index: number; key: AnyExerciseKey; value: string; time: string },
): SetUpdateResult => {
  const { index, key, time } = update;
  const value = normalizeSetInput(key, update.value);
  if (value === null) return { data, rest: null };

  const current = asDict(data.exerciseSets[index])?.[key] || '';
  if (current === value) return { data, rest: null };

  const isWeight = key.endsWith('Weight');
  const repKey = (isWeight ? key.replace('Weight', '') : key) as SetKey;

  const next: WorkoutData = {
    ...data,
    exerciseSets: { ...data.exerciseSets, [index]: { ...data.exerciseSets[index], [key]: value } as ExerciseSets },
  };

  if (isWeight || current || !value) return { data: next, rest: null };

  // A rep value was newly entered.
  next.exerciseTimestamps = {
    ...data.exerciseTimestamps,
    [index]: { ...data.exerciseTimestamps[index], [timeKeyFor(repKey)]: time },
  };
  if ((repKey === 'warmup' || repKey === 'set1') && data.exerciseSequence[index] === undefined) {
    next.exerciseSequence = { ...data.exerciseSequence, [index]: data.nextSequence };
    next.nextSequence = data.nextSequence + 1;
  }

  let rest: RestType = 'set';
  if (repKey !== 'warmup') {
    const setNum = parseInt(repKey.replace('set', ''), 10);
    const lastSet = data.exerciseSetCount[index] || MIN_SETS;
    rest = setNum >= lastSet ? 'exercise' : 'set';
  }
  return { data: next, rest };
};

export const addVisibleSet = (data: WorkoutData, index: number): WorkoutData => {
  const current = data.exerciseSetCount[index] || MIN_SETS;
  if (current >= MAX_SETS) return data;
  return { ...data, exerciseSetCount: { ...data.exerciseSetCount, [index]: current + 1 } };
};

/** Adds a session-only exercise at the end. Existing indexes never move. */
export const addExtraExercise = (data: WorkoutData, templateCount: number, name: string): { data: WorkoutData; index: number } => {
  const index = templateCount + data.extraExercises.length;
  return {
    index,
    data: {
      ...data,
      extraExercises: [...data.extraExercises, name],
      exerciseSets: { ...data.exerciseSets, [index]: emptySets() },
      exerciseTimestamps: { ...data.exerciseTimestamps, [index]: {} },
      exerciseSetCount: { ...data.exerciseSetCount, [index]: MIN_SETS },
    },
  };
};

// ---------------------------------------------------------------------------
// Use last
// ---------------------------------------------------------------------------

export interface LastSetValues {
  reps: string;
  weight: string;
}

/** What the previous session logged for this set. Empty strings when nothing was logged. */
export const lastForSet = (previous: ExerciseSets | undefined, key: SetKey): LastSetValues => {
  const p = asDict(previous);
  return { reps: p?.[key] || '', weight: p?.[weightKey(key)] || '' };
};

/** Short visible text: "10 × 55 kg", "10 reps" or "55 kg". Empty when there is no history. */
export const formatLast = (last: LastSetValues): string => {
  if (last.reps && last.weight) return `${last.reps} × ${last.weight} kg`;
  if (last.reps) return `${last.reps} reps`;
  if (last.weight) return `${last.weight} kg`;
  return '';
};

/** Spoken/long form for button labels: "10 reps × 55 kg". */
export const describeLast = (last: LastSetValues): string => {
  if (last.reps && last.weight) return `${last.reps} reps × ${last.weight} kg`;
  if (last.reps) return `${last.reps} reps`;
  if (last.weight) return `${last.weight} kg`;
  return '';
};

/**
 * Which empty fields of one set Use Last would fill. It never overwrites something
 * the user already typed, so tapping it twice, or after editing, is harmless.
 */
export const planUseLastForSet = (
  current: ExerciseSets | undefined,
  previous: ExerciseSets | undefined,
  key: SetKey,
): { key: AnyExerciseKey; value: string }[] => {
  const last = lastForSet(previous, key);
  const now = asDict(current);
  const plan: { key: AnyExerciseKey; value: string }[] = [];
  if (last.weight && !now?.[weightKey(key)]) plan.push({ key: weightKey(key), value: last.weight });
  if (last.reps && !now?.[key]) plan.push({ key, value: last.reps });
  return plan;
};

export interface UseLastResult extends SetUpdateResult {
  filled: number;
}

/**
 * Use Last for one set. Goes through applySetUpdate, so a filled rep is stamped with
 * the time it was tapped, takes the exercise's sequence number and starts the right
 * rest timer, exactly as if the rep had been typed. A filled weight alone does neither.
 */
export const applyUseLastForSet = (
  data: WorkoutData,
  previous: ExerciseSets | undefined,
  index: number,
  key: SetKey,
  time: string,
): UseLastResult => {
  let working = data;
  let rest: RestType | null = null;
  const plan = planUseLastForSet(data.exerciseSets[index], previous, key);
  for (const step of plan) {
    const r = applySetUpdate(working, { index, key: step.key, value: step.value, time });
    working = r.data;
    rest = r.rest ?? rest;
  }
  return { data: working, rest, filled: plan.length };
};

/** Empty weight fields of the visible sets that the previous session had a weight for. */
export const planUseLastWeights = (
  current: ExerciseSets | undefined,
  previous: ExerciseSets | undefined,
  visibleSets: number,
): { key: WeightKey; value: string }[] => {
  const keys: SetKey[] = ['warmup', ...Array.from({ length: visibleSets }, (_, i) => setKeyFor(i + 1))];
  const now = asDict(current);
  const prev = asDict(previous);
  const plan: { key: WeightKey; value: string }[] = [];
  for (const k of keys) {
    const wk = weightKey(k);
    if (prev?.[wk] && !now?.[wk]) plan.push({ key: wk, value: prev[wk] as string });
  }
  return plan;
};

/**
 * Use Last weights for a whole exercise. Weights only: filling every rep at once would
 * stamp all the sets with one time and start rest timers for sets that were never done.
 */
export const applyUseLastWeights = (
  data: WorkoutData,
  previous: ExerciseSets | undefined,
  index: number,
  visibleSets: number,
  time: string,
): UseLastResult => {
  let working = data;
  const plan = planUseLastWeights(data.exerciseSets[index], previous, visibleSets);
  for (const step of plan) working = applySetUpdate(working, { index, key: step.key, value: step.value, time }).data;
  return { data: working, rest: null, filled: plan.length };
};

// ---------------------------------------------------------------------------
// Keyboard flow
// ---------------------------------------------------------------------------

/** Field order inside one exercise: warm-up reps, warm-up kg, set 1 reps, set 1 kg, ... */
export const fieldOrder = (visibleSets: number): AnyExerciseKey[] => {
  const order: AnyExerciseKey[] = ['warmup', 'warmupWeight'];
  for (let n = 1; n <= visibleSets; n++) order.push(setKeyFor(n), weightKeyFor(setKeyFor(n)));
  return order;
};

/** The field Enter should move to, or null after the last one (the keyboard is then dismissed). */
export const nextInOrder = <T,>(order: readonly T[], current: T): T | null => {
  const i = order.indexOf(current);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
};

/** DOM id of the input behind a field key ('set2' is the reps box, 'set2Weight' the kg box). `prefix` names the screen. */
export const fieldInputId = (prefix: string, index: number, key: AnyExerciseKey): string =>
  key.endsWith('Weight') ? `${prefix}-${index}-${key.replace('Weight', '')}-weight` : `${prefix}-${index}-${key}-reps`;

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Rebuilds in-progress data from a stored workout. Tolerates missing or odd fields from
 * older versions, and gives exercises that have no entry yet (template grew while paused)
 * empty rows. It never reorders, drops or rewrites anything that was saved.
 */
export const restoreWorkoutData = (saved: Partial<ActiveWorkoutState>, templateExerciseCount: number): WorkoutData => {
  const extraExercises = Array.isArray(saved.extraExercises) ? saved.extraExercises.filter((x) => typeof x === 'string') : [];
  const total = templateExerciseCount + extraExercises.length;
  const base = initialWorkoutData(total);
  const exerciseSets = { ...base.exerciseSets, ...(isRecord(saved.exerciseSets) ? (saved.exerciseSets as Record<number, ExerciseSets>) : {}) };
  const exerciseTimestamps = { ...base.exerciseTimestamps, ...(isRecord(saved.exerciseTimestamps) ? (saved.exerciseTimestamps as Record<number, ExerciseTimestamps>) : {}) };
  const exerciseSetCount = { ...base.exerciseSetCount, ...(isRecord(saved.exerciseSetCount) ? (saved.exerciseSetCount as Record<number, number>) : {}) };
  return {
    extraExercises,
    exerciseSets,
    exerciseTimestamps,
    exerciseSequence: isRecord(saved.exerciseSequence) ? (saved.exerciseSequence as ExerciseSequence) : {},
    nextSequence: Number(saved.nextSequence) > 0 ? Number(saved.nextSequence) : 1,
    exerciseNotes: isRecord(saved.exerciseNotes) ? (saved.exerciseNotes as Record<number, string>) : {},
    exerciseSetCount,
  };
};

// ---------------------------------------------------------------------------
// Entries / notes
// ---------------------------------------------------------------------------

export interface WorkoutEntry {
  exercise: string;
  index: number;
  seq: number;
  sets?: ExerciseSets;
  ts?: ExerciseTimestamps;
  setCount: number;
  note?: string;
}

/** Exercises with recorded data, ordered by sequence number. Original indexes are kept. */
export const collectWorkoutEntries = (
  allExercises: string[],
  exerciseSets: Record<number, ExerciseSets>,
  exerciseSequence: ExerciseSequence,
  exerciseTimestamps: Record<number, ExerciseTimestamps>,
  exerciseNotes: Record<number, string>,
  exerciseSetCount: Record<number, number>,
): WorkoutEntry[] => {
  const entries: WorkoutEntry[] = [];
  allExercises.forEach((exercise, index) => {
    const sets = exerciseSets[index];
    if (hasAnySet(sets)) {
      entries.push({
        exercise,
        index,
        seq: exerciseSequence[index] ?? 999,
        sets,
        ts: exerciseTimestamps[index],
        setCount: exerciseSetCount[index] || MIN_SETS,
        note: exerciseNotes[index]?.trim() || undefined,
      });
    }
  });
  entries.sort((a, b) => a.seq - b.seq);
  return entries;
};

/** Readable multi-line set details for the debrief "Copy details" button. */
export const formatSetLines = (entry: WorkoutEntry): string[] => {
  const sets = entry.sets;
  const ts = entry.ts;
  if (!sets) return [];
  const lines: string[] = [];
  const push = (label: string, reps?: string, weight?: string, time?: string) => {
    if (!reps) return;
    const bits = [`${reps} reps`];
    if (weight) bits.push(`@ ${weight} kg`);
    if (time) bits.push(`at ${time}`);
    lines.push(`   ${label}: ${bits.join(' ')}`);
  };
  push('Warm-up', sets.warmup, sets.warmupWeight, ts?.warmupTime);
  const setMap = asDict(sets)!;
  for (let n = 1; n <= entry.setCount; n++) {
    push(`Set ${n}`, setMap[`set${n}`], setMap[`set${n}Weight`], asDict(ts)?.[`set${n}Time`]);
  }
  return lines;
};

/** The compact saved-session notes string: "Start:HH:mm End:HH:mm | 1.Bench: W:5@20kg@10:01 S1:..." */
export const formatWorkoutNotes = (entries: WorkoutEntry[], startTimeStr: string, endTimeStr: string): string => {
  const lines: string[] = [`Start:${startTimeStr} End:${endTimeStr}`];
  entries.forEach((entry) => {
    const sets = asDict(entry.sets)!;
    const ts = asDict(entry.ts);
    const warmupReps = sets.warmup;
    const warmup = warmupReps
      ? `W:${warmupReps}${sets.warmupWeight ? `@${sets.warmupWeight}kg` : ''}${ts?.warmupTime ? `@${ts.warmupTime}` : ''}`
      : null;
    const parts: (string | null)[] = [warmup];
    for (let n = 1; n <= entry.setCount; n++) {
      const reps = sets[`set${n}`];
      if (!reps) {
        parts.push(null);
        continue;
      }
      const weight = sets[`set${n}Weight`];
      const time = ts?.[`set${n}Time`];
      parts.push(`S${n}:${reps}${weight ? `@${weight}kg` : ''}${time ? `@${time}` : ''}`);
    }
    const setsText = parts.filter(Boolean).join(' ');
    const note = entry.note?.trim();
    const noteSuffix = note ? ` [note: ${note.replace(/[[\]|]/g, '')}]` : '';
    lines.push(`${entry.seq}.${entry.exercise}: ${setsText}${noteSuffix}`);
  });
  return lines.join(' | ');
};

export const parseNotesToPreviousReps = (
  notes: string | undefined,
): { reps: PreviousReps; notes: Record<string, string>; sequences: Record<string, number>; setCounts: Record<string, number> } => {
  const result: PreviousReps = {};
  const noteMap: Record<string, string> = {};
  const seqMap: Record<string, number> = {};
  const setCounts: Record<string, number> = {};
  if (!notes) return { reps: result, notes: noteMap, sequences: seqMap, setCounts };

  const exerciseParts = notes.split(' | ');
  for (const part of exerciseParts) {
    // Capture leading sequence prefix like "1." if present
    const seqPrefix = part.match(/^(\d+)\./);
    const cleaned = part.replace(/^\d+\./, '');
    const colonIndex = cleaned.indexOf(':');
    if (colonIndex === -1) continue;

    const exerciseName = cleaned.substring(0, colonIndex).trim();
    if (seqPrefix) seqMap[exerciseName] = parseInt(seqPrefix[1], 10);
    let setsText = cleaned.substring(colonIndex + 1).trim();

    // Extract trailing note: "[note: ...]"
    const noteMatch = setsText.match(/\s*\[note:\s*([^\]]*)\]\s*$/);
    if (noteMatch) {
      noteMap[exerciseName] = noteMatch[1].trim();
      setsText = setsText.replace(noteMatch[0], '').trim();
    }

    const sets: ExerciseSets = emptySets();
    const dict = asDict(sets)!;

    // Match warmup: W:<reps> optionally followed by @<weight>kg
    const warmupMatch = setsText.match(/(?:^|\s)W:(\d+)(?:@(\d+(?:\.\d+)?)kg)?/);
    if (warmupMatch) {
      sets.warmup = warmupMatch[1];
      if (warmupMatch[2]) sets.warmupWeight = warmupMatch[2];
    }

    // Match S<n>:<reps> (n = 1..6) optionally followed by @<weight>kg
    let maxSetNum = 0;
    const setMatches = setsText.match(/S(\d):(\d+)(?:@(\d+(?:\.\d+)?)kg)?/g);
    if (setMatches) {
      for (const match of setMatches) {
        const m = match.match(/S(\d):(\d+)(?:@(\d+(?:\.\d+)?)kg)?/);
        if (!m) continue;
        const [, setNum, reps, weight] = m;
        const n = parseInt(setNum, 10);
        if (n < 1 || n > 6) continue;
        maxSetNum = Math.max(maxSetNum, n);
        dict[`set${n}`] = reps;
        if (weight) dict[`set${n}Weight`] = weight;
      }
    }
    if (maxSetNum > 0) setCounts[exerciseName] = Math.min(MAX_SETS, Math.max(MIN_SETS, maxSetNum));
    result[exerciseName] = sets;
  }
  return { reps: result, notes: noteMap, sequences: seqMap, setCounts };
};

/** Builds the stored workout. `restTimer` comes from serializeRestTimer. */
export const buildActiveWorkoutState = (input: {
  templateId: string;
  templateName: string;
  exercises: string[];
  startTime: Date;
  data: WorkoutData;
  previousSequences: Record<string, number>;
  expandedExercise: number | null;
  restTimer: PersistedRestTimer | null;
}): ActiveWorkoutState => ({
  templateId: input.templateId,
  templateName: input.templateName,
  exercises: input.exercises,
  extraExercises: input.data.extraExercises,
  startTime: input.startTime.toISOString(),
  exerciseSets: input.data.exerciseSets,
  exerciseTimestamps: input.data.exerciseTimestamps,
  exerciseSequence: input.data.exerciseSequence,
  previousSequences: input.previousSequences,
  exerciseNotes: input.data.exerciseNotes,
  exerciseSetCount: input.data.exerciseSetCount,
  nextSequence: input.data.nextSequence,
  expandedExercise: input.expandedExercise,
  restTimer: input.restTimer,
});
