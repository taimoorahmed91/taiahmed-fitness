/**
 * Small adapters that turn a place a day is shown (an adherence cell, a Calorie History row) into the shared
 * SelectedDay contract (lib/selectedDay.ts), plus the words that go with the "open this day" button.
 * Pure (tests/selectedDay.test.ts).
 *
 * The origin only describes where the person came from. Opening a day uses only its ISO date: the Calendar address
 * is `/calendar?date=YYYY-MM-DD`.
 */
import { createSelectedDay, isValidIsoDate, type SelectedDay } from '@/lib/selectedDay';
import { formatLongDay } from '@/lib/dayDisplay';

export type AdherenceMetric = 'calories' | 'protein';

/** One day of the 30-day adherence grid. Null when the date is not a real day (the cell then stays a plain, non-interactive cell). */
export const adherenceCellDay = (isoDate: string, metric: AdherenceMetric): SelectedDay | null =>
  createSelectedDay(isoDate, { kind: 'daily-aggregate', metric, seriesKey: 'target-adherence' });

/** One day row of Calorie History (the day's calories, protein and carbs together). */
export const calorieHistoryDay = (isoDate: string): SelectedDay | null =>
  createSelectedDay(isoDate, { kind: 'daily-aggregate', metric: 'calories', seriesKey: 'daily-record' });

/** "Open Friday, October 30, 2026 in Calendar". Falls back to the raw text for a bad date, so a label is never "undefined". */
export const openDayLabel = (isoDate: string): string => `Open ${isValidIsoDate(isoDate) ? formatLongDay(isoDate) : isoDate} in Calendar`;
