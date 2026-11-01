import type { ReactElement } from 'react';
import { Cell, ReferenceLine } from 'recharts';
import { CHART_COLORS } from '@/lib/chartTheme';
import type { ChartDaySelection } from '@/components/charts/useChartDaySelection';
import type { ChartComparePicks } from '@/components/charts/useChartComparePicks';

/**
 * The Recharts side of chart day selection: what a selectable point / bar looks like and what a click does.
 *
 * Direct clicks on the plot are ADDITIVE. Dots and bars are small on a dense 90 day chart, so the full-screen viewer's
 * Previous / Next buttons and its Table are the dependable way to pick a day (and the only keyboard way). Everything
 * here keeps just the ISO date string out of the Recharts payload and hands it to the selection, which checks it.
 *
 * The selected day is marked three ways that do not rely on colour: a dashed vertical guide, a ring around the point
 * (or a thick outline on the bar), and the readout text under the plot.
 */

/** Selected marker colour: the neutral foreground, never a status colour. */
export const SELECTED_STROKE = CHART_COLORS.foreground;

/** The vertical guide for the selected day. Put it inside the chart, after the series. */
export const selectedDayGuide = (selection: ChartDaySelection): ReactElement | null =>
  selection.selected
    ? <ReferenceLine key="selected-day-guide" x={selection.selected.day.isoDate} stroke={SELECTED_STROKE} strokeWidth={1.5} strokeDasharray="3 3" ifOverflow="hidden" />
    : null;

/**
 * Guides for the Compare picks: a long-dashed vertical line with a bold "A" / "B" at the top. The letter (not a colour) tells
 * them apart, and the selected-day guide stays short-dashed, so a pick that is also the selected day shows both. Rows come from
 * the visible chart only, so a guide never points at a date the axis does not have. A chart with named Y axes passes one (`yAxisId`).
 */
export const compareGuides = (compare: ChartComparePicks, yAxisId?: string): ReactElement[] =>
  (['a', 'b'] as const).flatMap((slot) => {
    const pick = compare[slot];
    // A categorical pick has no date, so it has no place on a time axis.
    if (!pick || !pick.isoDate) return [];
    return [
      <ReferenceLine
        key={`compare-guide-${slot}`}
        x={pick.isoDate}
        {...(yAxisId ? { yAxisId } : {})}
        stroke={SELECTED_STROKE}
        strokeWidth={1.5}
        strokeDasharray="10 4"
        ifOverflow="hidden"
        label={{ value: slot === 'a' ? 'A' : 'B', position: 'insideTop', fill: SELECTED_STROKE, fontSize: 13, fontWeight: 700, dy: -2 }}
      />,
    ];
  });

interface DotRenderProps { key?: string; cx?: number; cy?: number; value?: unknown; payload?: { date?: unknown } }

export interface SelectableDotOptions {
  selection: ChartDaySelection;
  seriesKey: string;
  color: string;
  /** Visible radius, as before. */
  r: number;
  stroke: string;
  strokeWidth?: number;
}

/**
 * Recharts draws its hover dot (`activeDot`) ABOVE the dots layer. Left alone it would catch the mouse press that belongs to
 * the hit area underneath, so press and release land on different elements and the browser never sends a click.
 * Give it `pointer-events: none` when the line is selectable.
 */
export const selectableActiveDot = (r: number) => ({ r, style: { pointerEvents: 'none' as const } });

/** Hit area radius: at least 10px around every real point, so a finger is not asked to land on a 3px dot. */
const HIT_RADIUS = 10;

/**
 * A Line `dot` renderer. Draws the same dot the chart always had, plus an invisible larger hit circle that toggles that
 * day. Null points (no number) draw nothing and can not be clicked. The selected day gets a ring and a bigger dot.
 */
export const selectableDot = ({ selection, seriesKey, color, r, stroke, strokeWidth = 1 }: SelectableDotOptions) =>
  (props: DotRenderProps): ReactElement | null => {
    const { cx, cy, value, payload } = props;
    if (typeof cx !== 'number' || typeof cy !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) return null;
    const isoDate = payload?.date;
    const point = selection.pointForDate(isoDate) ?? undefined;
    const selected = !!point && selection.isSelectedRow(point.rowId);
    return (
      <g key={props.key} data-chart-point={point ? String(isoDate) : undefined} data-selected={selected ? '' : undefined}>
        {selected && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={SELECTED_STROKE} strokeWidth={2} pointerEvents="none" />}
        <circle cx={cx} cy={cy} r={selected ? r + 1.5 : r} fill={color} stroke={stroke} strokeWidth={strokeWidth} pointerEvents="none" />
        {point && (
          <circle
            cx={cx}
            cy={cy}
            r={Math.max(HIT_RADIUS, r + 3)}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            // A press here must not move focus onto the chart (that would jump Recharts' keyboard tooltip to the first point).
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selection.togglePlot(isoDate, seriesKey)}
          />
        )}
      </g>
    );
  };

/**
 * Cell children for a Bar: the selected day's bar gets a thick neutral outline, and every bar of a series that
 * is selectable shows a pointer. A bar with no value is not drawn by Recharts and the selection also refuses it.
 * Keyed by the row's date, never by position.
 */
export const selectableBarCells = (rows: readonly { date: string }[], selection: ChartDaySelection): ReactElement[] =>
  rows.map((row) => {
    const point = selection.pointForDate(row.date);
    const selected = !!point && selection.isSelectedRow(point.rowId);
    return (
      <Cell
        key={row.date}
        {...(selected ? { stroke: SELECTED_STROKE, strokeWidth: 2.5 } : {})}
        style={point ? { cursor: 'pointer' } : undefined}
      />
    );
  });

/** Bar onMouseDown: a press on a bar must not move focus onto the chart (see the hit circle on dots). */
export const selectableBarMouseDown = (_entry: unknown, _index: number, event: { preventDefault?: () => void } | undefined) => event?.preventDefault?.();

/** The onClick handler of a Bar for a selectable series. Reads only the date string out of the Recharts payload. */
export const selectableBarClick = (selection: ChartDaySelection, seriesKey: string) =>
  (entry: { payload?: { date?: unknown }; date?: unknown } | undefined) => selection.togglePlot(entry?.payload?.date ?? entry?.date, seriesKey);
