/**
 * The "selected day" contract: one shared way to say "this calendar day, and (optionally) how the person got
 * here", used by the Calendar page, the adherence grid, Calorie History and, later, the shared chart points.
 *
 * Pure and framework-free (tests/selectedDay.test.ts).
 *
 * ## Rules
 *  - A day is a real UTC calendar date written `YYYY-MM-DD`. Impossible dates (`2026-02-30`, `2025-02-29`,
 *    `2026-13-01`) are rejected, never rolled forward. Years are four digits, 1000-9999.
 *  - A selected day's IDENTITY is its `isoDate` plus its origin's `kind`, `metric`, `recordId` and `seriesKey`.
 *    Display labels ("Oct 30") and array indexes are NEVER identities: they change with sorting, ranges and
 *    locale. `createSelectedDay` copies only the known fields, so a label or index can not sneak into a key.
 *  - The Calendar address carries only the date (`/calendar?date=2026-10-30`). The origin is in-memory context.
 *
 * ## Chart integration (for the shared chart owner)
 * Turn a clicked point into a day with `createSelectedDay`:
 *
 *   createSelectedDay(point.date, { kind: 'record', metric: 'weight', recordId: row.id })
 *   createSelectedDay(point.date, { kind: 'daily-aggregate', metric: 'calories', seriesKey: 'intake' })
 *   createSelectedDay(bucket.startDate, { kind: 'period-aggregate', metric: 'sleep', seriesKey: 'weekly-avg' })
 *
 * `null` means the date or origin was not valid: show nothing rather than guessing. Navigate with
 * `buildCalendarHref(day.isoDate)` (push), or embed `SelectedDayPanel` / `ConnectedSelectedDayPanel`.
 */
import { CALENDAR_PATH } from '@/lib/routePaths';

/* ------------------------------------------------------------------ real ISO dates */

export const MIN_ISO_YEAR = 1000;
export const MAX_ISO_YEAR = 9999;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Days in a month (1-12). 0 when the month is not 1-12. */
export const daysInIsoMonth = (year: number, month: number): number => {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
};

export interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

/** The parts of a real `YYYY-MM-DD` date, or null. Nothing is trimmed, rolled over or guessed. */
export const parseIsoDate = (value: unknown): IsoDateParts | null => {
  if (typeof value !== 'string') return null;
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_ISO_YEAR || year > MAX_ISO_YEAR) return null;
  if (day < 1 || day > daysInIsoMonth(year, month)) return null;
  return { year, month, day };
};

export const isValidIsoDate = (value: unknown): value is string => parseIsoDate(value) !== null;

/** The UTC calendar day of `now` as `YYYY-MM-DD`. */
export const utcIsoDate = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ the SelectedDay contract */

export type SelectedDayOriginKind = 'record' | 'daily-aggregate' | 'period-aggregate';

export const SELECTED_DAY_ORIGIN_KINDS: readonly SelectedDayOriginKind[] = ['record', 'daily-aggregate', 'period-aggregate'];

export interface SelectedDayOrigin {
  kind: SelectedDayOriginKind;
  /** Which metric the person was looking at: "weight", "calories", "sleep"... Never a display label. */
  metric: string;
  /** The stored record's id (`kind: 'record'`). Never an array index. */
  recordId?: string;
  /** Which series of a chart: "intake", "min-target"... Never a display label. */
  seriesKey?: string;
}

