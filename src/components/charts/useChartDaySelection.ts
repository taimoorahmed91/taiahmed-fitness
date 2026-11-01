import { useCallback, useEffect, useMemo, useState } from 'react';
import { pointForPlotClick, resolveChartSelection, selectableChartPoints, stepChartSelection, type ChartPointRef } from '@/lib/chartSelection';
import type { ChartViewerDataset } from '@/lib/chartViewerData';

/**
 * The one selected-day state of a chart. The chart component owns it, so the card, the full-screen viewer's plot,
 * its Table and its Previous / Next buttons all read and change the SAME selection (the viewer is a second view of the
 * same chart, not a copy).
 *
 * What it keeps is only a row id (an ISO date). It never keeps a Recharts payload, an event or an array index, and it
 * resets itself when that row is no longer a selectable point of the visible rows (the range changed, the data refreshed).
 * A line/bar switch does not change the rows, so it keeps the day.
 *
 * Account scope: charts pass `scope` (the signed-in user id, via useAccountChartSelection). The stored selection remembers
 * the scope it was made in, and `selected` is only ever exposed while the CURRENT scope equals it. That check happens
 * during render, so the first render for another account already shows nothing selected (not even when that account has
 * the same date in its cached rows), and the notice is dropped too. An effect then forgets the stale value. Signing out
 * or leaving the page also unmounts the chart. The selection holds a date, never account data.
 */
export interface ChartDaySelection {
  dataset: ChartViewerDataset;
  /** At least one selectable day exists. False for opted-out charts (no selection UI is drawn at all). */
  enabled: boolean;
  /** Selectable days in plot order. */
  points: readonly ChartPointRef[];
  selected: ChartPointRef | null;
  /**
   * The series the person pressed on the plot to make this selection (null for a Table row, a Previous / Next step or a request
   * from outside). NOT part of the day's identity: only Compare reads it, to refuse a WHOOP press instead of quietly using
   * the manual record behind the same day.
   */
  selectedSeriesKey: string | null;
  /** Set when the selected day left the visible range and was cleared, so the live region can say so. */
  clearedNotice: string | null;
  pointForRow: (rowId: string) => ChartPointRef | null;
  /** The selectable point for an ISO date (null for a date with no selectable value). */
  pointForDate: (isoDate: unknown) => ChartPointRef | null;
  isSelectedRow: (rowId: string) => boolean;
  /** Table row: selects it, or clears it when it already is the selection. Rows that are not selectable do nothing. */
  toggleRow: (rowId: string) => void;
  /** Plot click: pass the ISO date read from the Recharts payload and the series that was clicked. Targets / nulls do nothing. */
  togglePlot: (isoDate: unknown, seriesKey: string) => void;
  clear: () => void;
  step: (delta: -1 | 1) => void;
  canStep: (delta: -1 | 1) => boolean;
}

export const CLEARED_NOTICE = 'The selected day is outside this date range, so the selection was cleared.';

export const useChartDaySelection = (dataset: ChartViewerDataset, scope: string | null = null): ChartDaySelection => {
  const points = useMemo(() => selectableChartPoints(dataset), [dataset]);
  // What was chosen, and in which account scope. `rowId` only counts while `scope` matches the current one.
  const [choice, setChoice] = useState<{ scope: string | null; rowId: string | null; seriesKey: string | null; cleared: boolean }>({ scope, rowId: null, seriesKey: null, cleared: false });
  const sameScope = choice.scope === scope;
  const rowId = sameScope ? choice.rowId : null;
  const cleared = sameScope && choice.cleared;
  const seriesKey = sameScope && rowId !== null ? choice.seriesKey : null;
  const selected = useMemo(() => resolveChartSelection(points, rowId), [points, rowId]);

  // The account changed: forget the old account's choice and notice (the render above already hid them).
  useEffect(() => {
    if (!sameScope) setChoice({ scope, rowId: null, seriesKey: null, cleared: false });
  }, [sameScope, scope]);

  // The selected row left the visible rows: forget it (so widening the range later does not bring it back unasked).
  useEffect(() => {
    if (sameScope && rowId !== null && selected === null) setChoice({ scope, rowId: null, seriesKey: null, cleared: true });
  }, [sameScope, scope, rowId, selected]);

  const choose = useCallback((next: string | null) => {
    setChoice({ scope, rowId: next, seriesKey: null, cleared: false });
  }, [scope]);

  const byDate = useMemo(() => new Map(points.map((p) => [p.day.isoDate, p] as const)), [points]);
  const pointForRow = useCallback((id: string) => resolveChartSelection(points, id), [points]);
  const pointForDate = useCallback((isoDate: unknown) => (typeof isoDate === 'string' ? byDate.get(isoDate) ?? null : null), [byDate]);
  const toggleRow = useCallback((id: string) => {
    if (!resolveChartSelection(points, id)) return;
    setChoice((current) => ({ scope, rowId: current.scope === scope && current.rowId === id ? null : id, seriesKey: null, cleared: false }));
  }, [points, scope]);
  const togglePlot = useCallback((isoDate: unknown, seriesKey: string) => {
    const point = pointForPlotClick(dataset, points, isoDate, seriesKey);
    if (!point) return;
    setChoice((current) => {
      const same = current.scope === scope && current.rowId === point.rowId;
      // Pressing ANOTHER series of the day that is already selected (by a plot press) switches series; it does not deselect.
      if (same && current.seriesKey !== null && current.seriesKey !== seriesKey) return { scope, rowId: point.rowId, seriesKey, cleared: false };
      return { scope, rowId: same ? null : point.rowId, seriesKey: same ? null : seriesKey, cleared: false };
    });
  }, [dataset, points, scope]);
  const step = useCallback((delta: -1 | 1) => {
    setChoice((current) => {
      const base = current.scope === scope ? current.rowId : null;
      const moved = stepChartSelection(points, base, delta)?.rowId;
      return { scope, rowId: moved ?? base, seriesKey: moved ? null : current.scope === scope ? current.seriesKey : null, cleared: false };
    });
  }, [points, scope]);
  const canStep = useCallback((delta: -1 | 1) => stepChartSelection(points, selected?.rowId ?? null, delta) !== null, [points, selected]);
  const isSelectedRow = useCallback((id: string) => selected?.rowId === id, [selected]);
  const clear = useCallback(() => choose(null), [choose]);

  return useMemo(() => ({
    dataset,
    enabled: points.length > 0,
    points,
    selected,
    selectedSeriesKey: seriesKey,
    clearedNotice: cleared && !selected ? CLEARED_NOTICE : null,
    pointForRow, pointForDate, isSelectedRow, toggleRow, togglePlot, clear, step, canStep,
  }), [dataset, points, selected, seriesKey, cleared, pointForRow, pointForDate, isSelectedRow, toggleRow, togglePlot, clear, step, canStep]);
};
