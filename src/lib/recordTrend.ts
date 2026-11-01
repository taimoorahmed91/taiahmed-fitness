// Record-backed trend charts for the Weight, Waist and Sleep pages: the pure rules. No React, no Recharts, no browser
// globals (tests/recordTrend.test.ts).
//
// ## Why one point per DAY (and which record it is)
// The shared chart is a category chart keyed by ISO date, and its selection identifies a point by that date. Two records on
// the same day can not be two selectable points there: they would sit on the same x position and a click could not say which
// one it meant. So the chart draws ONE point per day, and that point is always one exact stored record:
//
//   the plotted record of a day = the day's record with the lowest id (plain string order).
//
// It does not depend on the order the rows arrived in, so a refetch that shuffles same-day rows never moves the point to
// another record. Every other record of that day is "same-day": it is in the history list, not on the chart, and the UI says
// so. A record with no drawable value (a 0 kg weight, 0 hours of sleep) is "not-plotted" and never hides a good record.
//
// ## Reveal (chart point -> history row)
// `revealStatus` tells whether an exact record id can be shown by the history list right now: visible, hidden by the person's
// filters (the list says so and offers to clear them) or gone.
import { CHART_RANGES, rangeStart, type ChartRange } from './chartRange';

export interface RecordLike {
  id: string;
  date: string;
}

export type PlotStatus = 'plotted' | 'same-day' | 'not-plotted';

export interface RecordPlot<T extends RecordLike> {
  /** The record drawn for each day, newest day first. */
  plotted: T[];
  /** Whether a record is the one on the chart, shares its day with the plotted one, or has nothing to draw. */
  statusOf: (id: string) => PlotStatus;
  /** How many drawable records a day has (0 for a day with none). */
  countOnDay: (date: string) => number;
  /** Days that have more than one drawable record. */
  ambiguousDays: number;
}

/**
 * Decides which record of each day the chart draws. `isPlottable` says whether a record has a value the chart can draw
 * (default: every record does). Never changes the input.
 */
export const planRecordPlot = <T extends RecordLike>(entries: readonly T[], isPlottable: (entry: T) => boolean = () => true): RecordPlot<T> => {
  const byDay = new Map<string, T[]>();
  const status = new Map<string, PlotStatus>();
  for (const entry of entries) {
    if (!isPlottable(entry)) {
      status.set(entry.id, 'not-plotted');
      continue;
    }
    const list = byDay.get(entry.date);
    if (list) list.push(entry);
    else byDay.set(entry.date, [entry]);
  }
  const plotted: T[] = [];
  let ambiguousDays = 0;
  for (const [, list] of byDay) {
    // Plain code-unit order: the same answer in every browser and locale, whatever order the rows came in.
    const chosen = list.reduce((best, entry) => (entry.id < best.id ? entry : best));
    plotted.push(chosen);
    if (list.length > 1) ambiguousDays += 1;
    for (const entry of list) status.set(entry.id, entry === chosen ? 'plotted' : 'same-day');
  }
  plotted.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    plotted,
    statusOf: (id) => status.get(id) ?? 'not-plotted',
    countOnDay: (date) => byDay.get(date)?.length ?? 0,
    ambiguousDays,
  };
};

/** A chart row that is one stored record: the date, the value column and the exact record behind the point. */
export type RecordChartRow<K extends string> = { date: string; recordId: string; entryCount: number } & Record<K, number>;

/** The chart rows for a plan: one per day, each carrying the exact id of the record it draws. */
export const recordChartRows = <T extends RecordLike, K extends string>(plan: RecordPlot<T>, key: K, getValue: (entry: T) => number): RecordChartRow<K>[] =>
  plan.plotted.map((entry) => ({ date: entry.date, recordId: entry.id, entryCount: plan.countOnDay(entry.date), [key]: getValue(entry) }) as RecordChartRow<K>);

export interface SleepChartRow {
  date: string;
  /** Manual hours (0 = none that day; the chart wrapper turns 0 into "no value"). */
  hours: number;
  /** WHOOP in-bed hours (0 = none). */
  whoopHours: number;
  /** The exact manual sleep record behind the point. Absent on a WHOOP-only day: that day has no record to jump to. */
  recordId?: string;
  entryCount: number;
}

/**
 * Daily sleep rows: the manual record of each day (see planRecordPlot) next to that day's WHOOP in-bed hours. A day with
 * only WHOOP data is a row WITHOUT `recordId`, so it can be looked at (and opened in Calendar) but never jumped to.
 * Same shape and same WHOOP rule as the Dashboard's sleep chart (the later WHOOP row of a day wins), newest first.
 */
export const sleepChartRows = <T extends RecordLike & { hours: number }>(
  plan: RecordPlot<T>,
  whoop: readonly { date: string; total_in_bed_hours: number | null }[],
): SleepChartRow[] => {
  const rows = new Map<string, SleepChartRow>();
  for (const entry of plan.plotted) {
    rows.set(entry.date, { date: entry.date, hours: entry.hours, whoopHours: 0, recordId: entry.id, entryCount: plan.countOnDay(entry.date) });
  }
  for (const entry of whoop) {
    const inBed = entry.total_in_bed_hours ?? 0;
    if (!inBed) continue;
    const existing = rows.get(entry.date);
    if (existing) existing.whoopHours = inBed;
    else rows.set(entry.date, { date: entry.date, hours: 0, whoopHours: inBed, entryCount: 0 });
  }
  return [...rows.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
};

export type RevealStatus = 'visible' | 'filtered-out' | 'missing';

/** Can the history list show this exact record right now? `visible` is what the page passes to the list after filtering. */
export const revealStatus = (id: string, all: readonly { id: string }[], visible: readonly { id: string }[]): RevealStatus =>
  visible.some((entry) => entry.id === id) ? 'visible' : all.some((entry) => entry.id === id) ? 'filtered-out' : 'missing';

/** The smallest range (of the ones the chart offers) whose window, ending today, includes `date`. Null when none does. */
export const smallestRangeIncluding = (date: string, allowed: readonly ChartRange[], today: string): ChartRange | null => {
  if (date > today) return allowed.includes('all') ? 'all' : null;
  const days = (r: ChartRange) => (r === 'all' ? Infinity : Number(r));
  const ordered = CHART_RANGES.filter((r) => allowed.includes(r)).sort((a, b) => days(a) - days(b));
  for (const range of ordered) {
    if (range === 'all') return range;
    if (date >= rangeStart(range, today)) return range;
  }
  return null;
};
