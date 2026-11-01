import { useMemo, useRef } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { DailyNote } from '@/hooks/useDailyNotes';
import { chartDateLabel, recentChartData, useChartView, ChartStyle } from './ChartViewControls';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState, TREND_NO_DATA, type ChartNoDataEmpty } from '@/components/charts/ChartEmptyState';
import { ChartTooltipCard, TooltipNote } from '@/components/charts/ChartTooltipCard';
import { NoteDiamond } from '@/components/charts/NoteDiamond';
import { ChartDayReadout } from '@/components/charts/ChartDaySelectionUi';
import { ChartCompareCardStrip } from '@/components/charts/ChartCompareUi';
import { compareGuides, selectableActiveDot, selectableBarCells, selectableBarClick, selectableBarMouseDown, selectableDot, selectedDayGuide } from '@/components/charts/ChartSelectionMarks';
import { useAccountChartSelection } from '@/components/charts/useAccountChartSelection';
import { useChartComparePicks } from '@/components/charts/useChartComparePicks';
import { CHART_MARGIN, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartYAxisProps, formatChartValue } from '@/lib/chartTheme';
import { CHART_RANGES, RANGE_LABELS } from '@/lib/chartRange';
import { describeSeries } from '@/lib/chartSummary';
import { chartDotRadius, chartMotionProps, chartXAxisFor } from '@/lib/chartViewer';
import { barAxisNote, computeChartDomain } from '@/lib/chartDomain';
import { createChartDataset, type ChartDatasetCompare, type ChartDatasetStatus } from '@/lib/chartViewerData';

type Series = { key: string; label: string; color: string; dashed?: boolean };
type Row = { date: string; [key: string]: string | number | null | undefined };

interface TrendChartProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  data: Row[];
  series: Series[];
  unit: string;
  defaultStyle?: ChartStyle;
  notesMap?: Map<string, DailyNote>;
  cap?: number;
  /** Short headline on the right of the title (latest value, average...). Rendered in muted 14px text. */
  summary?: (rows: Row[]) => React.ReactNode;
  /** Shown when the chosen date range has no rows (the fix is a wider range, so no link). */
  empty: string;
  /**
   * Shown instead of `empty` when there are no rows at all, with a link to where they are logged.
   * Defaults by chart id (weight, waist, sleep, recovery, workout_duration); pass `null` to opt out.
   */
  noData?: ChartNoDataEmpty | null;
  extendedRanges?: boolean;
  /**
   * Selecting a day. On by default: every TrendChart row is one real calendar day (a daily aggregate), so a point, bar,
   * Table row or Previous / Next press selects that day and offers "Open day" in Calendar. Rows whose `date` is not an
   * ISO date, and rows with no number, are simply not selectable.
   *  - `metric`: what the day is about for the SelectedDay origin (defaults to the chart id: "weight", "sleep").
   *  - `recordId`: only when a row IS one stored record; it makes the origin a `record` instead of a daily aggregate.
   *  - `false`: opt out (a chart whose rows are not days).
   *  - `compare`: OFF unless given. Lets Open in Compare appear when BOTH picked days are exact records (Weight, manual Sleep).
   *    It needs `recordId` too: a row with no record id (an aggregate, a WHOOP-only day) is never a record. Whether a point is
   *    one is decided by `compareEligibility` from its origin, not by this config (see ChartDatasetCompare).
   *  - `compareObserved`: for a chart that fills days it has no data for with a 0 (Workout Duration's rest days): say which rows were really
   *    observed. Only those days can be A or B; the others are never compared as 0. Leave out when every number is an observation.
   * Every daily chart (unless `false`) compares two days in the viewer: B - A per series, no links (see ChartDatasetPointCompare).
   */
  /**
   * Where the chart's source data really is (see lib/chartSourceStatus.ts): `stale` (a refresh failed over kept rows) or
   * `unavailable` (a first load failed). The viewer says so, the CSV name carries `_stale`, and unavailable data can not be
   * exported or selected. Leave out when everything is loaded and current.
   */
  status?: ChartDatasetStatus;
  daySelection?: false | { metric?: string; recordId?: (row: Row) => string | null | undefined; compare?: ChartDatasetCompare; compareObserved?: (row: Row) => boolean };
}

