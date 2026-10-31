/**
 * Reads the saved workout notes string into structured exercises and sets, for display only.
 *
 * Saved format (written by workoutSession.formatWorkoutNotes, and by the session editor):
 *
 *   Start:09:30 End:10:15 | 1.Bench press: W:5@20kg@09:31 S1:12@40kg@09:35 S2:10@40kg [note: felt heavy] | 2.Row: S1:10 ...
 *
 *  - parts are separated by " | "
 *  - "Start:HH:mm End:HH:mm" is the optional timing part
 *  - an exercise is "<n>.<name>: <sets>" with an optional trailing "[note: ...]"
 *  - a set is W (warm-up) or S1..S6, then ":<reps>", then optional "@<weight>kg" and "@HH:mm" in that order
 *
 * Honesty rules (this feeds counts and volume shown to the user):
 *  - Anything not understood is kept verbatim in `unparsed`, never dropped or guessed at.
 *  - Counts and volume are only produced when EVERY part was understood (`complete`), so a number
 *    never silently leaves out an exercise that was written in some other way.
 *  - Volume is reps x kg over working sets that have both a rep count and a weight. Warm-ups are
 *    excluded (same rule as workoutStats). When some working sets have no weight the volume is
 *    flagged `volumePartial`; when none has one it is null (never 0).
 *
 * Exercises keep the order they were saved in (already the order they were done). Nothing here
 * re-keys or reorders per-exercise data, so the original exercise-index rules of the active
 * workout are untouched.
 */

export interface ParsedSet {
  /** "W" for the warm-up, otherwise the set number 1..6. */
  label: 'W' | number;
  warmup: boolean;
  reps: number;
  /** kg, or null when the set was logged without a weight (for example body weight). */
  weightKg: number | null;
  /** HH:mm the set was logged, when stored. */
  time: string | null;
}

export interface ParsedExercise {
  /** Order number written in front of the name; null when absent or the 999 placeholder. */
  seq: number | null;
  name: string;
  sets: ParsedSet[];
  note: string | null;
}

export interface ParsedWorkoutNotes {
  startTime: string | null;
  endTime: string | null;
  exercises: ParsedExercise[];
  /** Parts that were not understood, exactly as stored, in their original order. */
  unparsed: string[];
  /** There were notes and every part was understood. */
  complete: boolean;
}

export interface WorkoutNoteStats {
  exerciseCount: number;
  /** Working sets only (warm-ups excluded). */
  setCount: number;
  /** kg, null when no working set has both reps and a weight. */
  volumeKg: number | null;
  /** Some working sets had no weight, so the volume covers only the weighted ones. */
  volumePartial: boolean;
}

const META = /^Start:\s*(\d{1,2}:\d{2})?(?:\s+End:\s*(\d{1,2}:\d{2})?)?$/i;
const NOTE_SUFFIX = /\s*\[note:\s*([^\]]*)\]\s*$/i;
const EXERCISE = /^(?:(\d+)\.\s*)?(.+?):\s*((?:W|S[1-6]):\d.*)$/;
const SET_TOKEN = /^(W|S([1-6])):(\d+(?:\.\d+)?)((?:@[^@\s]+)*)$/;
const WEIGHT = /^(\d+(?:[.,]\d+)?)kg$/i;
const CLOCK = /^\d{1,2}:\d{2}$/;
const PLACEHOLDER_SEQ = 999;

const padClock = (value: string) => value.replace(/^(\d):/, '0$1:');

const parseSets = (text: string): ParsedSet[] | null => {
  const sets: ParsedSet[] = [];
  for (const token of text.trim().split(/\s+/)) {
    const m = SET_TOKEN.exec(token);
    if (!m) return null;
    let weightKg: number | null = null;
    let time: string | null = null;
    for (const piece of m[4].split('@').filter(Boolean)) {
      const w = WEIGHT.exec(piece);
      if (w && weightKg === null) {
        const value = parseFloat(w[1].replace(',', '.'));
        weightKg = Number.isFinite(value) && value > 0 ? value : null;
      } else if (CLOCK.test(piece) && time === null) {
        time = padClock(piece);
      } else {
        return null;
      }
    }
    const reps = parseFloat(m[3]);
    if (!Number.isFinite(reps)) return null;
    sets.push({ label: m[1] === 'W' ? 'W' : Number(m[2]), warmup: m[1] === 'W', reps, weightKg, time });
  }
  return sets.length > 0 ? sets : null;
};

export const parseWorkoutNotes = (notes: string | null | undefined): ParsedWorkoutNotes => {
  const result: ParsedWorkoutNotes = { startTime: null, endTime: null, exercises: [], unparsed: [], complete: false };
  const text = notes?.trim();
  if (!text) return result;

  for (const raw of text.split(/\s\|\s/)) {
    const part = raw.trim();
    if (!part) continue;

    const meta = META.exec(part);
    if (meta && (meta[1] || meta[2])) {
      if (meta[1]) result.startTime = padClock(meta[1]);
      if (meta[2]) result.endTime = padClock(meta[2]);
      continue;
    }

    let working = part;
    let note: string | null = null;
    const noteMatch = NOTE_SUFFIX.exec(working);
    if (noteMatch) {
      note = noteMatch[1].trim() || null;
      working = working.slice(0, noteMatch.index).trim();
    }

    const m = EXERCISE.exec(working);
    const sets = m ? parseSets(m[3]) : null;
    if (!m || !sets) {
      result.unparsed.push(part);
      continue;
    }
    const seq = m[1] ? parseInt(m[1], 10) : null;
    result.exercises.push({
      seq: seq !== null && seq !== PLACEHOLDER_SEQ ? seq : null,
      name: m[2].trim(),
      sets,
      note,
    });
  }

  result.complete = result.unparsed.length === 0 && (result.exercises.length > 0 || result.startTime !== null || result.endTime !== null);
  return result;
};

/** Counts and volume, or null when the notes were not fully understood (so no number can be wrong). */
export const workoutNoteStats = (parsed: ParsedWorkoutNotes): WorkoutNoteStats | null => {
  if (!parsed.complete || parsed.exercises.length === 0) return null;
  let setCount = 0;
  let weighted = 0;
  let volume = 0;
  for (const exercise of parsed.exercises) {
    for (const set of exercise.sets) {
      if (set.warmup || !(set.reps > 0)) continue;
      setCount += 1;
      if (set.weightKg !== null) {
        weighted += 1;
        volume += set.reps * set.weightKg;
      }
    }
  }
  return {
    exerciseCount: parsed.exercises.length,
    setCount,
    volumeKg: weighted > 0 ? Math.round(volume * 10) / 10 : null,
    volumePartial: weighted > 0 && weighted < setCount,
  };
};

/** "Bench press, Incline DB, Fly +3": the first `limit` names and how many more there are. */
export const exercisePreview = (parsed: ParsedWorkoutNotes, limit = 3): string | null => {
  const names = parsed.exercises.map((e) => e.name).filter(Boolean);
  if (names.length === 0) return null;
  const shown = names.slice(0, limit).join(', ');
  return names.length > limit ? `${shown} +${names.length - limit}` : shown;
};