export interface SelectedDay {
  isoDate: string;
  origin?: SelectedDayOrigin;
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value === value.trim();

/** A clean copy of a valid origin (only the known fields), or null when it is not valid. */
export const normalizeOrigin = (origin: unknown): SelectedDayOrigin | null => {
  if (typeof origin !== 'object' || origin === null) return null;
  const o = origin as Record<string, unknown>;
  if (!SELECTED_DAY_ORIGIN_KINDS.includes(o.kind as SelectedDayOriginKind)) return null;
  if (!nonEmpty(o.metric)) return null;
  if (o.recordId !== undefined && !nonEmpty(o.recordId)) return null;
  if (o.seriesKey !== undefined && !nonEmpty(o.seriesKey)) return null;
  const clean: SelectedDayOrigin = { kind: o.kind as SelectedDayOriginKind, metric: o.metric };
  if (o.recordId !== undefined) clean.recordId = o.recordId as string;
  if (o.seriesKey !== undefined) clean.seriesKey = o.seriesKey as string;
  return clean;
};

/**
 * Builds a SelectedDay, or null when the date is not a real calendar date or an origin was given but is
 * malformed. A bad origin is rejected (not dropped) so a wrong adapter fails loudly in tests.
 */
export const createSelectedDay = (isoDate: unknown, origin?: unknown): SelectedDay | null => {
  if (!isValidIsoDate(isoDate)) return null;
  if (origin === undefined) return { isoDate };
  const clean = normalizeOrigin(origin);
  return clean ? { isoDate, origin: clean } : null;
};

/** Stable identity of a selected day. Equal keys mean the same selection; labels and indexes never appear in it. */
export const selectedDayKey = (day: SelectedDay): string => {
  const o = day.origin;
  return JSON.stringify(o ? [day.isoDate, o.kind, o.metric, o.recordId ?? null, o.seriesKey ?? null] : [day.isoDate]);
};

export const isSameSelectedDay = (a: SelectedDay | null | undefined, b: SelectedDay | null | undefined): boolean =>
  a === b || (!!a && !!b && selectedDayKey(a) === selectedDayKey(b));

/* ------------------------------------------------------------------ the Calendar address (?date=) */

export const CALENDAR_DATE_PARAM = 'date';

const toParams = (search: string | URLSearchParams): URLSearchParams =>
  search instanceof URLSearchParams ? search : new URLSearchParams(search);

/** The valid date in the address, or null (missing, repeated-but-first-is-bad, malformed or impossible). Only the first `date` counts. */
export const readCalendarDate = (search: string | URLSearchParams): string | null => {
  const value = toParams(search).get(CALENDAR_DATE_PARAM);
  return isValidIsoDate(value) ? value : null;
};

export interface ResolvedCalendarDate {
  /** The day to show: the address's date, or `today` when there is none or it is not valid. */
  isoDate: string;
  /** True when a `date` was present in the address but could not be used. */
  invalid: boolean;
  /** True when the day came from the address. */
  fromUrl: boolean;
}

export const resolveCalendarDate = (search: string | URLSearchParams, today: string): ResolvedCalendarDate => {
  const params = toParams(search);
  const fromUrl = readCalendarDate(params);
  if (fromUrl) return { isoDate: fromUrl, invalid: false, fromUrl: true };
  return { isoDate: today, invalid: params.has(CALENDAR_DATE_PARAM), fromUrl: false };
};

/** A copy of the query with `date` set. Every other parameter is kept. An invalid date changes nothing. */
export const withCalendarDate = (search: string | URLSearchParams, isoDate: string): URLSearchParams => {
  const next = new URLSearchParams(toParams(search));
  if (isValidIsoDate(isoDate)) next.set(CALENDAR_DATE_PARAM, isoDate);
  return next;
};

/** `/calendar?date=2026-10-30` for linking from any page (a normal link push). Null-safe: an invalid date links to plain `/calendar`. */
export const buildCalendarHref = (isoDate: string, extra?: string | URLSearchParams): string => {
  const params = extra === undefined ? new URLSearchParams() : new URLSearchParams(toParams(extra));
  if (isValidIsoDate(isoDate)) params.set(CALENDAR_DATE_PARAM, isoDate);
  const query = params.toString();
  return query ? `${CALENDAR_PATH}?${query}` : CALENDAR_PATH;
};

/* ------------------------------------------------------------------ history: replace or push */

/**
 * - `select`:           tapping a day in the grid.
 * - `step`:             the previous / next day buttons.
 * - `today`:            the Today button.
 * - `open-in-calendar`: an explicit "Open in Calendar" action.
 *
 * Ordinary selection REPLACES the current history entry (so Back leaves the page instead of walking through every
 * tap). Only an explicit open pushes, so Back returns to where the person came from.
 */
export type DaySelectionIntent = 'select' | 'step' | 'today' | 'open-in-calendar';

export const shouldReplaceHistory = (intent: DaySelectionIntent): boolean => intent !== 'open-in-calendar';

export interface DayNavigationPlan {
  /** False when nothing needs to change (same day, or the target is not a real date). */
  navigate: boolean;
  replace: boolean;
  /** The full new query string (no leading `?`). Unrelated parameters are kept. */
  search: string;
}

export const planDayNavigation = (input: {
  /** The current query. */
  search: string | URLSearchParams;
  /** The day currently shown (already resolved, so it is today when the address has none). */
  selected: string;
  target: string;
  intent: DaySelectionIntent;
}): DayNavigationPlan => {
  const { search, selected, target, intent } = input;
  const current = toParams(search).toString();
  if (!isValidIsoDate(target) || target === selected) return { navigate: false, replace: true, search: current };
  return { navigate: true, replace: shouldReplaceHistory(intent), search: withCalendarDate(search, target).toString() };
};
