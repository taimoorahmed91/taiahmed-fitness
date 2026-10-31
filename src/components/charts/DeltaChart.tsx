import { ReactNode, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { ChartFigure } from './ChartFigure';
import { ChartHeader } from './ChartHeader';
import { ChartEmptyState, NO_DATA, type ChartEmptyAction } from './ChartEmptyState';
import { ChartTooltipCard } from './ChartTooltipCard';
import { CHART_COLORS, CHART_MARGIN, UNIT_LABEL, chartGridProps, chartTooltipProps, chartXAxisProps, chartYAxisProps, formatSigned } from '@/lib/chartTheme';
import { DeltaPoint, DeltaSummary, computeDeltaSeries } from '@/lib/deltaSeries';
import { cn } from '@/lib/utils';

interface DeltaChartProps {
  title: string;
  icon: ReactNode;
  unit: string;
  entries: { date: string; value: number }[];
  emptyText: string;
  /**
   * Link shown with `emptyText`. Needing two measurements is fixed by logging, never by a range,
   * so it defaults to the page that owns the unit (kg: Weight, cm: Waist); `null` removes it.
   */
  emptyAction?: ChartEmptyAction | null;
}

const defaultAction = (unit: string): ChartEmptyAction | undefined =>
  unit === UNIT_LABEL.kilograms ? NO_DATA.weight.action : unit === UNIT_LABEL.centimeters ? NO_DATA.waist.action : undefined;

// A drop is the good direction for weight and waist: chart-min (green) for a
// drop, chart-max (red) for a rise. The arrow and sign repeat it in text.
const tone = (n: number) => (n < 0 ? { text: 'text-chart-min', fill: CHART_COLORS.min, glyph: '\u2193' } : n > 0 ? { text: 'text-chart-max', fill: CHART_COLORS.max, glyph: '\u2191' } : { text: 'text-muted-foreground', fill: CHART_COLORS.muted, glyph: '\u2192' });

const summaryText = (s: DeltaSummary, unit: string) => `${formatSigned(s.change, unit)} in ${s.days} ${s.days === 1 ? 'day' : 'days'} (${formatSigned(s.perWeek, `${unit}/week`)})`;

/** Change between consecutive measurements. Shared by the weight and waist change charts. */
export const DeltaChart = ({ title, icon, unit, entries, emptyText, emptyAction }: DeltaChartProps) => {
  const action = emptyAction === undefined ? defaultAction(unit) : emptyAction ?? undefined;
  const { points, last, overall } = useMemo(() => computeDeltaSeries(entries), [entries]);

  const line = (name: string, s: DeltaSummary) => {
    const t = tone(s.change);
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">{name}:</span>{' '}
        <span className={cn('font-medium', t.text)}><span aria-hidden="true">{t.glyph} </span>{summaryText(s, unit)}</span>
      </p>
    );
  };

  const description = points.length
    ? `${title}. ${last ? `Last interval ${summaryText({ change: last.delta, days: last.days, perWeek: last.perWeek }, unit)}. ` : ''}${overall ? `Overall ${summaryText(overall, unit)}. ` : ''}Showing the last ${points.length} intervals.`
    : '';

  return (
    <Card titleSize="chart" className="shadow-md min-w-0">
      <ChartHeader title={title} icon={icon}>
        {(last || overall) && (
          <div className="space-y-1">
            {last && line('Last', { change: last.delta, days: last.days, perWeek: last.perWeek })}
            {overall && line('Overall', overall)}
          </div>
        )}
      </ChartHeader>
      <CardContent>
        {points.length === 0 ? (
          <ChartEmptyState action={action}>{emptyText}</ChartEmptyState>
        ) : (
          <ChartFigure
            title={title}
            summary={description}
            height={200}
            caption={`Change in ${unit} between measurements · bars below zero are drops (green), above are rises (red)`}
            table={{ columns: [{ key: 'isoDate', label: 'Date' }, { key: 'delta', label: `Change (${unit})` }, { key: 'days', label: 'Days' }, { key: 'perWeek', label: `Per week (${unit})` }], rows: points as unknown as Record<string, unknown>[] }}
          >
            <BarChart accessibilityLayer data={points} margin={CHART_MARGIN}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="date" {...chartXAxisProps} />
              <YAxis {...chartYAxisProps} />
              <Tooltip cursor={chartTooltipProps.cursor} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as DeltaPoint;
                const t = tone(p.delta);
                return (
                  <ChartTooltipCard title={p.isoDate} rows={[
                    { label: 'Change', value: `${t.glyph} ${formatSigned(p.delta, unit)}`, color: t.fill },
                    { label: 'Days', value: String(p.days) },
                    { label: 'Pace', value: formatSigned(p.perWeek, `${unit}/week`) },
                  ]} />
                );
              }} />
              <ReferenceLine y={0} stroke={CHART_COLORS.grid} strokeWidth={1} />
              <Bar dataKey="delta" name={`Change (${unit})`} radius={[4, 4, 0, 0]}>
                {points.map((p) => <Cell key={p.isoDate} fill={tone(p.delta).fill} />)}
              </Bar>
            </BarChart>
          </ChartFigure>
        )}
      </CardContent>
    </Card>
  );
};
