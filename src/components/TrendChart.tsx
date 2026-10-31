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
import { CHART_MARGIN, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartYAxisProps, formatChartValue } from '@/lib/chartTheme';
import { CHART_RANGES, RANGE_LABELS } from '@/lib/chartRange';
import { describeSeries } from '@/lib/chartSummary';
import { chartDotRadius, chartMotionProps, chartXAxisFor } from '@/lib/chartViewer';

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
}

export const TrendChart = ({ id, title, icon, data, series, unit, defaultStyle, notesMap, cap, summary, empty, noData, extendedRanges }: TrendChartProps) => {
  const view = useChartView(id, defaultStyle, { allowed: extendedRanges ? CHART_RANGES : undefined });
  const cardRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => recentChartData(data, view.range), [data, view.range]);
  const values = shown.flatMap(row => series.map(s => row[s.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max(cap ? 1 : 0.5, (max - min) * 0.1);
  const domain = view.style === 'bar'
    ? [Math.min(0, Math.floor(min - (min < 0 ? pad : 0))), cap ? Math.min(cap, Math.ceil(max + pad)) : Math.max(1, Math.ceil(max + pad))]
    : [min < 0 ? Math.floor(min - pad) : Math.max(0, Math.floor(min - pad)), cap ? Math.min(cap, Math.ceil(max + pad)) : Math.ceil(max + pad)];
  const noteDots = shown.filter(row => notesMap?.has(row.date) && typeof row[series[0]?.key] === 'number');
  const period = RANGE_LABELS[view.range];
  // Nothing logged at all (not just nothing in this range): logging is the fix, so offer the link.
  const emptyNoData = data.length === 0 ? (noData === undefined ? TREND_NO_DATA[id] : noData) : null;
  const summaryText = useMemo(() => describeSeries(shown, series.map(s => ({ key: s.key, label: s.label, unit })), period), [shown, series, unit, period]);

  const pdfColumns = [{ key: 'date', label: 'Date' }, ...series.map(s => ({ key: s.key, label: `${s.label}${unit ? ` (${unit})` : ''}` }))];

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
        caption={`${unit ? `Values in ${unit} · ` : ''}${period}${notesMap ? ' · \u25C6 marks a day with a note' : ''}`}
        table={{ columns: pdfColumns, rows: shown }}
      >
        <ComposedChart accessibilityLayer data={shown} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="date" tickFormatter={chartDateLabel} {...chartXAxisFor(shown.length, expanded)} />
          <YAxis domain={domain} {...chartYAxisProps} />
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
            <Bar {...motion} key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={40} radius={[3, 3, 0, 0]} /> :
            <Line {...motion} key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.dashed ? 2 : 3} strokeDasharray={s.dashed ? '8 5' : undefined} dot={s.dashed ? false : { r: chartDotRadius(3, shown.length, expanded), fill: s.color, stroke: chartDotStroke, strokeWidth: 1 }} activeDot={{ r: 5 }} connectNulls />
          )}
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
        viewer={{ render: () => body(true) }}
      />
      <CardContent>{body(false)}</CardContent>
    </Card>
  );
};
