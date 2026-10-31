/**
 * Small calendar-day helpers for the "yesterday" card and the body-metric / gym screens.
 *
 * They follow the same rule as the rest of the app: a day is the UTC calendar date ("YYYY-MM-DD"),
 * and it is shown as that exact date. Nothing here reads the viewer's local time zone, so a
 * person in Poland at 00:30 on Nov 1 (23:30 UTC on Oct 31) still sees "Oct 31" as today.
 */
import { addDaysIso, defaultToday, isoDayToMs } from '@/lib/historyDates';
import { getMealDate } from '@/lib/mealDateTime';

/** The UTC calendar day before `today` (defaults to the current UTC day). */
export const yesterdayIso = (today: string = defaultToday()): string => addDaysIso(today, -1);

/** "Friday, Oct 30" for a calendar day. Falls back to the raw text when it is not a real date. */
export const formatLongDay = (iso: string): string => {
  const ms = isoDayToMs(iso);
  if (ms === null) return iso;
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms);
};

/** Default value for a "date" form field: today's UTC calendar day, the same day Meals and Dashboard use. */
export const defaultFormDate = (now: Date = new Date()): string => getMealDate(now);