export const TrendChart = ({ id, title, icon, data, series, unit, defaultStyle, notesMap, cap, summary, empty, noData, extendedRanges, daySelection, status }: TrendChartProps) => {
  const view = useChartView(id, defaultStyle, { allowed: extendedRanges ? CHART_RANGES : undefined });
  const cardRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => recentChartData(data, view.range), [data, view.range]);
  // One Y axis for Line AND Bar (src/lib/chartDomain.ts): the same padded range of every visible value of every series.
  const { domain, ticks, floor } = useMemo(
    () => computeChartDomain(shown.flatMap(row => series.map(s => row[s.key])), { cap, minPad: cap ? 1 : 0.5 }),
    [shown, series, cap],
  );
  // Bars start at the axis floor, so when that is not zero the chart says so (visible caption + screen reader summary).
  const axisNote = view.style === 'bar' ? barAxisNote(floor, unit) : null;
  const noteDots = shown.filter(row => notesMap?.has(row.date) && typeof row[series[0]?.key] === 'number');
  const period = RANGE_LABELS[view.range];
  // Nothing logged at all (not just nothing in this range): logging is the fix, so offer the link.
  const emptyNoData = data.length === 0 ? (noData === undefined ? TREND_NO_DATA[id] : noData) : null;
  const summaryText = useMemo(() => `${describeSeries(shown, series.map(s => ({ key: s.key, label: s.label, unit })), period)}${axisNote ? ` ${axisNote}, not zero.` : ''}`, [shown, series, unit, period, axisNote]);

  // A row that is one record per day (Weight, Waist, Sleep: the lowest id) says how many entries its day had. When a day has more, the caption says only one is plotted.
  const moreThanOne = useMemo(
    () => shown.filter(row => typeof row.entryCount === 'number' && row.entryCount > 1).length,
    [shown],
  );

  const pdfColumns = [{ key: 'date', label: 'Date' }, ...series.map(s => ({ key: s.key, label: `${s.label}${unit ? ` (${unit})` : ''}` }))];

  // The viewer's Table and CSV read these complete rows (the same ones the plot draws), never the capped screen-reader table.
  const dataset = useMemo(
    () => createChartDataset({
      name: title, period, rows: shown, status,
      columns: [{ key: 'date', label: 'Date' }, ...series.map(s => ({ key: s.key, label: s.label, unit }))],
      selection: daySelection === false ? false : { metric: daySelection?.metric ?? id, valueKeys: series.map(s => s.key), recordId: daySelection?.recordId, compare: daySelection?.recordId ? daySelection.compare : undefined },
      // Every daily trend compares two days IN the viewer (B - A per series). Opting out of day selection opts out of this too: those rows are not days.
      pointCompare: daySelection === false ? undefined : { kind: 'date', seriesKeys: series.map(s => s.key), noun: 'day', nounPlural: 'days', isObserved: daySelection?.compareObserved },
    }),
    [title, period, shown, series, unit, daySelection, id, status],
  );
  // One selected day for the card and the full-screen viewer (src/components/charts/useChartDaySelection.ts).
  const selection = useAccountChartSelection(dataset);
  // A / B picks: two days compared in the viewer (B - A per series). Open in Compare only when both are exact records (`daySelection.compare` + `recordId`).
  const compare = useChartComparePicks(selection);
  const selectable = selection.enabled;

  const motion = chartMotionProps();
  // The card and the full-screen viewer draw the same chart from the same state; only `expanded` differs.
  const body = (expanded: boolean) => (
    shown.length === 0 ? (
      emptyNoData
        ? <ChartEmptyState action={emptyNoData.action} secondaryAction={emptyNoData.secondaryAction}>{emptyNoData.message}</ChartEmptyState>
        : <ChartEmptyState>{empty}</ChartEmptyState>
    ) : (
      <ChartFigure
        expanded={expanded}
        title={title}
        summary={summaryText}
        caption={`${unit ? `Values in ${unit} · ` : ''}${period}${axisNote ? ` · ${axisNote}` : ''}${notesMap ? ' · \u25C6 marks a day with a note' : ''}${selectable ? ` · Select a ${view.style === 'bar' ? 'bar' : 'point'} for its day` : ''}${moreThanOne > 0 ? ` · ${moreThanOne} ${moreThanOne === 1 ? 'day has' : 'days have'} more than one entry (one is plotted)` : ''}`}
        table={{ columns: pdfColumns, rows: shown }}
        afterPlot={expanded ? undefined : <><ChartDayReadout selection={selection} /><ChartCompareCardStrip compare={compare} /></>}
      >
        <ComposedChart accessibilityLayer data={shown} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="date" tickFormatter={chartDateLabel} {...chartXAxisFor(shown.length, expanded)} />
          <YAxis domain={domain} ticks={ticks} {...chartYAxisProps} />
          <Tooltip cursor={chartTooltipProps.cursor} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const note = notesMap?.get(String(label));
            return <ChartTooltipCard
              title={String(label)}
              rows={payload.filter(p => p.value != null).map(p => ({ label: String(p.name), value: formatChartValue(Number(p.value), unit), color: String(p.color ?? p.fill) }))}>
              {note && <TooltipNote tags={note.tags} notes={note.notes} />}
            </ChartTooltipCard>;
          }} />
          {series.length > 1 && <Legend {...chartLegendProps} />}
          {series.map(s => view.style === 'bar' ?
            <Bar {...motion} key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={40} radius={[3, 3, 0, 0]} onClick={selectable ? selectableBarClick(selection, s.key) : undefined} onMouseDown={selectable ? selectableBarMouseDown : undefined}>
              {selectable ? selectableBarCells(shown, selection) : null}
            </Bar> :
            <Line {...motion} key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.dashed ? 2 : 3} strokeDasharray={s.dashed ? '8 5' : undefined} dot={s.dashed ? false : selectable ? selectableDot({ selection, seriesKey: s.key, color: s.color, r: chartDotRadius(3, shown.length, expanded), stroke: chartDotStroke }) : { r: chartDotRadius(3, shown.length, expanded), fill: s.color, stroke: chartDotStroke, strokeWidth: 1 }} activeDot={selectable ? selectableActiveDot(5) : { r: 5 }} connectNulls />
          )}
          {selectedDayGuide(selection)}
          {compareGuides(compare)}
          {noteDots.map(row => <ReferenceDot key={row.date} x={row.date} y={Number(row[series[0].key])} r={7} shape={<NoteDiamond />} />)}
        </ComposedChart>
      </ChartFigure>
    )
  );

  return (
    <Card ref={cardRef} titleSize="chart" className="shadow-md min-w-0">
      <ChartHeader
        title={title}
        icon={icon}
        description={summary?.(shown)}
        view={{ ...view, extended: extendedRanges }}
        pdf={{ targetRef: cardRef, subtitle: `${period} · ${view.style} chart`, columns: pdfColumns, rows: shown }}
        viewer={{ render: () => body(true), dataset, selection, compare }}
      />
      <CardContent>{body(false)}</CardContent>
    </Card>
  );
};
