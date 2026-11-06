import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ArrowDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { chartDateLabel, recentChartData, useChartView, type ChartStyle } from '@/components/ChartViewControls';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState, TREND_NO_DATA, type ChartNoDataEmpty } from '@/components/charts/ChartEmptyState';
import { ChartTooltipCard } from '@/components/charts/ChartTooltipCard';
import { ChartDayReadout } from '@/components/charts/ChartDaySelectionUi';
import { ChartCompareCardStrip } from '@/components/charts/ChartCompareUi';
import { compareGuides, selectableActiveDot, selectableBarCells, selectableBarClick, selectableBarMouseDown, selectableDot, selectedDayGuide } from '@/components/charts/ChartSelectionMarks';
import { useAccountChartSelection } from '@/components/charts/useAccountChartSelection';
import { useChartComparePicks } from '@/components/charts/useChartComparePicks';
import { CHART_MARGIN, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartYAxisProps, formatChartValue } from '@/lib/chartTheme';
import { CHART_RANGES, RANGE_LABELS, STANDARD_RANGES, todayUtc, type ChartRange } from '@/lib/chartRange';
import { describeSeries } from '@/lib/chartSummary';
import { chartDotRadius, chartMotionProps, chartXAxisFor } from '@/lib/chartViewer';
import { axisBaseFor, barAxisNote, barsStartAtZero, computeYAxis, emptyTopFor } from '@/lib/chartAxis';
import { curveFor, seriesHasGaps } from '@/lib/chartCurves';
import { createChartDataset, type ChartDatasetStatus } from '@/lib/chartViewerData';
import { smallestRangeIncluding } from '@/lib/recordTrend';
import { isCompareLinkCategory } from '@/lib/compareUrl';

/**
 * The trend chart of a record-backed page (Weight, Waist, Sleep), linked to that page's history list.
 *
 * It draws exactly what TrendChart draws (same id, so the saved range and line/bar choice are the Dashboard's, same header,
 * viewer, Table and CSV) and adds three things TrendChart does not have:
 *  1. Every plotted row is ONE exact stored record (`recordId` on the row), so the selected point means one record.
 *  2. The selection is reported to the page (`link.onSelectedRecordChange`) and can be set from the page (`link.request`).
 *  3. A "Jump to entry" button under the readout, a place for page notices, and an out-of-range explanation.
 *
 * It exists as its own component because TrendChart keeps its selection to itself; the Dashboard keeps using TrendChart.
 * Keep the plot below in step with TrendChart (follow-up: let TrendChart take a `selection` handle, then delete this).
 *
 * Compare (Weight and manual Sleep only): the viewer offers Set as A / Set as B for the selected exact record, then Open in Compare
 * (see components/charts/ChartCompareUi.tsx). Waist never does: `isCompareLinkCategory(id)` is the single switch, and the point's own
 * origin (an exact record, manual source) still has to pass `compareEligibility`. The card only shows a summary of the picks.
 *
 * Which records can be jumped to: only a row that has a `recordId` AND a real number in `link.valueKey`. On Sleep that is the
 * manual series; a WHOOP-only day is a daily aggregate (it can be looked at and opened in Calendar, never jumped to).
 */

type Series = { key: string; label: string; color: string; dashed?: boolean };
type Row = { date: string; recordId?: string; entryCount?: number; [key: string]: string | number | null | undefined };

export interface RecordChartRequest {
  /** The record to select on the chart, or null to clear the selection. */
  recordId: string | null;
  /** Changes with every request, so asking again is a new request. */
  nonce: number;
}

export interface RecordChartLink {
  /** The column that carries the record-backed value ("weight", "hours"). Other series are not record-backed. */
  valueKey: string;
  /** What one record is called in sentences: "weight entry". */
  noun: string;
  /** Its plural: "weight entries", "sleep entries". */
  nounPlural: string;
  /** The exact record behind the selected point (null when nothing, or a day without a record, is selected). */
  onSelectedRecordChange: (recordId: string | null) => void;
  /** "Jump to entry" pressed for this record. */
  onJump: (recordId: string) => void;
  /** Select (or clear) a record from outside, for example the history row's "Show on chart". */
  request: RecordChartRequest | null;
  /** The page could not show the selected record in the list: say why, with an action. */
  jumpNotice?: { text: string; actionLabel: string; onAction: () => void } | null;
}

