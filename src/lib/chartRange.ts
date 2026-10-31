// Pure date-range helpers shared by every chart. No imports on purpose, so the
// tests can load this file directly.

export type ChartRange = '7' | '14' | '30' | '90' | 'all';
export type ChartStyle = 'line' | 'bar';

export const CHART_RANGES: readonly ChartRange[] = ['7', '14', '30', '90', 'all'];
/** Ranges every chart supports. "All" is only offered by charts that opt in. */
export const STANDARD_RANGES: readonly ChartRange[] = ['7', '14', '30', '90'];

export const RANGE_LABELS: Record<ChartRange, string> = {
  '7': 'Last 7 days',
  '14': 'Last 14 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
  all: 'All time',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (value: unknown): value is string => typeof value === 'string' && ISO_DATE.test(value);

/** The latest range a chart supports; used when a shared range is wider than the chart allows. */
export const clampRange = (range: ChartRange, allowed: readonly ChartRange[]): ChartRange => {
  if (allowed.includes(range)) return range;
  const days = (r: ChartRange) => (r === 'all' ? Infinity : Number(r));
  const sorted = [...allowed].sort((a, b) => days(a) - days(b));
  return sorted.reduce((best, r) => (days(r) <= days(range) ? r : best), sorted[0]);
};

export const todayUtc = (now: Date = new Date()) => now.toISOString().slice(0, 10);

export const shiftIsoDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** First ISO date inside a range ending on `today` (inclusive on both ends). */
export const rangeStart = (range: Exclude<ChartRange, 'all'>, today: string) => shiftIsoDate(today, -(Number(range) - 1));

/**
 * Rows inside the inclusive UTC calendar window ending today, oldest first.
 * Rows must have an ISO `date` (YYYY-MM-DD). Missing days are simply absent;
 * the window is calendar based, never "the last N rows".
 */
export const recentChartData = <T extends { date: string }>(data: T[], range: ChartRange, today: string = todayUtc()): T[] => {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  if (range === 'all') return sorted;
  const since = rangeStart(range, today);
  return sorted.filter((row) => row.date >= since && row.date <= today);
};

/**
 * Same as `recentChartData`, but also accepts the older dashboard shape where
 * `date` is an "MM/DD" label over a gap-free series ending today. In that case
 * the trailing N rows are exactly the last N calendar days.
 */
export const windowChartRows = <T extends { date: string }>(data: T[], range: ChartRange, today: string = todayUtc()): T[] => {
  if (data.every((row) => isIsoDate(row.date))) return recentChartData(data, range, today);
  return range === 'all' ? [...data] : data.slice(-Number(range));
};

/** "2026-10-30" -> "10/30". Other labels (already short) pass through unchanged. */
export const formatChartDate = (date: string) => (isIsoDate(date) ? date.slice(5).replace('-', '/') : date);
export const chartDateLabel = formatChartDate;
