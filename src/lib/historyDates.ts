/**
 * Calendar-date helpers for the Meals and Gym history lists.
 *
 * Records store `date` as a plain "YYYY-MM-DD" string. Never turn that into a Date with
 * `new Date('YYYY-MM-DD')` and format it in local time: that string is parsed as UTC midnight,
 * so anywhere west of UTC it would display the day before. Everything here works on the
 * calendar day itself (UTC midnight formatted in UTC), so a date always shows as the date it is.
 *
 * "Today" follows the app convention used by every other calculation (see mealDateTime.ts):
 * the UTC calendar day. Callers can pass their own `today` for tests.
 */
import { getMealDate, getMealTime } from '@/lib/mealDateTime';

const DAY_MS = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** UTC-midnight milliseconds for a "YYYY-MM-DD" (or longer ISO) string. null when it is not a real calendar day. */
export const isoDayToMs = (iso: string | null | undefined): number | null => {
  const m = ISO_DAY.exec(iso ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return ms;
};

const msToIsoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const isValidIsoDay = (iso: string | null | undefined): boolean => isoDayToMs(iso) !== null;

export const addDaysIso = (iso: string, days: number): string => {
  const ms = isoDayToMs(iso);
  return ms === null ? iso : msToIsoDay(ms + days * DAY_MS);
};

/** Whole calendar days from `b` to `a` (a - b). null when either is not a valid day. */
export const dayDiff = (a: string, b: string): number | null => {
  const am = isoDayToMs(a);
  const bm = isoDayToMs(b);
  return am === null || bm === null ? null : Math.round((am - bm) / DAY_MS);
};

export const defaultToday = (): string => getMealDate();

const fmt = (ms: number, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(ms);

const yearOf = (iso: string): number | null => {
  const ms = isoDayToMs(iso);
  return ms === null ? null : new Date(ms).getUTCFullYear();
};

/** "Fri, Oct 30" (year added only when it is not the current year). Falls back to the raw text if the date is invalid. */
export const formatDay = (iso: string, today: string = defaultToday()): string => {
  const ms = isoDayToMs(iso);
  if (ms === null) return iso;
  const withYear = yearOf(iso) !== yearOf(today);
  return fmt(ms, { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
};

/** "Oct 30" (year added only when it is not the current year). */
export const formatShortDay = (iso: string, today: string = defaultToday()): string => {
  const ms = isoDayToMs(iso);
  if (ms === null) return iso;
  const withYear = yearOf(iso) !== yearOf(today);
  return fmt(ms, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
};

/** "Today" / "Yesterday" for those two days, otherwise null. */
export const relativeDayLabel = (iso: string, today: string = defaultToday()): 'Today' | 'Yesterday' | null => {
  const diff = dayDiff(today, iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return null;
};

/** The Monday of the week that contains `iso` (weeks run Monday to Sunday). */
export const weekStartIso = (iso: string): string => {
  const ms = isoDayToMs(iso);
  if (ms === null) return iso;
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return msToIsoDay(ms - sinceMonday * DAY_MS);
};

/** ISO 8601 week string such as "2026-W44" for the week starting on `weekStart`, for `<time dateTime>`. */
export const isoWeekString = (weekStart: string): string => {
  const ms = isoDayToMs(weekStart);
  if (ms === null) return weekStart;
  const thursday = new Date(ms + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const dayOfYear = Math.round((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
};

/** "Oct 26 – Nov 1" for the Monday-to-Sunday week starting on `weekStart`. */
export const formatWeekRange = (weekStart: string, today: string = defaultToday()): string => {
  const end = addDaysIso(weekStart, 6);
  const startYear = yearOf(weekStart);
  const endYear = yearOf(end);
  const currentYear = yearOf(today);
  const start = fmt(isoDayToMs(weekStart) ?? 0, { month: 'short', day: 'numeric', ...(startYear !== endYear ? { year: 'numeric' } : {}) });
  const stop = fmt(isoDayToMs(end) ?? 0, { month: 'short', day: 'numeric', ...(endYear !== currentYear || startYear !== endYear ? { year: 'numeric' } : {}) });
  return `${start} – ${stop}`;
};

/** "This week" / "Last week" / "Week of Oct 12". */
export const weekTitle = (weekStart: string, today: string = defaultToday()): string => {
  const diff = dayDiff(weekStartIso(today), weekStart);
  if (diff === 0) return 'This week';
  if (diff === 7) return 'Last week';
  return `Week of ${formatShortDay(weekStart, today)}`;
};

/**
 * "09:30" from a clock string ("9:30", "09:30:00") or from a full timestamp
 * ("2026-10-30T09:15:00.000Z", shown in the viewer's local time, or in `timeZone` when given).
 * null when there is nothing usable.
 */
export const formatClock = (value: string | null | undefined, timeZone?: string): string | null => {
  if (!value) return null;
  const text = value.trim();
  const clock = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text);
  if (clock) return `${clock[1].padStart(2, '0')}:${clock[2]}`;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return getMealTime(date, timeZone);
  }
  return null;
};
