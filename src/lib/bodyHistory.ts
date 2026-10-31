/**
 * Pure helpers behind the Weight, Waist, Sleep and WHOOP history lists.
 *
 * Grouping
 *  - Weight, Waist and Sleep are grouped by calendar MONTH (these are one-or-few entries a day, so a month is the
 *    natural "page" of a diary). WHOOP is grouped by Monday-to-Sunday WEEK (one entry per day, read week by week).
 *  - Newest first. Groups are never split across pages.
 *
 * Honesty rules
 *  - A change from the previous entry is a plain difference, never a verdict: no "good/bad", no colour.
 *  - A group average or range is only produced when enough entries exist, and a group is never described with
 *    numbers when a filter has hidden part of it.
 *  - Missing values are unknown, not zero.
 */
import { dayDiff, isoDayToMs, weekStartIso } from '@/lib/historyDates';

// ------------------------------------------------------------------ ordering and grouping

export interface DatedEntry {
  id: string;
  date: string;
}

/** Newest day first. Entries on the same day keep the order they came in. Does not change the input. */
export const sortNewestFirst = <T extends DatedEntry>(entries: readonly T[]): T[] =>
  entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || a.index - b.index)
    .map((x) => x.entry);

/** "2026-10" for a "2026-10-30" date. */
export const monthKey = (date: string): string => (isoDayToMs(date) === null ? date : date.slice(0, 7));

export interface MonthGroup<T> {
  key: string;
  /** "2026-10" */
  month: string;
  items: T[];
}

export interface WeekGroup<T> {
  key: string;
  /** Monday, YYYY-MM-DD */
  weekStart: string;
  items: T[];
}

/** One group per calendar month. Expects the list already sorted newest first. */
export const groupByMonth = <T extends DatedEntry>(sorted: readonly T[]): MonthGroup<T>[] => {
  const groups: MonthGroup<T>[] = [];
  for (const entry of sorted) {
    const month = monthKey(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(entry);
    else groups.push({ key: month, month, items: [entry] });
  }
  return groups;
};

/** One group per Monday-to-Sunday week. Expects the list already sorted newest first. */
export const groupByWeek = <T extends DatedEntry>(sorted: readonly T[]): WeekGroup<T>[] => {
  const groups: WeekGroup<T>[] = [];
  for (const entry of sorted) {
    const weekStart = weekStartIso(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.weekStart === weekStart) last.items.push(entry);
    else groups.push({ key: weekStart, weekStart, items: [entry] });
  }
  return groups;
};

export const countBy = <T>(entries: readonly T[], key: (entry: T) => string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const entry of entries) counts[key(entry)] = (counts[key(entry)] ?? 0) + 1;
  return counts;
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026" for "2026-10". Falls back to the raw text for anything else. */
export const monthTitle = (month: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const index = m ? Number(m[2]) - 1 : -1;
  return m && index >= 0 && index < 12 ? `${MONTH_NAMES[index]} ${m[1]}` : month;
};

// ------------------------------------------------------------------ change from the previous entry

export interface Change {
  /** value - previous value, rounded to the display precision. 0 means "no change at that precision". */
  delta: number;
  previousValue: number;
  previousDate: string;
  /** Whole calendar days between the two entries (0 = same day). null if a date is not valid. */
  days: number | null;
}

/**
 * For each entry, the plain difference from the entry just before it in time. `sortedNewestFirst` must contain
 * EVERY entry (not a filtered view) so a filter never changes what an entry is compared with.
 * The oldest entry has no previous one, and non-numeric values are skipped, so it gets no change.
 */
export const buildChangeMap = <T extends DatedEntry>(
  sortedNewestFirst: readonly T[],
  getValue: (entry: T) => number,
  decimals = 2,
): Map<string, Change> => {
  const factor = 10 ** decimals;
  const map = new Map<string, Change>();
  for (let i = 0; i < sortedNewestFirst.length - 1; i += 1) {
    const current = sortedNewestFirst[i];
    const previous = sortedNewestFirst[i + 1];
    const a = getValue(current);
    const b = getValue(previous);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = Math.round((a - b) * factor) / factor;
    map.set(current.id, { delta: delta === 0 ? 0 : delta, previousValue: b, previousDate: previous.date, days: dayDiff(current.date, previous.date) });
  }
  return map;
};

/** Trims "0.40" to "0.4" so a change reads the way it was entered. */
const trimmed = (n: number, decimals: number) => String(Number(Math.abs(n).toFixed(decimals)));

/** "+0.4 kg", "−0.4 kg" (a real minus sign) or "No change". Never a judgement. */
export const formatChange = (delta: number, unit: string, decimals = 2): string => {
  if (delta === 0) return 'No change';
  return `${delta > 0 ? '+' : '−'}${trimmed(delta, decimals)} ${unit}`;
};

/** "same day", "1 day earlier", "9 days earlier". */
export const describeGap = (days: number | null): string | null => {
  if (days === null || days < 0) return null;
  if (days === 0) return 'same day';
  return `${days} ${days === 1 ? 'day' : 'days'} earlier`;
};

/** A sentence: "Up 0.4 kilograms since Oct 27 (3 days earlier)." `dateText` defaults to the stored date. */
export const spokenChange = (change: Change, spokenUnit: string, decimals = 2, dateText: string = change.previousDate): string => {
  const gap = describeGap(change.days);
  const when = `since ${dateText}${gap ? ` (${gap})` : ''}`;
  if (change.delta === 0) return `No change ${when}.`;
  return `${change.delta > 0 ? 'Up' : 'Down'} ${trimmed(change.delta, decimals)} ${spokenUnit} ${when}.`;
};

// ------------------------------------------------------------------ simple group statistics

export interface Range {
  count: number;
  min: number;
  max: number;
  mean: number;
}

/** min / max / mean of the finite numbers, or null when there are none. */
export const rangeOf = (values: readonly (number | null | undefined)[]): Range | null => {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return {
    count: nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    mean: nums.reduce((sum, v) => sum + v, 0) / nums.length,
  };
};

/** Fewest values we will average and call "avg": two numbers are not an average worth printing. */
export const MIN_FOR_AVERAGE = 3;

export const fmt = (n: number, decimals = 1): string => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });

// ------------------------------------------------------------------ bands (always a word, never colour alone)

export type BandTone = 'good' | 'fair' | 'poor';

export interface Band {
  label: string;
  tone: BandTone;
}

export interface SleepBand extends Band {
  label: 'Good' | 'Fair' | 'Poor' | 'Long';
  /** What the band means, in hours, for the expanded row. */
  rule: string;
}

/**
 * Sleep bands go by hours slept only: 7 to 9 h Good, 6 to under 7 h Fair, under 6 h Poor, over 9 h Long.
 * They say nothing about how well someone slept (no stages, no efficiency, no recovery), and a long night is
 * described as long, not called poor. Same 7 to 9 h "optimal" window the Sleep overview uses.
 */
export const sleepBand = (hours: number): SleepBand => {
  if (hours >= 7 && hours <= 9) return { label: 'Good', tone: 'good', rule: '7 to 9 hours' };
  if (hours >= 6 && hours < 7) return { label: 'Fair', tone: 'fair', rule: '6 to under 7 hours' };
  if (hours > 9) return { label: 'Long', tone: 'fair', rule: 'over 9 hours' };
  return { label: 'Poor', tone: 'poor', rule: 'under 6 hours' };
};

/** WHOOP's own recovery cut-offs: 67+ High, 34 to 66 Medium, below 34 Low. */
export const recoveryBand = (score: number | null | undefined): 'High' | 'Medium' | 'Low' | null =>
  score == null ? null : score >= 67 ? 'High' : score >= 34 ? 'Medium' : 'Low';

export const recoveryTone = (band: 'High' | 'Medium' | 'Low'): BandTone => (band === 'High' ? 'good' : band === 'Medium' ? 'fair' : 'poor');

/**
 * The plain difference between the newest and the oldest reading of a month shown in full (newest first in `items`).
 * Null when there are fewer than two readings or either is not a number. A fact, not a verdict.
 */
export const netChangeOver = <T>(newestFirst: readonly T[], getValue: (entry: T) => number, decimals = 2): number | null => {
  if (newestFirst.length < 2) return null;
  const latest = getValue(newestFirst[0]);
  const earliest = getValue(newestFirst[newestFirst.length - 1]);
  if (!Number.isFinite(latest) || !Number.isFinite(earliest)) return null;
  const factor = 10 ** decimals;
  const delta = Math.round((latest - earliest) * factor) / factor;
  return delta === 0 ? 0 : delta;
};

/** Longest night the duration bar draws in full. Longer nights fill the bar. */
export const SLEEP_BAR_MAX_HOURS = 12;

/** How full a sleep-duration bar is, 0 to 100. Only a picture of the number beside it, never a target. */
export const sleepBarPercent = (hours: number): number =>
  !Number.isFinite(hours) || hours <= 0 ? 0 : Math.min(100, Math.round((hours / SLEEP_BAR_MAX_HOURS) * 100));
