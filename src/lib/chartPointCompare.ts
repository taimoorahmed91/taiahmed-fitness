// In-viewer A / B comparison of two POINTS of any chart: the pure rules. No React, no Recharts, no router (tests/chartPointCompare.test.ts).
// It generalizes the exact-record picks of src/lib/chartComparePicks.ts (same A / B slots, same toggle / swap / reconcile, same B - A
// order, same neutral words) to every chart whose dataset opted in with `pointCompare` (see ChartDatasetPointCompare).
//
// ## What a point is
//   date      one UTC calendar day of a daily chart (identity: the row's date; the exact record id instead when the point IS one).
//   category  one named group of a categorical chart ("Morning"). No date exists: nothing here ever mentions dates, days or elapsed time for it.
//
// ## What can be picked
// Only a point that was really OBSERVED: at least one pick column holds a real number (an explicit 0 counts; null, blank, NaN and
// Infinity never do) and the chart's own `isObserved` (macro intake that was not fully logged, a time of day with no meals) agrees.
// A point keeps ONLY the values it observed. A value it did not observe is absent, never 0.
//
// ## B - A
// Per series, from the raw stored numbers, rounded like the table. Only a series both picks observed has a difference; a series just one
// pick observed is shown with the other side as "not recorded" and no difference; a series neither observed is left out. Neutral words:
// higher / lower / no change. For dates, how many calendar days apart (negative when B is the earlier day).
//
// ## Open in Compare
// Never invented here. A link exists only when BOTH picks are also exact stored records of the same Compare category (Weight records, manual
// Sleep records; see compareEligibility in src/lib/compareUrl.ts), built from those record ids in A, B order. Everything else stays in-viewer.
import { parseIsoDate } from './selectedDay';
import { selectableChartPoints } from './chartSelection';
import { buildCompareHrefFromRefs } from './compareUrl';
import { compareCandidate, dayNumber, formatPickDate, formatPickValue, formatSignedDelta, slotLabel, type ComparePick, type PickOutcome, type Reconciled } from './chartComparePicks';
import { roundCell, type ChartViewerDataset } from './chartViewerData';

const isReal = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const MINUS = '\u2212';

export interface PointSeries {
  key: string;
  label: string;
  unit: string;
  digits: number;
}

/** The compared series of a dataset, in the dataset's column order, with their label / unit / digits. */
export const pointSeries = (dataset: ChartViewerDataset): PointSeries[] => {
  const config = dataset.pointCompare;
  if (!config) return [];
  return config.seriesKeys.flatMap((key) => {
    const column = dataset.columns.find((c) => c.key === key);
    return column ? [{ key, label: column.label, unit: column.unit ?? '', digits: column.digits ?? 2 }] : [];
  });
};

/** Every point of the dataset that can be picked right now, in plot / listed order. Empty when the chart did not opt in or its data is unavailable. */
export const comparePoints = (dataset: ChartViewerDataset): ComparePick[] => {
  const config = dataset.pointCompare;
  if (!config || dataset.status?.unavailable) return [];
  const labelKey = config.labelKey ?? (config.kind === 'date' ? 'date' : 'name');
  const pickKeys = config.pickKeys ?? dataset.selection?.valueKeys ?? config.seriesKeys;
  const isObserved = config.isObserved ?? dataset.selection?.isObserved;
  // Exact-record capability (Weight / manual Sleep): decided by the SAME eligibility rules as the pages' exact picks, per row.
  const selectable = config.kind === 'date' && dataset.selection?.compare ? new Map(selectableChartPoints(dataset).map((p) => [p.rowId, p] as const)) : null;
  const seen = new Set<string>();
  const points: ComparePick[] = [];
  dataset.rows.forEach((row, index) => {
    if (!pickKeys.some((key) => isReal(row[key]))) return;
    if (isObserved && !isObserved(row, index)) return;
    const name = row[labelKey];
    let isoDate = '';
    let label: string | undefined;
    if (config.kind === 'date') {
      if (!parseIsoDate(name)) return;
      isoDate = name as string;
    } else {
      if (typeof name !== 'string' || name === '') return;
      label = name;
    }
    const rowId = dataset.rowId(row, index);
    const dedupe = config.kind === 'date' ? isoDate : name as string;
    if (seen.has(dedupe)) return; // one point per day / per category
    seen.add(dedupe);
    const values: Record<string, number> = {};
    for (const key of config.seriesKeys) if (isReal(row[key])) values[key] = row[key] as number;
    const first = Object.values(values)[0] ?? (row[pickKeys.find((key) => isReal(row[key])) as string] as number);
    const ref = selectable?.get(rowId);
    const candidate = ref ? compareCandidate(dataset, ref, null) : null;
    const exact = candidate?.ok && candidate.category ? { recordId: candidate.pick.recordId, category: candidate.category } : undefined;
    points.push({ recordId: exact?.recordId ?? rowId, rowId, isoDate, value: first, ...(label !== undefined ? { label } : {}), values, ...(exact ? { exact } : {}) });
  });
  return points;
};

