import { useMemo, useRef } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { useChartView } from './ChartViewControls';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState, NO_DATA } from '@/components/charts/ChartEmptyState';
import { ChartTooltipCard } from '@/components/charts/ChartTooltipCard';
import { ChartDayReadout } from '@/components/charts/ChartDaySelectionUi';
import { ChartCompareCardStrip } from '@/components/charts/ChartCompareUi';
import { compareGuides, selectableActiveDot, selectableBarCells, selectableBarClick, selectableBarMouseDown, selectableDot, selectedDayGuide } from '@/components/charts/ChartSelectionMarks';
import { useAccountChartSelection } from '@/components/charts/useAccountChartSelection';
import { useChartComparePicks } from '@/components/charts/useChartComparePicks';
import { CHART_COLORS, CHART_MARGIN, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartYAxisProps, formatChartValue } from '@/lib/chartTheme';
import { RANGE_LABELS, formatChartDate, windowChartRows } from '@/lib/chartRange';
import { describeSeries } from '@/lib/chartSummary';
import { chartDotRadius, chartMotionProps, chartXAxisFor } from '@/lib/chartViewer';
import { computeYAxis } from '@/lib/chartAxis';
import { TARGET_CURVE, curveFor } from '@/lib/chartCurves';
import { createChartDataset, type ChartDatasetStatus } from '@/lib/chartViewerData';
import { isObservedIntake, type IntakeKind } from '@/lib/macroIntake';

interface MacroTargetChartProps {
  /**
   * One row per calendar day, oldest first. `date` should be ISO (YYYY-MM-DD);
   * an "MM/DD" label over a gap-free series ending today is still accepted.
   *
   * `actual` is what was really logged that day, or NULL when it was not observed (no meals, meals without this macro,
   * only some meals with it): null draws no point or bar, is blank in the Table and CSV, and can not be selected.
   * `intake` says why (src/lib/macroIntake.ts). A real 0 is observed and stays 0. Rows without `intake` are treated
   * as observed whenever `actual` is a number.
   */
  data: { date: string; actual: number | null; intake?: IntakeKind; min: number | null; max: number | null }[];
  /** Source status from the page (see lib/chartSourceStatus.ts): stale or unavailable, shown in the viewer and the CSV name. */
  status?: ChartDatasetStatus;
  title: string;
  unit: string;
  storageKey?: string;
  /**
   * What each selected day is about ("calories", "protein", "carbs"): the SelectedDay origin's metric. Never a display
   * label. Defaults to a slug of the storage key / title.
   */
  metric?: string;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'macro';

// Side-by-side bars per date (Recharts groups bars that share no stackId), thin enough for a 90 day window.
const BAR_GROUP = { maxBarSize: 28 } as const;

const LABELS: Record<string, string> = { actual: 'Actual intake', min: 'Min target', max: 'Max target' };

export const MacroTargetChart = ({ data, title, unit, storageKey, metric, status }: MacroTargetChartProps) => {
  const id = `macro_${storageKey ?? title}`;
  // Keeps whatever range/style the old, separate controls had saved.
  const view = useChartView(id, 'line', { legacyPrefix: `fittrack_macro_chart_${storageKey ?? title}` });
  const { range, style } = view;
  const cardRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => windowChartRows(data, range), [data, range]);

  // One zero-based Y axis for Line AND Bar (src/lib/chartAxis.ts): the highest of actual, Min and Max over the visible days, plus headroom.
  const { domain, ticks } = useMemo(
    () => computeYAxis(shown.flatMap((d) => [d.actual, d.min, d.max]), { base: 'zero', bar: style === 'bar' }),
    [shown, style],
  );

  const period = RANGE_LABELS[range];
  // Days with no observed actual are blank, not zero: say so on the chart.
  const hasUnobserved = shown.some((d) => d.actual == null);
  const summary = useMemo(
    () => describeSeries(shown, [
      { key: 'actual', label: LABELS.actual, unit, digits: 0 },
      { key: 'min', label: LABELS.min, unit, digits: 0 },
      { key: 'max', label: LABELS.max, unit, digits: 0 },
    ], period),
    [shown, unit, period],
  );
  const summaryText = summary;
  const columns = [{ key: 'date', label: 'Date' }, { key: 'actual', label: `Actual (${unit})` }, { key: 'min', label: `Min target (${unit})` }, { key: 'max', label: `Max target (${unit})` }];

  // The viewer's Table and CSV read these complete rows (the same ones the plot draws). A day without a target stays blank, never 0.
  const dataset = useMemo(
    () => createChartDataset({
      name: title, period, rows: shown, status,
      columns: [{ key: 'date', label: 'Date' }, { key: 'actual', label: 'Actual', unit, digits: 0 }, { key: 'min', label: 'Min target', unit, digits: 0 }, { key: 'max', label: 'Max target', unit, digits: 0 }],
      // Daily rows: each ISO day is selectable by its ACTUAL intake only. The Min / Max target lines and bars are limits, not
      // the person's data, so they are never selectable (and a row with only targets is not a day). Non-ISO "MM/DD" rows are not selectable.
      // Only an OBSERVED actual is a day: `intake` (from the aggregation) says so, and an explicit 0 counts. Never `actual > 0`.
      selection: { metric: metric ?? slug(storageKey ?? title), valueKeys: ['actual'], isObserved: (row) => row.intake === undefined || isObservedIntake(row.intake) },
      // Compare two days IN the viewer: B - A for the actual intake and for each target that day had. A day is pickable only by an OBSERVED
      // actual (the selection's own rule), so a day with only targets or a partly logged day is never offered, and a missing target is "no value", not 0.
      pointCompare: { kind: 'date', seriesKeys: ['actual', 'min', 'max'], pickKeys: ['actual'], noun: 'day', nounPlural: 'days' },
    }),
    [title, period, shown, unit, metric, storageKey, status],
  );
  // One selected day for the card and the full-screen viewer (src/components/charts/useChartDaySelection.ts).
  const selection = useAccountChartSelection(dataset);
  const compare = useChartComparePicks(selection);
  const selectable = selection.enabled;

