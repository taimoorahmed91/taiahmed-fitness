import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOptionalUserId } from '@/contexts/userContextCore';
import type { ChartDaySelection } from '@/components/charts/useChartDaySelection';
import {
  availablePicks, compareCandidate, compareHrefForPicks, comparePickDifference, describeDropped, describeOutcome, EMPTY_PICKS, formatPickDate, hasPicks,
  reconcilePicks, slotOfRecord, swapPicks, togglePick,
  type CompareCandidate, type ComparePick, type ComparePicks, type CompareSlot, type PickDifference,
} from '@/lib/chartComparePicks';
import {
  comparePointPicks, comparePoints, describePointDropped, describePointOutcome, exactCompareLink, pointOptions, pointSeries,
  type PointComparison, type PointSeries,
} from '@/lib/chartPointCompare';

/**
 * The ordered A / B picks of a chart, in one of two modes (decided by the dataset, never by the chart component):
 *
 *  - `record`  (dataset.selection.compare only: the Weight and Sleep PAGES) two exact Weight / manual Sleep records, then Open in Compare.
 *  - `point`   (dataset.pointCompare: every Dashboard graph) two points of the chart, compared IN the viewer: B - A per series. A date chart
 *              compares two days, a categorical chart two categories. Open in Compare exists only when BOTH points are also exact records
 *              (Weight, manual Sleep: dataset.selection.compare), never for an aggregate or a category.
 *
 * Both modes share the same A / B slots, notices, account scope and "hidden pick" reset described below.
 *
 * The chart component owns it, like the selected day, so the card strip, the full-screen viewer's controls, its Table marks
 * and the plot marks all read the SAME picks. What it keeps is only two record ids (plus the date / value they had when picked);
 * what it SHOWS is always resolved against the rows on screen right now (`reconcilePicks`):
 *   - a pick whose record is not one of the visible, eligible points (range narrowed, record deleted) disappears in the very
 *     render it left, and the text says so (an announcement, never an invisible compare state);
 *   - widening the range later does not bring it back;
 *   - a different account sees nothing from the last one (the scope check happens during render, like the day selection).
 * Picks survive Chart / Table switches and Line / Bar, which do not change the rows.
 */
/** Point mode only: everything the in-viewer comparison needs that the exact-record picks do not. */
export interface PointCompareState {
  kind: 'date' | 'category';
  /** What one point is called: "day", "time of day". */
  noun: string;
  nounPlural: string;
  series: PointSeries[];
  /** Every pickable point, for the pickers (days newest first, categories in listed order). Identity is `recordId`. */
  options: ComparePick[];
  /** B - A per series, when both are set. */
  comparison: PointComparison | null;
  /** Why Open in Compare is not offered although the chart can open exact records (one pick is not a saved entry). */
  linkNote: string | null;
  /** What an exact record is called ("weight entry"), or null when the chart can never open Compare. */
  exactNoun: string | null;
  /** The chart lets the person select a day (so the selected point is the candidate); false = pickers only. */
  hasSelection: boolean;
  /** Put the point with this identity in a slot (null empties the slot). Picking the other slot's point is refused with a message. */
  setSlotTo: (slot: CompareSlot, id: string | null) => void;
}

export interface ChartComparePicks {
  /** 'record' (exact records of the Weight / Sleep pages) or 'point' (in-viewer comparison). Null when the chart did not opt in. */
  mode: 'record' | 'point' | null;
  point: PointCompareState | null;
  /** The chart opted in and has something to show: something pickable (point mode: at least two points), a pick, or a pending message. */
  enabled: boolean;
  noun: string;
  unit: string;
  digits: number;
  metric: string;
  a: ComparePick | null;
  b: ComparePick | null;
  /** The selected point as a candidate: pickable, or why not. Null when nothing is selected. */
  candidate: CompareCandidate | null;
  /** Which slot the selected point's record already holds. */
  slotOfSelected: CompareSlot | null;
  /** `markOf(rowId)`: the slot a chart row's record holds (for the Table and the plot). */
  markOf: (rowId: string) => CompareSlot | null;
  /** B minus A, when both are set. */
  difference: PickDifference | null;
  /** /compare?... for two picks in order, else null. */
  href: string | null;
  /** The latest thing worth saying (action result, conflict, dropped pick). Shown and announced; the next action replaces it. */
  notice: string;
  /** Set (or toggle off) the selected point as A or B. Does nothing when there is no pickable selection. */
  setSlot: (slot: CompareSlot) => void;
  swap: () => void;
  clear: () => void;
  dismissNotice: () => void;
}

