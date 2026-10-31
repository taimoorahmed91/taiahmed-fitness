/**
 * Single source of truth for "what date and time is it" when logging a meal.
 *
 * Existing app convention (kept on purpose, do not change without a data migration):
 *  - `date` is the UTC calendar day (`toISOString().slice(0, 10)`). Every "today",
 *    weekly and trend calculation in the app compares against this same value.
 *  - `time` is the user's wall-clock time (HH:mm), which is what they expect to see.
 *
 * This means that shortly after local midnight (for example 00:30 in Europe/Warsaw,
 * which is 22:30 UTC the day before) a new meal gets the previous UTC date with a
 * local time of "00:30". That is how the app has always behaved; this helper only
 * puts it in one place so it is tested and can be changed deliberately later.
 */

export interface MealDateTimeBasis {
  date: string;
  time: string;
}

/** UTC calendar day, formatted YYYY-MM-DD. */
export const getMealDate = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/** Wall-clock time as HH:mm (24h). Pass `timeZone` to override the runtime zone (used by tests). */
export const getMealTime = (now: Date = new Date(), timeZone?: string): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Some engines still report midnight as "24" even with h23.
  return `${hour === '24' ? '00' : hour}:${minute}`;
};

export const getMealDateTimeBasis = (now: Date = new Date(), timeZone?: string): MealDateTimeBasis => ({
  date: getMealDate(now),
  time: getMealTime(now, timeZone),
});