  const motion = chartMotionProps();
  // The card and the full-screen viewer draw the same chart from the same state; only `expanded` differs.
  const body = (expanded: boolean) => (
    shown.length === 0 ? (
      // No rows at all: logging a meal is the fix. Rows outside the range: a wider range is.
      data.length === 0
        ? <ChartEmptyState action={NO_DATA.meals.action}>{NO_DATA.meals.message}</ChartEmptyState>
        : <ChartEmptyState>No intake data in this period. Try a wider date range.</ChartEmptyState>
    ) : (
      <ChartFigure expanded={expanded} title={title} summary={summaryText} caption={`Values in ${unit} · ${period}${hasUnobserved ? ' · Blank = not fully logged' : ''}${selectable ? ` · Select a ${style === 'bar' ? 'bar' : 'point'} of actual intake for its day` : ''}`} table={{ columns, rows: shown }} afterPlot={expanded ? undefined : <><ChartDayReadout selection={selection} /><ChartCompareCardStrip compare={compare} /></>}>
        <ComposedChart accessibilityLayer data={shown} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="date" tickFormatter={formatChartDate} {...chartXAxisFor(shown.length, expanded)} />
          <YAxis domain={domain} ticks={ticks} {...chartYAxisProps} />
          <Tooltip
            cursor={chartTooltipProps.cursor}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltipCard
                  title={formatChartDate(String(label))}
                  rows={payload.filter((p) => p.value != null).map((p) => ({
                    label: LABELS[String(p.dataKey)] ?? String(p.name),
                    value: formatChartValue(Number(p.value), unit, 0),
                    color: String(p.color ?? p.fill),
                  }))}
                />
              );
            }}
          />
          <Legend {...chartLegendProps} formatter={(value) => LABELS[value] ?? value} />
          {/* The chart style applies to the whole chart: three lines, or three bars grouped side by side for each date (not stacked).
              A day without a target has null there, so that bar / line point is simply absent, never a zero. */}
          {style === 'bar' ? (
            <>
              <Bar {...motion} {...BAR_GROUP} dataKey="actual" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} name="actual" onClick={selectable ? selectableBarClick(selection, 'actual') : undefined} onMouseDown={selectable ? selectableBarMouseDown : undefined}>
                {selectable ? selectableBarCells(shown, selection) : null}
              </Bar>
              {/* Targets are lighter, outlined bars (min solid outline, max dashed), so they read as limits and differ
                  from Actual by more than hue. */}
              <Bar {...motion} {...BAR_GROUP} dataKey="min" fill={CHART_COLORS.min} fillOpacity={0.4} stroke={CHART_COLORS.min} strokeWidth={1.5} radius={[4, 4, 0, 0]} name="min" />
              <Bar {...motion} {...BAR_GROUP} dataKey="max" fill={CHART_COLORS.max} fillOpacity={0.4} stroke={CHART_COLORS.max} strokeWidth={1.5} strokeDasharray="4 3" radius={[4, 4, 0, 0]} name="max" />
            </>
          ) : (
            <>
              <Line {...motion} type={curveFor('macro_actual')} dataKey="actual" stroke={CHART_COLORS.actual} strokeWidth={3.5} dot={selectable ? selectableDot({ selection, seriesKey: 'actual', color: CHART_COLORS.actual, r: chartDotRadius(4, shown.length, expanded), stroke: chartDotStroke, strokeWidth: 1.5 }) : { r: chartDotRadius(4, shown.length, expanded), fill: CHART_COLORS.actual, stroke: chartDotStroke, strokeWidth: 1.5 }} activeDot={selectable ? selectableActiveDot(6) : { r: 6 }} name="actual" />
              <Line {...motion} type={TARGET_CURVE} dataKey="min" stroke={CHART_COLORS.min} strokeWidth={2} strokeDasharray="8 5" dot={false} activeDot={selectable ? selectableActiveDot(4) : undefined} name="min" connectNulls />
              <Line {...motion} type={TARGET_CURVE} dataKey="max" stroke={CHART_COLORS.max} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" dot={false} activeDot={selectable ? selectableActiveDot(4) : undefined} name="max" connectNulls />
            </>
          )}
          {selectedDayGuide(selection)}
          {compareGuides(compare)}
        </ComposedChart>
      </ChartFigure>
    )
  );

  return (
    <Card ref={cardRef} titleSize="chart" className="shadow-md min-w-0">
      <ChartHeader
        title={title}
        view={view}
        pdf={{ targetRef: cardRef, subtitle: `${period} · ${style} chart`, columns, rows: shown }}
        viewer={{ render: () => body(true), dataset, selection, compare }}
      />
      <CardContent>{body(false)}</CardContent>
    </Card>
  );
};
