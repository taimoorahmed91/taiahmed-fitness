import { useMemo, useRef } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Scale } from 'lucide-react';
import { chartDateLabel, recentChartData, useChartRange } from './ChartViewControls';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState, NO_DATA } from '@/components/charts/ChartEmptyState';
import { ChartTooltipCard } from '@/components/charts/ChartTooltipCard';
import { CHART_MARGIN, METRIC_COLORS, UNIT_LABEL, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartXAxisProps, chartYAxisProps, formatChartValue } from '@/lib/chartTheme';
import { RANGE_LABELS } from '@/lib/chartRange';
import { describeSeries } from '@/lib/chartSummary';
import { computeBodyRecomposition, RECOMP_LABELS } from '@/lib/crossMetricIntelligence';
import { cn } from '@/lib/utils';

type Entry = { date: string; value: number };

// Status colours only: good = chart-min, caution = chart-warn, bad = chart-max.
// "info" is neutral because it carries no good/bad meaning.
export const toneClass: Record<string, string> = {
  good: 'bg-chart-min/15 text-chart-min border-chart-min/30',
  info: 'bg-secondary text-secondary-foreground border-border',
  warn: 'bg-chart-warn/15 text-chart-warn border-chart-warn/30',
  bad: 'bg-chart-max/15 text-chart-max border-chart-max/30',
  muted: 'bg-muted text-muted-foreground border-border',
};

const fmt = (v: number | null, unit: string) => (v == null ? '--' : `${v > 0 ? '+' : v < 0 ? '\u2212' : ''}${Math.abs(v).toFixed(1)} ${unit}`);

export const BodyRecompositionCard = ({ weight, waist }: { weight: Entry[]; waist: Entry[] }) => {
  // Two lines on separate axes: date range only, a line/bar switch does not apply.
  const view = useChartRange('body_recomp');
  const cardRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => computeBodyRecomposition(weight, waist, Number(view.range)), [weight, waist, view.range]);
  const info = RECOMP_LABELS[result.status];
  const title = 'Body Recomposition Index';
  const period = RANGE_LABELS[view.range];

  const data = useMemo(() => {
    const map = new Map<string, { date: string; weight?: number; waist?: number }>();
    weight.forEach(w => map.set(w.date, { ...(map.get(w.date) || { date: w.date }), weight: w.value }));
    waist.forEach(w => map.set(w.date, { ...(map.get(w.date) || { date: w.date }), waist: w.value }));
    return recentChartData([...map.values()], view.range);
  }, [weight, waist, view.range]);

  const domain = (key: 'weight' | 'waist') => {
    const vals = data.map(d => d[key]).filter((v): v is number => typeof v === 'number');
    if (!vals.length) return [0, 1];
    const min = Math.min(...vals), max = Math.max(...vals), pad = Math.max(0.5, (max - min) * 0.1);
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  };

  const columns = [{ key: 'date', label: 'Date' }, { key: 'weight', label: `Weight (${UNIT_LABEL.kilograms})` }, { key: 'waist', label: `Waist (${UNIT_LABEL.centimeters})` }];
  const summary = `${info.label}. ${info.message} Weight change ${fmt(result.weightDelta, UNIT_LABEL.kilograms)}, waist change ${fmt(result.waistDelta, UNIT_LABEL.centimeters)}. ${describeSeries(data, [
    { key: 'weight', label: 'Weight', unit: UNIT_LABEL.kilograms },
    { key: 'waist', label: 'Waist', unit: UNIT_LABEL.centimeters },
  ], period)}`;

  return (
    <Card ref={cardRef} titleSize="chart" className="shadow-md min-w-0">
      <ChartHeader
        title={title}
        icon={<Scale className="h-5 w-5 text-primary" />}
        view={view}
        pdf={{ targetRef: cardRef, subtitle: period, columns, rows: data }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('border', toneClass[info.tone])}>{info.label}</Badge>
          <span className="text-sm text-muted-foreground">Δ Weight <b className="text-foreground">{fmt(result.weightDelta, UNIT_LABEL.kilograms)}</b></span>
          <span className="text-sm text-muted-foreground">Δ Waist <b className="text-foreground">{fmt(result.waistDelta, UNIT_LABEL.centimeters)}</b></span>
        </div>
        <p className="text-sm text-muted-foreground">{info.message}</p>
      </ChartHeader>
      <CardContent>
        {data.length === 0 ? (
          // Nothing logged at all: point at both pages. Entries outside the range: a wider range is the fix.
          weight.length === 0 && waist.length === 0
            ? <ChartEmptyState action={NO_DATA.body.action} secondaryAction={NO_DATA.body.secondaryAction}>{NO_DATA.body.message}</ChartEmptyState>
            : <ChartEmptyState>No weight or waist entries in this period. Try a wider date range.</ChartEmptyState>
        ) : (
          <ChartFigure title={title} summary={summary} height={260} caption={`Left axis: weight in ${UNIT_LABEL.kilograms} (solid) · Right axis: waist in ${UNIT_LABEL.centimeters} (dashed) · ${period}`} table={{ columns, rows: data }}>
            <ComposedChart accessibilityLayer data={data} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="date" tickFormatter={chartDateLabel} {...chartXAxisProps} />
              <YAxis yAxisId="w" domain={domain('weight')} {...chartYAxisProps} tick={{ ...chartYAxisProps.tick, fill: METRIC_COLORS.weight }} />
              <YAxis yAxisId="v" orientation="right" domain={domain('waist')} {...chartYAxisProps} tick={{ ...chartYAxisProps.tick, fill: METRIC_COLORS.waist }} />
              <Tooltip cursor={chartTooltipProps.cursor} content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return <ChartTooltipCard title={chartDateLabel(String(label))} rows={payload.filter(p => p.value != null).map(p => ({
                  label: String(p.dataKey) === 'weight' ? 'Weight' : 'Waist',
                  value: formatChartValue(Number(p.value), String(p.dataKey) === 'weight' ? UNIT_LABEL.kilograms : UNIT_LABEL.centimeters),
                  color: String(p.color),
                }))} />;
              }} />
              <Legend {...chartLegendProps} />
              <Line yAxisId="w" type="monotone" dataKey="weight" name={`Weight (${UNIT_LABEL.kilograms})`} stroke={METRIC_COLORS.weight} strokeWidth={3.5} dot={{ r: 4, fill: METRIC_COLORS.weight, stroke: chartDotStroke, strokeWidth: 1 }} connectNulls />
              <Line yAxisId="v" type="monotone" dataKey="waist" name={`Waist (${UNIT_LABEL.centimeters})`} stroke={METRIC_COLORS.waist} strokeWidth={2.5} strokeDasharray="8 5" dot={{ r: 3, fill: METRIC_COLORS.waist, stroke: chartDotStroke, strokeWidth: 1 }} connectNulls />
            </ComposedChart>
          </ChartFigure>
        )}
      </CardContent>
    </Card>
  );
};
