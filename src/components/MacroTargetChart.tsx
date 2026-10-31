import { useMemo, useRef } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { useChartView } from './ChartViewControls';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState, NO_DATA } from '@/components/charts/ChartEmptyState';
import { ChartTooltipCard } from '@/components/charts/ChartTooltipCard';
import { CHART_COLORS, CHART_MARGIN, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartYAxisProps, formatChartValue } from '@/lib/chartTheme';
import { RANGE_LABELS, formatChartDate, windowChartRows } from '@/lib/chartRange';
import { describeSeries } from '@/lib/chartSummary';
import { chartDotRadius, chartMotionProps, chartXAxisFor } from '@/lib/chartViewer';

interface MacroTargetChartProps {
  /**
   * One row per calendar day, oldest first. `date` should be ISO (YYYY-MM-DD);
   * an "MM/DD" label over a gap-free series ending today is still accepted.
   */
  data: { date: string; actual: number; min: number | null; max: number | null }[];
  title: string;
  unit: string;
  storageKey?: string;
}

const LABELS: Record<string, string> = { actual: 'Actual intake', min: 'Min target', max: 'Max target' };

export const MacroTargetChart = ({ data, title, unit, storageKey }: MacroTargetChartProps) => {
  const id = `macro_${storageKey ?? title}`;
  // Keeps whatever range/style the old, separate controls had saved.
  const view = useChartView(id, 'line', { legacyPrefix: `fittrack_macro_chart_${storageKey ?? title}` });
  const { range, style } = view;
  const cardRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => windowChartRows(data, range), [data, range]);

  const yDomain = useMemo(() => {
    const values = shown.flatMap((d) => [d.actual, d.min, d.max]).filter((v): v is number => v != null);
    if (values.length === 0) return [0, 1];
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (style === 'bar') min = 0;
    if (max === min) {
      max += 1;
      min = Math.max(0, min - 1);
    }
    const pad = Math.max(1, (max - min) * 0.1);
    return [style === 'bar' ? 0 : Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [shown, style]);

  const period = RANGE_LABELS[range];
  const summary = useMemo(
    () => describeSeries(shown, [
      { key: 'actual', label: LABELS.actual, unit, digits: 0 },
      { key: 'min', label: LABELS.min, unit, digits: 0 },
      { key: 'max', label: LABELS.max, unit, digits: 0 },
    ], period),
    [shown, unit, period],
  );
  const columns = [{ key: 'date', label: 'Date' }, { key: 'actual', label: `Actual (${unit})` }, { key: 'min', label: `Min target (${unit})` }, { key: 'max', label: `Max target (${unit})` }];

  const motion = chartMotionProps();
  // The card and the full-screen viewer draw the same chart from the same state; only `expanded` differs.
  const body = (expanded: boolean) => (
    shown.length === 0 ? (
      // No rows at all: logging a meal is the fix. Rows outside the range: a wider range is.
      data.length === 0
        ? <ChartEmptyState action={NO_DATA.meals.action}>{NO_DATA.meals.message}</ChartEmptyState>
        : <ChartEmptyState>No intake data in this period. Try a wider date range.</ChartEmptyState>
    ) : (
      <ChartFigure expanded={expanded} title={title} summary={summary} caption={`Values in ${unit} · ${period}`} table={{ columns, rows: shown }}>
        <ComposedChart accessibilityLayer data={shown} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="date" tickFormatter={formatChartDate} {...chartXAxisFor(shown.length, expanded)} />
          <YAxis domain={yDomain} {...chartYAxisProps} />
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
          {style === 'bar' ? (
            <Bar {...motion} dataKey="actual" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} name="actual" />
          ) : (
            <Line {...motion} type="monotone" dataKey="actual" stroke={CHART_COLORS.actual} strokeWidth={3.5} dot={{ r: chartDotRadius(4, shown.length, expanded), fill: CHART_COLORS.actual, stroke: chartDotStroke, strokeWidth: 1.5 }} activeDot={{ r: 6 }} name="actual" connectNulls />
          )}
          <Line {...motion} type="monotone" dataKey="min" stroke={CHART_COLORS.min} strokeWidth={2} strokeDasharray="8 5" dot={false} name="min" connectNulls />
          <Line {...motion} type="monotone" dataKey="max" stroke={CHART_COLORS.max} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" dot={false} name="max" connectNulls />
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
        viewer={{ render: () => body(true) }}
      />
      <CardContent>{body(false)}</CardContent>
    </Card>
  );
};