/** Pickers list days newest first (a time series is read from now backwards) and categories in their listed order. */
export const pointOptions = (dataset: ChartViewerDataset, points: readonly ComparePick[]): ComparePick[] =>
  dataset.pointCompare?.kind === 'date' ? [...points].reverse() : [...points];

/* ------------------------------------------------------------------ wording */

export const pointName = (pick: ComparePick): string => pick.label ?? formatPickDate(pick.isoDate);

const valueText = (series: PointSeries, value: number): string => formatPickValue(value, series.unit, series.digits);

/** The observed values of a pick, labelled: "Manual Sleep 7.5 hrs". */
export const pointValueParts = (pick: ComparePick, series: readonly PointSeries[]): string[] =>
  series.flatMap((s) => (isReal(pick.values?.[s.key]) ? [`${s.label} ${valueText(s, pick.values![s.key])}`] : []));

/**
 * The visible summary: a single-series chart shows its one value ("Oct 30, 2026 · 80.9 kg"); a chart with several series shows the name only
 * (the B - A table carries every value). `null` when there is nothing to add.
 */
export const pointInlineValue = (pick: ComparePick, series: readonly PointSeries[]): string | null => {
  if (series.length !== 1) return null;
  const only = series[0];
  const value = pick.values?.[only.key];
  return isReal(value) ? valueText(only, value) : null;
};

/** For announcements and accessible names: "Oct 30, 2026, 80.9 kg" / "Oct 30, 2026, Manual Sleep 7.5 hrs, WHOOP Sleep 8.1 hrs" / "Morning". */
export const describePointPick = (pick: ComparePick, series: readonly PointSeries[]): string => {
  const inline = pointInlineValue(pick, series);
  if (inline !== null) return `${pointName(pick)}, ${inline}`;
  const parts = pointValueParts(pick, series);
  return parts.length > 0 && parts.length <= 2 ? `${pointName(pick)}, ${parts.join(', ')}` : pointName(pick);
};

export const describePointOutcome = (outcome: PickOutcome, pick: ComparePick, series: readonly PointSeries[], nounPlural: string): string => {
  const label = slotLabel(outcome.slot);
  switch (outcome.kind) {
    case 'set':
      return outcome.replaced
        ? `${label} replaced: it was ${describePointPick(outcome.replaced, series)}, now ${describePointPick(pick, series)}.`
        : `${label} set to ${describePointPick(pick, series)}.`;
    case 'cleared':
      return `${label} cleared.`;
    case 'duplicate':
      return `That is already ${slotLabel(outcome.slot === 'a' ? 'b' : 'a')}. Compare needs two different ${nounPlural}: pick another one, or use Swap.`;
  }
};

export const describePointDropped = (dropped: Reconciled['dropped'], series: readonly PointSeries[], kind: 'date' | 'category'): string => {
  const parts = dropped.map(({ slot, pick }) => `${slotLabel(slot)} (${describePointPick(pick, series)})`);
  const subject = parts.length === 2 ? `${parts[0]} and ${parts[1]} are` : `${parts[0]} is`;
  const why = kind === 'date' ? 'outside the date range, or the entry was removed' : 'nothing is recorded for it in this range';
  return `${subject} no longer on this chart (${why}), so ${parts.length === 2 ? 'they were' : 'it was'} cleared.`;
};

/* ------------------------------------------------------------------ B - A */

export type Direction = 'higher' | 'lower' | 'same';