interface RecordTrendChartProps {
  id: string;
  title: string;
  icon: ReactNode;
  data: Row[];
  series: Series[];
  unit: string;
  defaultStyle?: ChartStyle;
  cap?: number;
  summary?: (rows: Row[]) => ReactNode;
  empty: string;
  noData?: ChartNoDataEmpty | null;
  extendedRanges?: boolean;
  status?: ChartDatasetStatus;
  link: RecordChartLink;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const longDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d);
};

export const RecordTrendChart = ({ id, title, icon, data, series, unit, defaultStyle, cap, summary, empty, noData, extendedRanges, status, link }: RecordTrendChartProps) => {
  const view = useChartView(id, defaultStyle, { allowed: extendedRanges ? CHART_RANGES : undefined });
  const cardRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const shown = useMemo(() => recentChartData(data, view.range), [data, view.range]);
  // Same axis and curve rules as TrendChart (src/lib/chartAxis.ts, src/lib/chartCurves.ts).
  const { domain, ticks, floor } = useMemo(
    () => computeYAxis(shown.flatMap(row => series.map(s => row[s.key])), { base: axisBaseFor(id), bar: view.style === 'bar' && barsStartAtZero(id), ceiling: cap, minPad: cap ? 1 : 0.5, emptyTop: emptyTopFor(id) }),
    [shown, series, id, view.style, cap],
  );
  // Weight and waist bars keep the zoomed axis, so the caption and the screen reader summary say where the bars start.
  const axisNote = view.style === 'bar' ? barAxisNote(floor, unit) : null;
  const curve = curveFor(id);
  const period = RANGE_LABELS[view.range];
  const emptyNoData = data.length === 0 ? (noData === undefined ? TREND_NO_DATA[id] : noData) : null;
  const summaryText = useMemo(() => `${describeSeries(shown, series.map(s => ({ key: s.key, label: s.label, unit })), period)}${axisNote ? ` ${axisNote}, not zero.` : ''}`, [shown, series, unit, period, axisNote]);
  const ambiguousDays = useMemo(() => shown.filter(row => (row.entryCount ?? 0) > 1).length, [shown]);
  const pdfColumns = [{ key: 'date', label: 'Date' }, ...series.map(s => ({ key: s.key, label: `${s.label}${unit ? ` (${unit})` : ''}` }))];

  const isRecordRow = useCallback((row: Row) => typeof row.recordId === 'string' && row.recordId !== '' && typeof row[link.valueKey] === 'number', [link.valueKey]);
  const dataset = useMemo(
    () => createChartDataset({
      name: title, period, rows: shown, status,
      columns: [{ key: 'date', label: 'Date' }, ...series.map(s => ({ key: s.key, label: s.label, unit }))],
      // A row is a record only when it has a record id AND a real value in the record-backed column; a WHOOP-only day stays a daily aggregate.
      selection: {
        metric: id, valueKeys: series.map(s => s.key), recordId: (row) => (isRecordRow(row) ? row.recordId : undefined),
        // Weight and manual Sleep only. On Sleep the record-backed column is the manual series; the WHOOP series is never a record.
        compare: isCompareLinkCategory(id) ? { valueKey: link.valueKey, noun: id === 'sleep' ? 'manual sleep entry' : link.noun, unit } : undefined,
      },
    }),
    [title, period, shown, series, unit, id, status, isRecordRow, link.valueKey, link.noun],
  );
  const selection = useAccountChartSelection(dataset);
  const compare = useChartComparePicks(selection);
  const selectable = selection.enabled;

  const origin = selection.selected?.day.origin;
  const selectedRecordId = origin?.kind === 'record' ? origin.recordId ?? null : null;
  const selectedRow = useMemo(() => (selection.selected ? shown.find((row, i) => dataset.rowId(row, i) === selection.selected!.rowId) : undefined), [selection.selected, shown, dataset]);

  // Tell the page which exact record is selected (and that nothing is, when the chart goes away).
  const reportRef = useRef(link.onSelectedRecordChange);
  reportRef.current = link.onSelectedRecordChange;
  useEffect(() => { reportRef.current(selectedRecordId); }, [selectedRecordId]);
  useEffect(() => () => reportRef.current(null), []);

  // A request from the page ("Show on chart" on a row): select that record, or explain why it can not be seen.
  const [pending, setPending] = useState<string | null>(null);
  const [outside, setOutside] = useState<{ recordId: string; date: string; widen: ChartRange | null } | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const wantFocus = useRef(false);
  const handled = useRef<number | null>(null);
  useEffect(() => {
    const request = link.request;
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    setOutside(null);
    if (request.recordId === null) {
      selection.clear();
      return;
    }
    wantFocus.current = true;
    setPending(request.recordId);
  }, [link.request, selection]);
  useEffect(() => {
    if (pending === null) return;
    const index = shown.findIndex((row) => row.recordId === pending && isRecordRow(row));
    if (index >= 0) {
      const rowId = dataset.rowId(shown[index], index);
      if (!selection.isSelectedRow(rowId)) selection.toggleRow(rowId);
      setPending(null);
      setFocusTick((n) => n + 1);
      return;
    }
    // Not in the range on screen. Say so, and offer the smallest range that includes it.
    const row = data.find((r) => r.recordId === pending);
    const allowed = extendedRanges ? CHART_RANGES : STANDARD_RANGES;
    setOutside(row ? { recordId: pending, date: row.date, widen: smallestRangeIncluding(row.date, allowed, todayUtc()) } : null);
    wantFocus.current = false;
    setPending(null);
  }, [pending, shown, data, dataset, selection, isRecordRow, extendedRanges]);
  // The selection changed on its own (a click, the viewer), or the range now includes the record: the notice no longer applies.
  useEffect(() => { if (selectedRecordId) setOutside(null); }, [selectedRecordId]);
  useEffect(() => {
    if (outside && shown.some((row) => row.recordId === outside.recordId)) setOutside(null);
  }, [outside, shown]);

  // After "Show on chart": bring the chart into view and put focus on its Jump button, so the way back is one key press.
  useEffect(() => {
    if (!wantFocus.current || !selectedRecordId || !jumpRef.current) return;
    wantFocus.current = false;
    cardRef.current?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    jumpRef.current.focus({ preventScroll: true });
  }, [focusTick, selectedRecordId]);

  const widenTo = (range: ChartRange, recordId: string) => {
    view.setRange(range);
    wantFocus.current = true;
    setOutside(null);
    setPending(recordId);
  };

  const motion = chartMotionProps();
  const linkBar = (
    <div data-record-link="" data-html2canvas-ignore="true">
      {/* One live region for everything this link has to say, mounted from the start so changes are announced. */}
      <div role="status" aria-live="polite" data-record-link-status="" className="mt-2 space-y-2 empty:hidden">
        {selectedRecordId && selectedRow && (selectedRow.entryCount ?? 0) > 1 && (
          <p className="text-xs text-muted-foreground">{selectedRow.entryCount} {link.nounPlural} on this day: the chart plots one of them.</p>
        )}
        {selection.selected && !selectedRecordId && (
          <p className="text-xs text-muted-foreground">This day has no {link.noun} of its own (only WHOOP data), so there is nothing to jump to. Open the day to see everything for it.</p>
        )}
        {link.jumpNotice && selectedRecordId && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm" data-record-jump-notice="">
            <span>{link.jumpNotice.text}</span>
            <Button type="button" variant="outline" size="sm" onClick={link.jumpNotice.onAction}>{link.jumpNotice.actionLabel}</Button>
          </p>
        )}
        {outside && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm" data-record-outside-range="">
            <span>The {link.noun} from {longDate(outside.date)} is outside the chart's range ({period.toLowerCase()}).{outside.widen ? '' : ' No range on this chart goes back that far.'}</span>
            {outside.widen && (
              <Button type="button" variant="outline" size="sm" onClick={() => widenTo(outside.widen!, outside.recordId)}>
                Show {RANGE_LABELS[outside.widen].toLowerCase()}
              </Button>
            )}
          </p>
        )}
      </div>
      {selectedRecordId && (
        <div className="mt-2">
          <Button ref={jumpRef} type="button" variant="outline" size="sm" data-record-jump="" onClick={() => link.onJump(selectedRecordId)} className="w-full sm:w-auto">
            <ArrowDown aria-hidden="true" className="mr-2 h-4 w-4" />
            Jump to entry
          </Button>
        </div>
      )}
    </div>
  );

  const body = (expanded: boolean) => (
    shown.length === 0 ? (
      <>
        {emptyNoData
          ? <ChartEmptyState action={emptyNoData.action} secondaryAction={emptyNoData.secondaryAction}>{emptyNoData.message}</ChartEmptyState>
          : <ChartEmptyState>{empty}</ChartEmptyState>}
        {!expanded && <>{linkBar}<ChartCompareCardStrip compare={compare} /></>}
      </>
    ) : (
      <ChartFigure
        expanded={expanded}
        title={title}
        summary={summaryText}
        caption={`${unit ? `Values in ${unit} · ` : ''}${period}${axisNote ? ` · ${axisNote}` : ''}${selectable ? ` · Select a ${view.style === 'bar' ? 'bar' : 'point'} for its day` : ''}${ambiguousDays > 0 ? ` · ${ambiguousDays} ${ambiguousDays === 1 ? 'day has' : 'days have'} more than one entry (one is plotted)` : ''}`}
        table={{ columns: pdfColumns, rows: shown }}
        afterPlot={expanded ? undefined : <><ChartDayReadout selection={selection} />{linkBar}<ChartCompareCardStrip compare={compare} /></>}
      >
        <ComposedChart accessibilityLayer data={shown} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="date" tickFormatter={chartDateLabel} {...chartXAxisFor(shown.length, expanded)} />
          <YAxis domain={domain} ticks={ticks} {...chartYAxisProps} />
          <Tooltip cursor={chartTooltipProps.cursor} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return <ChartTooltipCard
              title={String(label)}
              rows={payload.filter(p => p.value != null).map(p => ({ label: String(p.name), value: formatChartValue(Number(p.value), unit), color: String(p.color ?? p.fill) }))} />;
          }} />
          {series.length > 1 && <Legend {...chartLegendProps} />}
          {series.map(s => view.style === 'bar' ?
            <Bar {...motion} key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={40} radius={[3, 3, 0, 0]} onClick={selectable ? selectableBarClick(selection, s.key) : undefined} onMouseDown={selectable ? selectableBarMouseDown : undefined}>
              {selectable ? selectableBarCells(shown, selection) : null}
            </Bar> :
            <Line {...motion} key={s.key} type={curve} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.dashed ? 2 : 3} strokeDasharray={s.dashed ? '8 5' : undefined} dot={s.dashed ? (seriesHasGaps(shown, s.key) ? { r: 3, fill: s.color, stroke: chartDotStroke, strokeWidth: 1 } : false) : selectable ? selectableDot({ selection, seriesKey: s.key, color: s.color, r: chartDotRadius(3, shown.length, expanded), stroke: chartDotStroke }) : { r: chartDotRadius(3, shown.length, expanded), fill: s.color, stroke: chartDotStroke, strokeWidth: 1 }} activeDot={selectable ? selectableActiveDot(5) : { r: 5 }} />
          )}
          {selectedDayGuide(selection)}
          {compareGuides(compare)}
        </ComposedChart>
      </ChartFigure>
    )
  );

  return (
    <Card ref={cardRef} titleSize="chart" className="shadow-md min-w-0" data-record-trend-chart={id}>
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
