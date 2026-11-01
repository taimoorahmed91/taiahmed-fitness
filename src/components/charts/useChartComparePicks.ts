import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOptionalUserId } from '@/contexts/userContextCore';
import type { ChartDaySelection } from '@/components/charts/useChartDaySelection';
import {
  availablePicks, compareCandidate, compareHrefForPicks, comparePickDifference, describeDropped, describeOutcome, EMPTY_PICKS, formatPickDate, hasPicks,
  reconcilePicks, slotOfRecord, swapPicks, togglePick,
  type CompareCandidate, type ComparePick, type ComparePicks, type CompareSlot, type PickDifference,
} from '@/lib/chartComparePicks';

/**
 * The ordered A / B picks of a chart that can send two exact records to Compare (Weight, manual Sleep).
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
export interface ChartComparePicks {
  /** The chart opted in (dataset.selection.compare) and has at least one pickable record. */
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
  enabled: false, noun: '', unit: '', digits: 2, metric: '', a: null, b: null, candidate: null, slotOfSelected: null, markOf: () => null,
  difference: null, href: null, notice: '', setSlot: () => {}, swap: () => {}, clear: () => {}, dismissNotice: () => {},
};

interface Stored { scope: string | null; picks: ComparePicks; notice: string }

export const useChartComparePicks = (selection: ChartDaySelection): ChartComparePicks => {
  const scope = useOptionalUserId();
  const dataset = selection.dataset;
  const config = dataset.selection?.compare;
  const metric = dataset.selection?.metric ?? '';
  const [stored, setStored] = useState<Stored>({ scope, picks: EMPTY_PICKS, notice: '' });
  const sameScope = stored.scope === scope;

  const available = useMemo(() => (config ? availablePicks(dataset, selection.points) : new Map<string, ComparePick>()), [config, dataset, selection.points]);
  // What is on screen: the stored picks, only for this account, resolved against the records visible now.
  const reconciled = useMemo(() => reconcilePicks(sameScope ? stored.picks : EMPTY_PICKS, available), [sameScope, stored.picks, available]);
  const picks = reconciled.picks;

  // The account changed: drop the old account's picks and notice (the render above already hid them).
  useEffect(() => {
    if (!sameScope) setStored({ scope, picks: EMPTY_PICKS, notice: '' });
  }, [sameScope, scope]);

  // Something left the chart (range narrowed, record removed) or changed value: keep the stored picks in step and say so.
  useEffect(() => {
    if (!sameScope || reconciled.picks === stored.picks) return;
    const digits = config?.digits ?? 2;
    setStored((current) => (current.scope !== scope ? current : {
      scope,
      picks: reconciled.picks,
      notice: reconciled.dropped.length > 0 ? describeDropped(reconciled.dropped, config?.unit ?? '', digits) : current.notice,
    }));
  }, [sameScope, scope, reconciled, stored.picks, config]);

  const candidate = useMemo(
    () => (config ? compareCandidate(dataset, selection.selected, selection.selectedSeriesKey) : null),
    [config, dataset, selection.selected, selection.selectedSeriesKey],
  );
  const unit = config?.unit ?? '';
  const digits = config?.digits ?? 2;

  const setSlot = useCallback((slot: CompareSlot) => {
    if (!candidate?.ok) return;
    const pick = candidate.pick;
    setStored((current) => {
      const base = current.scope === scope ? current.picks : EMPTY_PICKS;
      const { picks: next, outcome } = togglePick(base, slot, pick);
      return { scope, picks: next, notice: describeOutcome(outcome, pick, unit, digits) };
    });
  }, [candidate, scope, unit, digits]);

  const swap = useCallback(() => {
    setStored((current) => {
      const base = current.scope === scope ? current.picks : EMPTY_PICKS;
      if (!base.a && !base.b) return current;
      const next = swapPicks(base);
      return { scope, picks: next, notice: next.a && next.b ? `Swapped. A is now ${formatPickDate(next.a.isoDate)}, B is now ${formatPickDate(next.b.isoDate)}.` : `Swapped. ${next.a ? 'A' : 'B'} is set, ${next.a ? 'B' : 'A'} is empty.` };
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
    if (!config) return DISABLED;
    const both = picks.a && picks.b;
    return {
      enabled: available.size > 0 || hasPicks(picks),
      noun: config.noun, unit, digits, metric,
      a: picks.a, b: picks.b,
      candidate,
      slotOfSelected: candidate?.ok ? slotOfRecord(picks, candidate.pick.recordId) : null,
      markOf,
      difference: both ? comparePickDifference(picks.a!, picks.b!, digits) : null,
      href: compareHrefForPicks(picks, metric),
      // A notice that belongs to another account never shows.
      notice: sameScope ? stored.notice : '',
      setSlot, swap, clear, dismissNotice,
    };
  }, [config, available, picks, candidate, unit, digits, metric, markOf, sameScope, stored.notice, setSlot, swap, clear, dismissNotice]);
};