export interface SeriesDifference extends PointSeries {
  /** A's value, or null when A did not observe this series. */
  a: number | null;
  /** B's value, or null when B did not observe this series. */
  b: number | null;
  /** B minus A, rounded like the table. Null unless BOTH observed the series. */
  delta: number | null;
  direction: Direction | null;
  /** Which side has no value (so there is no difference). */
  missing: 'a' | 'b' | null;
}

export interface PointComparison {
  /** Series at least one pick observed, in the chart's order. */
  series: SeriesDifference[];
  /** How many of them have a difference (both observed). */
  compared: number;
  /** Dates only: B's day minus A's day, in whole calendar days. Null for categories (nothing about time is ever said). */
  days: number | null;
}

export const comparePointPicks = (a: ComparePick, b: ComparePick, series: readonly PointSeries[], kind: 'date' | 'category'): PointComparison => {
  const rows: SeriesDifference[] = [];
  for (const s of series) {
    const av = a.values?.[s.key];
    const bv = b.values?.[s.key];
    const hasA = isReal(av);
    const hasB = isReal(bv);
    if (!hasA && !hasB) continue; // nobody observed it: not a meaningful series for this pair
    const delta = hasA && hasB ? roundCell(bv - av, s.digits) : null;
    rows.push({
      ...s,
      a: hasA ? av : null,
      b: hasB ? bv : null,
      delta,
      direction: delta === null ? null : delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'same',
      missing: hasA ? (hasB ? null : 'b') : 'a',
    });
  }
  let days: number | null = null;
  if (kind === 'date') {
    const dayA = dayNumber(a.isoDate);
    const dayB = dayNumber(b.isoDate);
    days = dayA === null || dayB === null ? null : dayB - dayA;
  }
  return { series: rows, compared: rows.filter((r) => r.delta !== null).length, days };
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "B is 12 days after A" / "Same day" / "B is 3 days before A". Null for categories and when the dates are unreadable. */
export const describeTiming = (days: number | null): string | null => {
  if (days === null) return null;
  if (days === 0) return 'Same day';
  return days > 0 ? `B is ${plural(days, 'day')} after A` : `B is ${plural(-days, 'day')} before A`;
};

/** "+0.4 kg (higher)", "\u22120.4 kg (lower)", "0 kg (no change)". */
export const describeSeriesDelta = (row: SeriesDifference): string | null =>
  row.delta === null ? null : `${formatSignedDelta(row.delta, row.unit, row.digits)} (${row.direction === 'same' ? 'no change' : row.direction})`;

/** One plain sentence per series for a screen reader / the announcement: "Weight: B \u2212 A +0.4 kg (higher)". */
export const describeComparison = (comparison: PointComparison): string[] =>
  comparison.series.map((row) => {
    const delta = describeSeriesDelta(row);
    if (delta !== null) return `${row.label}: B ${MINUS} A ${delta}`;
    return `${row.label}: no difference, ${row.missing === 'a' ? 'A' : 'B'} has no value`;
  });

/* ------------------------------------------------------------------ Open in Compare (exact records only) */

export interface ExactLink {
  href: string | null;
  /** Why there is no link although the chart can send exact records to Compare. Null when there is a link or the picks are not both set. */
  note: string | null;
}

/**
 * `exactNoun` is what an exact record is called ("manual sleep entry"); null when the chart cannot send anything to Compare (then there is
 * never a link and never a note). Both picks must be exact records of the SAME category, otherwise the comparison stays in the viewer.
 */
export const exactCompareLink = (a: ComparePick | null, b: ComparePick | null, exactNoun: string | null): ExactLink => {
  if (!exactNoun || !a || !b) return { href: null, note: null };
  const missing = ([['A', a], ['B', b]] as const).filter(([, pick]) => !pick.exact).map(([name]) => name);
  if (missing.length > 0) {
    return { href: null, note: `Open in Compare needs a saved ${exactNoun} on both days. ${missing.join(' and ')} ${missing.length === 2 ? 'have' : 'has'} none, so this comparison stays here.` };
  }
  const ea = a.exact!;
  const eb = b.exact!;
  if (ea.category !== eb.category || ea.recordId === eb.recordId) return { href: null, note: null };
  const result = buildCompareHrefFromRefs([ea, eb].map((e) => ({ kind: 'record' as const, metric: e.category, recordId: e.recordId, source: 'manual' })));
  return { href: result.ok && result.recordIds.length === 2 ? result.href : null, note: null };
};
