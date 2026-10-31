/**
 * Pure helpers behind the grouped Gym history: newest-first ordering, Monday-to-Sunday week groups,
 * and one summary per session (times, duration, exercise/set counts, volume).
 */
import type { GymSession } from '@/types';
import { dayDiff, formatClock, weekStartIso } from '@/lib/historyDates';
import {
  exercisePreview,
  parseWorkoutNotes,
  workoutNoteStats,
  type ParsedWorkoutNotes,
  type WorkoutNoteStats,
} from '@/lib/workoutNotes';

export interface WorkoutWeekGroup {
  key: string;
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  items: GymSession[];
}

/** Newest day first; sessions on the same day by start time, latest first (no start time sorts last). */
export const sortSessionsNewestFirst = (sessions: readonly GymSession[]): GymSession[] =>
  sessions
    .map((session, index) => ({ session, index, start: formatClock(session.start_time) ?? '' }))
    .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.start.localeCompare(a.start) || a.index - b.index)
    .map((entry) => entry.session);

/** One group per calendar week, newest first. Expects the list already sorted newest first. */
export const groupSessionsByWeek = (sorted: readonly GymSession[]): WorkoutWeekGroup[] => {
  const groups: WorkoutWeekGroup[] = [];
  for (const session of sorted) {
    const weekStart = weekStartIso(session.date);
    const last = groups[groups.length - 1];
    if (last && last.weekStart === weekStart) last.items.push(session);
    else groups.push({ key: weekStart, weekStart, items: [session] });
  }
  return groups;
};

export const countSessionsByWeek = (sessions: readonly GymSession[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const session of sessions) {
    const week = weekStartIso(session.date);
    counts[week] = (counts[week] ?? 0) + 1;
  }
  return counts;
};

export interface SessionSummary {
  parsed: ParsedWorkoutNotes;
  /** Counts and volume; null when the notes are missing or not fully understood. */
  stats: WorkoutNoteStats | null;
  /** "09:30–10:15", "09:30", or null. Uses the saved start/end times, then the times inside the notes. */
  timeRange: string | null;
  /** Minutes, or null when none was recorded. */
  minutes: number | null;
  /** "Bench press, Incline DB, Fly +3" or null. */
  preview: string | null;
  hasNotes: boolean;
}

export const summarizeSession = (session: GymSession): SessionSummary => {
  const parsed = parseWorkoutNotes(session.notes);
  const start = formatClock(session.start_time) ?? parsed.startTime;
  const end = formatClock(session.end_time) ?? parsed.endTime;
  const timeRange = start && end ? `${start}–${end}` : start ?? null;
  return {
    parsed,
    stats: workoutNoteStats(parsed),
    timeRange,
    minutes: Number.isFinite(session.duration) && session.duration > 0 ? Math.round(session.duration) : null,
    preview: exercisePreview(parsed),
    hasNotes: !!session.notes?.trim(),
  };
};

/** 45 -> "45 min", 135 -> "2 h 15 min", 120 -> "2 h". */
export const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export const formatKg = (kg: number): string => `${kg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`;

export interface WeekTotals {
  count: number;
  /** Total minutes, or null when no session in the week has a duration. */
  minutes: number | null;
}

export const summarizeWeek = (sessions: readonly GymSession[]): WeekTotals => {
  const durations = sessions.map((s) => (Number.isFinite(s.duration) && s.duration > 0 ? Math.round(s.duration) : 0));
  const total = durations.reduce((sum, d) => sum + d, 0);
  return { count: sessions.length, minutes: total > 0 ? total : null };
};

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * Which days of a Monday-to-Sunday week have at least one workout: seven booleans, Monday first.
 * Only meaningful for a week shown in full (the caller skips it when a filter hides part of the week).
 */
export const trainedDays = (sessions: readonly GymSession[], weekStart: string): boolean[] => {
  const days = [false, false, false, false, false, false, false];
  for (const session of sessions) {
    const offset = dayDiff(session.date, weekStart);
    if (offset !== null && offset >= 0 && offset < 7) days[offset] = true;
  }
  return days;
};

/** "Monday, Wednesday and Friday", or null when no day is marked. */
export const describeTrainedDays = (days: readonly boolean[]): string | null => {
  const names = WEEKDAY_NAMES.filter((_, i) => days[i]);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};
