/**
 * What the four dashboard status tiles (workout, weight, waist, WHOOP) say,
 * worked out from data the page has already loaded. No network, no React,
 * so it is easy to test and the tiles never need their own queries.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatsInput {
  /** `YYYY-MM-DD` dates of gym sessions (any order). */
  gymDates: readonly string[];
  weightDates: readonly string[];
  waistDates: readonly string[];
  /** ISO timestamps of WHOOP rows. */
  whoopCreatedAt: readonly string[];
  weightIntervalDays: number;
  waistIntervalDays: number;
  /** Current time in ms. Injected so tests are deterministic. */
  now: number;
}

export interface MeasurementStatus {
  due: boolean;
  daysUntil: number;
}

export interface StatsStatus {
  didWorkoutToday: boolean;
  didWorkoutYesterday: boolean;
  whoopSyncedToday: boolean;
  weight: MeasurementStatus;
  waist: MeasurementStatus;
}

/** Days since the latest dated entry, or null when there is none. `today` is `YYYY-MM-DD`. */
export const daysSinceLatest = (dates: readonly string[], today: string): number | null => {
  let latest: string | null = null;
  for (const date of dates) if (!latest || date > latest) latest = date;
  if (!latest) return null;
  return Math.floor((new Date(today).getTime() - new Date(latest).getTime()) / DAY_MS);
};

/** Never measured, or at/over the interval, means "due today". */
export const measurementStatus = (daysSince: number | null, intervalDays: number): MeasurementStatus =>
  daysSince === null || daysSince >= intervalDays
    ? { due: true, daysUntil: 0 }
    : { due: false, daysUntil: intervalDays - daysSince };

export const computeStatsStatus = (input: StatsInput): StatsStatus => {
  const today = new Date(input.now).toISOString().split('T')[0];
  const yesterday = new Date(input.now - DAY_MS).toISOString().split('T')[0];
  const dayStart = new Date(today + 'T00:00:00').getTime();
  const dayEnd = dayStart + DAY_MS;

  return {
    didWorkoutToday: input.gymDates.includes(today),
    didWorkoutYesterday: input.gymDates.includes(yesterday),
    whoopSyncedToday: input.whoopCreatedAt.some((value) => {
      const t = new Date(value).getTime();
      return t >= dayStart && t < dayEnd;
    }),
    weight: measurementStatus(daysSinceLatest(input.weightDates, today), input.weightIntervalDays),
    waist: measurementStatus(daysSinceLatest(input.waistDates, today), input.waistIntervalDays),
  };
};
