// Chart "pick A and B, then open Compare": the pure rules. No React, no Recharts, no router (tests/chartComparePicks.test.ts).
//
// ## What can be picked
// Only a chart point that is ONE exact stored record AND that `compareEligibility` (src/lib/compareUrl.ts) accepts:
// a Weight record, or a MANUAL Sleep record. Waist, a WHOOP series, a WHOOP-only day and every daily / weekly / period
// aggregate are refused, each with a plain reason. Nothing is matched by date: a pick is the record id.
//
// ## Which series was clicked matters (Sleep)
// A Sleep day can hold a manual record AND WHOOP hours. The day is one selection (chart, table and steppers share it), but
// when the person pressed the WHOOP series the "backing" of that selection is WHOOP, which Compare does not support. The
// manual record is then NOT silently picked: the point is refused with a reason that says to choose the manual point or
// the Table row. A table row or a Previous / Next step names no series, so its backing is the record itself.
//
// ## Picks
//   - A and B are two slots. Setting A replaces A, setting B replaces B. Nothing is ever moved to the other slot on its own.
//   - Setting a slot to the record it already holds clears that slot (a toggle, like aria-pressed says).
//   - Setting a slot to the record the OTHER slot holds is refused ('duplicate'): Compare needs two different entries.
//   - Swap exchanges the two. Clear empties both.
//
// ## Staying honest
// The chart's dataset is the VISIBLE range only. `reconcilePicks` drops a pick whose record is no longer one of the
// available points (range narrowed, record deleted, data refreshed without it) and refreshes the others' date and value from
// the rows that are there now. Widening the range later does not bring a dropped pick back.
//
// ## B - A
// Raw stored values, never chart positions. `days` is B's date minus A's date. Rate per week only when B is after A.
import { parseIsoDate } from './selectedDay';
import { buildCompareHrefFromRefs, compareEligibility, type CompareIneligibleReason, type CompareLinkCategory } from './compareUrl';
import { joinUnit, roundCell, tableCellText, type ChartViewerDataset } from './chartViewerData';
import type { ChartPointRef } from './chartSelection';

export type CompareSlot = 'a' | 'b';

export const otherSlot = (slot: CompareSlot): CompareSlot => (slot === 'a' ? 'b' : 'a');
export const slotLabel = (slot: CompareSlot): 'A' | 'B' => (slot === 'a' ? 'A' : 'B');

export interface ComparePick {
  /** The exact stored record. The only identity a pick has. */
  recordId: string;
  /** The chart row that currently shows it (refreshed by reconcilePicks). */
  rowId: string;
  isoDate: string;
  /** The record's raw value (kg, hours). */
  value: number;
  /**
   * POINT MODE only (in-viewer comparison, src/lib/chartPointCompare.ts). Then `recordId` is just the point's identity (its exact
   * record id when it is one, else its row id) and these describe the point. Absent for the exact-record picks of the Weight / Sleep pages.
   * `label` names a categorical point ("Morning", with `isoDate` ''); `values` holds ONLY the series the point really observed (never a 0
   * for a missing one); `exact` is set when the point is also one exact stored record Compare can open.
   */
  label?: string;
  values?: Readonly<Record<string, number>>;
  exact?: { recordId: string; category: CompareLinkCategory };
}

export interface ComparePicks {
  a: ComparePick | null;
  b: ComparePick | null;
}

export const EMPTY_PICKS: ComparePicks = { a: null, b: null };

const isReal = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/* ------------------------------------------------------------------ candidates */

export type CandidateReason = CompareIneligibleReason | 'no-value';

export type CompareCandidate =
  | { ok: true; category: CompareLinkCategory | null; pick: ComparePick }
  | { ok: false; reason: CandidateReason; text: string };

const valueColumnLabel = (dataset: ChartViewerDataset, key: string) => dataset.columns.find((c) => c.key === key)?.label ?? key;

/** Plain-language refusal, shown instead of a disabled button. */
const reasonText = (dataset: ChartViewerDataset, reason: CandidateReason, viaSeriesKey: string | null): string => {
  const compare = dataset.selection?.compare;
  const noun = compare?.noun ?? 'entry';
  switch (reason) {
    case 'not-manual-source': {
      const clicked = viaSeriesKey ? valueColumnLabel(dataset, viaSeriesKey) : 'That series';
      const own = compare ? valueColumnLabel(dataset, compare.valueKey) : 'the saved entry';
      return `${clicked} can't be compared. Select the ${own} point for this day (or its Table row) to compare its ${noun}.`;
    }
    case 'no-value':
      return `This day has no ${noun} value to compare.`;
    default:
      return `This day has no saved ${noun} to compare. Compare only uses single saved ${noun}s, not summaries or other data sources.`;
  }
};

/**
 * Can this selected point be a pick? `viaSeriesKey` is the series the person pressed on the plot (null for a Table row or a
 * Previous / Next step). Never throws, never guesses.
 */