const DISABLED: ChartComparePicks = {
  mode: null, point: null, enabled: false, noun: '', unit: '', digits: 2, metric: '', a: null, b: null, candidate: null, slotOfSelected: null, markOf: () => null,
  difference: null, href: null, notice: '', setSlot: () => {}, swap: () => {}, clear: () => {}, dismissNotice: () => {},
};

interface Stored { scope: string | null; picks: ComparePicks; notice: string }

export const useChartComparePicks = (selection: ChartDaySelection): ChartComparePicks => {
  const scope = useOptionalUserId();
  const dataset = selection.dataset;
  const recordConfig = dataset.selection?.compare;
  const pointConfig = dataset.pointCompare;
  const mode: 'record' | 'point' | null = pointConfig ? 'point' : recordConfig ? 'record' : null;
  const metric = dataset.selection?.metric ?? '';
  const [stored, setStored] = useState<Stored>({ scope, picks: EMPTY_PICKS, notice: '' });
  const sameScope = stored.scope === scope;

  // Point mode: every pickable point of the visible rows. Record mode: every exact record. Either way, only what is on screen now.
  const points = useMemo(() => (mode === 'point' ? comparePoints(dataset) : []), [mode, dataset]);
  const series = useMemo(() => (mode === 'point' ? pointSeries(dataset) : []), [mode, dataset]);
  const available = useMemo(() => {
    if (mode === 'point') return new Map(points.map((p) => [p.recordId, p] as const));
    return recordConfig ? availablePicks(dataset, selection.points) : new Map<string, ComparePick>();
  }, [mode, points, recordConfig, dataset, selection.points]);
  // What is on screen: the stored picks, only for this account, resolved against the points visible now.
  const reconciled = useMemo(() => reconcilePicks(sameScope ? stored.picks : EMPTY_PICKS, available), [sameScope, stored.picks, available]);
  const picks = reconciled.picks;

  const kind = pointConfig?.kind ?? 'date';
  const nounPlural = pointConfig?.nounPlural ?? 'entries';
  const unit = recordConfig?.unit ?? '';
  const digits = recordConfig?.digits ?? 2;

  // The account changed: drop the old account's picks and notice (the render above already hid them).
  useEffect(() => {
    if (!sameScope) setStored({ scope, picks: EMPTY_PICKS, notice: '' });
  }, [sameScope, scope]);

  // Something left the chart (range narrowed, record removed) or changed value: keep the stored picks in step and say so.
  useEffect(() => {
    if (!sameScope || reconciled.picks === stored.picks) return;
    const text = reconciled.dropped.length === 0 ? '' : mode === 'point' ? describePointDropped(reconciled.dropped, series, kind) : describeDropped(reconciled.dropped, unit, digits);
    setStored((current) => (current.scope !== scope ? current : { scope, picks: reconciled.picks, notice: text || current.notice }));
  }, [sameScope, scope, reconciled, stored.picks, mode, series, kind, unit, digits]);

  // The selected point as a candidate. Record mode: pickable, or why not. Point mode: the selected day's point (every selected day is one).
  const candidate = useMemo((): CompareCandidate | null => {
    if (mode === 'record') return compareCandidate(dataset, selection.selected, selection.selectedSeriesKey);
    // Fewer than two pickable points: nothing can be started (a pick that is already set can still be changed).
    if (mode === 'point' && points.length < 2 && !hasPicks(picks)) return null;
    if (mode === 'point' && selection.selected) {
      const pick = available.get(points.find((p) => p.rowId === selection.selected!.rowId)?.recordId ?? '');
      // A selected day can have nothing recorded for Compare's purposes (a workout chart's rest day): say so instead of a missing button.
      return pick
        ? { ok: true, category: pick.exact?.category ?? null, pick }
        : { ok: false, reason: 'no-value', text: `Nothing was recorded on this ${pointConfig?.noun ?? 'day'}, so it can't be compared.` };
    }
    return null;
  }, [mode, dataset, selection.selected, selection.selectedSeriesKey, available, points, pointConfig, picks]);

  const apply = useCallback((slot: CompareSlot, pick: ComparePick, toggle: boolean) => {
    setStored((current) => {
      const base = current.scope === scope ? current.picks : EMPTY_PICKS;
      // A picker that chooses what the slot already holds changes nothing (only the Set buttons toggle).
      if (!toggle && base[slot]?.recordId === pick.recordId) return current;
      const { picks: next, outcome } = togglePick(base, slot, pick);
      return { scope, picks: next, notice: mode === 'point' ? describePointOutcome(outcome, pick, series, nounPlural) : describeOutcome(outcome, pick, unit, digits) };
    });
  }, [scope, mode, series, nounPlural, unit, digits]);

  const setSlot = useCallback((slot: CompareSlot) => {
    if (candidate?.ok) apply(slot, candidate.pick, true);
  }, [candidate, apply]);

  const setSlotTo = useCallback((slot: CompareSlot, id: string | null) => {
    if (id === null || id === '') {
      setStored((current) => {
        const base = current.scope === scope ? current.picks : EMPTY_PICKS;
        return base[slot] ? { scope, picks: { ...base, [slot]: null }, notice: `${slot === 'a' ? 'A' : 'B'} cleared.` } : current;
      });
      return;
    }
    const pick = available.get(id);
    if (pick) apply(slot, pick, false);
  }, [available, apply, scope]);

  const swap = useCallback(() => {
    setStored((current) => {
      const base = current.scope === scope ? current.picks : EMPTY_PICKS;
      if (!base.a && !base.b) return current;
      const next = swapPicks(base);
      const name = (p: ComparePick) => (p.label ?? formatPickDate(p.isoDate));
      return { scope, picks: next, notice: next.a && next.b ? `Swapped. A is now ${name(next.a)}, B is now ${name(next.b)}.` : `Swapped. ${next.a ? 'A' : 'B'} is set, ${next.a ? 'B' : 'A'} is empty.` };
    });
  }, [scope]);
  const clear = useCallback(() => setStored({ scope, picks: EMPTY_PICKS, notice: 'Compare picks cleared.' }), [scope]);
  const dismissNotice = useCallback(() => setStored((current) => (current.notice ? { ...current, notice: '' } : current)), []);

  const markOf = useCallback((rowId: string): CompareSlot | null => {
    if (picks.a?.rowId === rowId) return 'a';
    if (picks.b?.rowId === rowId) return 'b';
    return null;
  }, [picks]);

  return useMemo(() => {
    if (!mode) return DISABLED;
    const both = picks.a && picks.b;
    const exactNoun = recordConfig?.noun ?? null;
    const exact = mode === 'point' ? exactCompareLink(picks.a, picks.b, exactNoun) : null;
    const point: PointCompareState | null = mode === 'point' && pointConfig
      ? {
          kind, noun: pointConfig.noun, nounPlural, series,
          options: pointOptions(dataset, points),
          comparison: both ? comparePointPicks(picks.a!, picks.b!, series, kind) : null,
          linkNote: exact?.note ?? null,
          exactNoun,
          hasSelection: selection.enabled,
          setSlotTo,
        }
      : null;
    return {
      mode, point,
      // A pending message keeps the section on screen: when a narrower range drops the picks (even leaving fewer than two points to compare),
      // the person still sees and hears why they vanished. Starting a comparison still needs two pickable points.
      enabled: (mode === 'point' ? points.length > 1 : available.size > 0) || hasPicks(picks) || (sameScope && stored.notice !== ''),
      noun: recordConfig?.noun ?? pointConfig?.noun ?? '', unit, digits, metric,
      a: picks.a, b: picks.b,
      candidate,
      slotOfSelected: candidate?.ok ? slotOfRecord(picks, candidate.pick.recordId) : null,
      markOf,
      difference: mode === 'record' && both ? comparePickDifference(picks.a!, picks.b!, digits) : null,
      href: mode === 'point' ? exact?.href ?? null : compareHrefForPicks(picks, metric),
      // A notice that belongs to another account never shows.
      notice: sameScope ? stored.notice : '',
      setSlot, swap, clear, dismissNotice,
    };
  }, [mode, recordConfig, pointConfig, kind, nounPlural, series, dataset, points, available, picks, candidate, unit, digits, metric, markOf, sameScope, stored.notice, selection.enabled, setSlot, setSlotTo, swap, clear, dismissNotice]);
};
