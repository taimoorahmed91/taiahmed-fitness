// Exercise history for the drill-down from a saved workout (and from the Records tab).
// Read only: it never changes a session, a set, a weight, a time or the order exercises were saved in.
import type { GymSession } from '@/types';
import type { ParsedExercise, ParsedWorkoutNotes } from '@/lib/workoutNotes';
import { exerciseHistory, type ExerciseHistoryEntry } from '@/lib/workoutStats';
import { namesForExercise, resolveExerciseName, type ExerciseAliases } from '@/lib/exerciseAliases';

/** A history is only worth opening when there is at least one working set with reps AND a weight (warm-ups never count). */
export const isWeightedExercise = (exercise: ParsedExercise): boolean =>
  exercise.sets.some((set) => !set.warmup && set.reps > 0 && set.weightKg !== null && set.weightKg > 0);

export interface ExerciseHistoryTarget {
  /** Position of the exercise in the saved workout. Never renumbered, even when others are not openable. */
  index: number;
  /** The name as it is saved in this workout. */
  name: string;
  /** The name its history is shown under, after this device's merges. */
  canonical: string;
  /** True only when opening it would show history that includes this very workout. */
  openable: boolean;
}

type SessionLike = Pick<GymSession, 'id' | 'date' | 'exercise' | 'notes' | 'start_time'>;

/**
 * One entry per exercise of the saved workout, in the saved order and with the saved index.
 * Bodyweight / unweighted exercises are `openable: false`, so they are not shown as buttons.
 */
export const exerciseHistoryTargets = (session: SessionLike, parsed: ParsedWorkoutNotes, aliases: ExerciseAliases): ExerciseHistoryTarget[] =>
  parsed.exercises.map((exercise, index) => {
    const canonical = resolveExerciseName(exercise.name, aliases);
    const openable =
      isWeightedExercise(exercise) &&
      exerciseHistory([session], canonical, aliases).length > 0;
    return { index, name: exercise.name, canonical, openable };
  });

export interface ExerciseHistoryRow extends ExerciseHistoryEntry {
  sessionId: string;
  /** This is the workout the history was opened from. */
  isOrigin: boolean;
}

export interface ExerciseHistoryOrigin {
  /** The exact saved workout. Preferred: two workouts on one date are told apart by this. */
  sessionId?: string;
  /** Used only when no id is known, and only if exactly one workout has that date. */
  date?: string;
}

export interface ExerciseHistoryView {
  /** Name the history is shown under. */
  exercise: string;
  /** `exercise` first, then every saved name merged into it. */
  names: string[];
  /** The name that was asked for, when it is a merged name (so the dialog can explain). */
  requestedAs: string | null;
  /** Oldest first. */
  entries: ExerciseHistoryRow[];
  /** Index in `entries` of the origin workout, or -1. */
  originIndex: number;
  /** An origin date matched more than one workout and nothing was marked. */
  originAmbiguous: boolean;
}

const startOf = (session: SessionLike) => (session.start_time ?? '').slice(0, 5);

export const buildExerciseHistory = (
  sessions: readonly SessionLike[],
  exercise: string,
  aliases: ExerciseAliases,
  origin?: ExerciseHistoryOrigin | null,
): ExerciseHistoryView => {
  const canonical = resolveExerciseName(exercise, aliases);
  const ordered = sessions
    .map((session, position) => ({ session, position }))
    .sort((a, b) => a.session.date.localeCompare(b.session.date) || startOf(a.session).localeCompare(startOf(b.session)) || a.position - b.position);

  const entries: ExerciseHistoryRow[] = ordered.flatMap(({ session }) =>
    exerciseHistory([session], canonical, aliases).map((entry) => ({ ...entry, sessionId: session.id, isOrigin: false })),
  );

  let originIndex = -1;
  let originAmbiguous = false;
  if (origin?.sessionId) {
    originIndex = entries.findIndex((entry) => entry.sessionId === origin.sessionId);
  } else if (origin?.date) {
    const sameDay = entries.flatMap((entry, i) => (entry.date === origin.date ? [i] : []));
    if (sameDay.length === 1) originIndex = sameDay[0];
    else if (sameDay.length > 1) originAmbiguous = true;
  }
  if (originIndex >= 0) entries[originIndex] = { ...entries[originIndex], isOrigin: true };

  const clean = exercise.trim();
  return {
    exercise: canonical,
    names: namesForExercise(canonical, aliases),
    requestedAs: clean && clean !== canonical ? clean : null,
    entries,
    originIndex,
    originAmbiguous,
  };
};