export const compareCandidate = (dataset: ChartViewerDataset, point: ChartPointRef | null, viaSeriesKey: string | null = null): CompareCandidate | null => {
  const compare = dataset.selection?.compare;
  if (!compare || !point) return null;
  const refuse = (reason: CandidateReason): CompareCandidate => ({ ok: false, reason, text: reasonText(dataset, reason, viaSeriesKey) });
  const origin = point.day.origin;
  // The record-backed series is "manual" by definition; any other series the person pressed has a different source.
  const source = viaSeriesKey !== null && viaSeriesKey !== compare.valueKey ? viaSeriesKey : 'manual';
  const eligibility = compareEligibility({ kind: origin?.kind ?? 'daily-aggregate', metric: origin?.metric ?? '', recordId: origin?.recordId, source });
  if (eligibility.eligible !== true) return refuse((eligibility as { reason: CompareIneligibleReason }).reason);
  const index = dataset.rows.findIndex((row, i) => dataset.rowId(row, i) === point.rowId);
  const value = index >= 0 ? (dataset.rows[index] as Record<string, unknown>)[compare.valueKey] : undefined;
  if (!isReal(value)) return refuse('no-value');
  return { ok: true, category: eligibility.category, pick: { recordId: eligibility.recordId, rowId: point.rowId, isoDate: point.day.isoDate, value } };
};

/** Every record of the dataset that could be picked right now, by record id (series-free: the record itself). */
export const availablePicks = (dataset: ChartViewerDataset, points: readonly ChartPointRef[]): Map<string, ComparePick> => {
  const map = new Map<string, ComparePick>();
  for (const point of points) {
    const candidate = compareCandidate(dataset, point, null);
    if (candidate?.ok) map.set(candidate.pick.recordId, candidate.pick);
  }
  return map;
};

/* ------------------------------------------------------------------ changing picks */

export type PickOutcome =
  /** The slot now holds the record (`replaced` says it held another one before). */
  | { kind: 'set'; slot: CompareSlot; replaced: ComparePick | null }
  /** The record was already in that slot, so the slot was emptied. */
  | { kind: 'cleared'; slot: CompareSlot }
  /** The record is already in the OTHER slot: nothing changed. */
  | { kind: 'duplicate'; slot: CompareSlot };

export const togglePick = (picks: ComparePicks, slot: CompareSlot, pick: ComparePick): { picks: ComparePicks; outcome: PickOutcome } => {
  if (picks[slot]?.recordId === pick.recordId) return { picks: { ...picks, [slot]: null }, outcome: { kind: 'cleared', slot } };
  if (picks[otherSlot(slot)]?.recordId === pick.recordId) return { picks, outcome: { kind: 'duplicate', slot } };
  return { picks: { ...picks, [slot]: pick }, outcome: { kind: 'set', slot, replaced: picks[slot] } };
};

export const swapPicks = (picks: ComparePicks): ComparePicks => ({ a: picks.b, b: picks.a });

export const hasPicks = (picks: ComparePicks): boolean => picks.a !== null || picks.b !== null;

/** Which slot (if any) holds this record. */
export const slotOfRecord = (picks: ComparePicks, recordId: string | null | undefined): CompareSlot | null =>
  recordId == null ? null : picks.a?.recordId === recordId ? 'a' : picks.b?.recordId === recordId ? 'b' : null;

export interface Reconciled {
  picks: ComparePicks;
  /** The picks that were dropped (with what they were), in A, B order. */
  dropped: { slot: CompareSlot; pick: ComparePick }[];
}

/**
 * Compare the picks with the records available now. A missing record is dropped; the others get their current row, date and
 * value. Returns the SAME object when nothing changed, so callers can use identity to avoid needless updates.
 */
const sameValues = (a?: Readonly<Record<string, number>>, b?: Readonly<Record<string, number>>): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

const samePick = (a: ComparePick, b: ComparePick): boolean =>
  a.rowId === b.rowId && a.isoDate === b.isoDate && Object.is(a.value, b.value) && a.label === b.label && sameValues(a.values, b.values) && a.exact?.recordId === b.exact?.recordId;

export const reconcilePicks = (picks: ComparePicks, available: ReadonlyMap<string, ComparePick>): { picks: ComparePicks; dropped: Reconciled['dropped'] } => {
  const dropped: Reconciled['dropped'] = [];
  const next: ComparePicks = { a: null, b: null };
  let changed = false;
  for (const slot of ['a', 'b'] as const) {
    const pick = picks[slot];
    if (!pick) continue;
    const now = available.get(pick.recordId);
    if (!now) {
      dropped.push({ slot, pick });
      changed = true;
      continue;
    }
    next[slot] = samePick(now, pick) ? pick : now;
    if (next[slot] !== pick) changed = true;
  }
  return changed ? { picks: next, dropped } : { picks, dropped };
};

/* ------------------------------------------------------------------ B - A */

export interface PickDifference {
  /** B minus A, rounded like the table. */
  delta: number;
  /** Neutral words only: this never says better or worse. */
  direction: 'higher' | 'lower' | 'same';
  /** B's date minus A's date, in whole days. Negative when B is the earlier entry. */
  days: number;
  sameDay: boolean;
  /** Change per week (B - A over the days between them). Null on the same day and when B is earlier than A. */
  ratePerWeek: number | null;
}

const DAY_MS = 86_400_000;
export const dayNumber = (iso: string): number | null => {
  const parts = parseIsoDate(iso);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS : null;
};

export const comparePickDifference = (a: ComparePick, b: ComparePick, digits = 2): PickDifference | null => {
  const dayA = dayNumber(a.isoDate);
  const dayB = dayNumber(b.isoDate);
  if (dayA === null || dayB === null) return null;
  const raw = b.value - a.value;
  const delta = roundCell(raw, digits);
  const days = dayB - dayA;
  return {
    delta,
    direction: delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'same',
    days,
    sameDay: days === 0,
    ratePerWeek: days > 0 ? roundCell((raw / days) * 7, Math.max(digits, 2)) : null,
  };
};

const MINUS = '\u2212';

export const formatPickValue = (value: number, unit: string, digits = 2): string => {
  const text = tableCellText(value, { key: 'v', label: 'v', digits }) ?? String(value);
  return joinUnit(text, unit);
};

/** "+0.4 kg" / "\u22120.4 kg" / "0 kg". */
export const formatSignedDelta = (delta: number, unit: string, digits = 2): string => {
  const text = tableCellText(Math.abs(delta), { key: 'v', label: 'v', digits }) ?? String(Math.abs(delta));
  const sign = delta > 0 ? '+' : delta < 0 ? MINUS : '';
  return `${sign}${joinUnit(text, unit)}`;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The change as plain words: no good / bad judgement, no per-week rate for the same day. */
export const describePickDifference = (diff: PickDifference, unit: string, digits = 2): { headline: string; timing: string; rate: string | null } => {
  const headline = `B ${MINUS} A: ${formatSignedDelta(diff.delta, unit, digits)} (${diff.direction === 'same' ? 'no change' : diff.direction})`;
  if (diff.sameDay) return { headline, timing: 'Same day', rate: null };
  const n = Math.abs(diff.days);
  return {
    headline,
    timing: diff.days > 0 ? `B is ${plural(n, 'day')} after A` : `B is ${plural(n, 'day')} before A`,
    rate: diff.ratePerWeek === null ? null : `${formatSignedDelta(diff.ratePerWeek, unit, Math.max(digits, 2))} per week`,
  };
};

/* ------------------------------------------------------------------ the link */

/** `/compare?category=...&a=<id>&b=<id>` for two picks in A, B order, or null (fewer than two, or not eligible). Never sorted by date. */
export const compareHrefForPicks = (picks: ComparePicks, metric: string): string | null => {
  if (!picks.a || !picks.b) return null;
  const result = buildCompareHrefFromRefs([picks.a, picks.b].map((p) => ({ kind: 'record' as const, metric, recordId: p.recordId, source: 'manual' })));
  // Two DIFFERENT records, or no link: a repeated id would collapse to a one-record link.
  return result.ok && result.recordIds.length === 2 ? result.href : null;
};

/* ------------------------------------------------------------------ announcements */

/** "Oct 30, 2026": the date as people read it (UTC calendar day, no time zone shifts). Falls back to the text itself. */
export const formatPickDate = (iso: string): string => {
  const parts = parseIsoDate(iso);
  return parts ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day))) : iso;
};

export const describePick = (pick: ComparePick, unit: string, digits = 2): string => `${formatPickDate(pick.isoDate)}, ${formatPickValue(pick.value, unit, digits)}`;

export const describeOutcome = (outcome: PickOutcome, pick: ComparePick, unit: string, digits = 2): string => {
  const label = slotLabel(outcome.slot);
  switch (outcome.kind) {
    case 'set':
      return outcome.replaced
        ? `${label} replaced: it was ${describePick(outcome.replaced, unit, digits)}, now ${describePick(pick, unit, digits)}.`
        : `${label} set to ${describePick(pick, unit, digits)}.`;
    case 'cleared':
      return `${label} cleared.`;
    case 'duplicate':
      return `That entry is already ${slotLabel(otherSlot(outcome.slot))}. Compare needs two different entries: pick another one, or use Swap.`;
  }
};

export const describeDropped = (dropped: Reconciled['dropped'], unit: string, digits = 2): string => {
  const parts = dropped.map(({ slot, pick }) => `${slotLabel(slot)} (${describePick(pick, unit, digits)})`);
  const subject = parts.length === 2 ? `${parts[0]} and ${parts[1]} are` : `${parts[0]} is`;
  return `${subject} no longer on this chart (outside the date range, or the entry was removed), so ${parts.length === 2 ? 'they were' : 'it was'} cleared.`;
};
