import { ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { DailyNote } from '@/hooks/useDailyNotes';
import { ChartFigure } from './ChartFigure';
import { ChartHeader } from './ChartHeader';
import { ChartEmptyState, NO_DATA, type ChartEmptyAction } from './ChartEmptyState';
import { ChartTooltipCard, TooltipNote } from './ChartTooltipCard';
import { NoteDiamond } from './NoteDiamond';
import { CHART_MARGIN, chartGridProps, chartTooltipProps, chartXAxisProps, chartYAxisProps, formatChartValue } from '@/lib/chartTheme';
import { describeSeries } from '@/lib/chartSummary';

export interface WeeklyDay { date: string; fullDate: string; [key: string]: string | number }

interface WeeklyBarChartProps {
  title: string;
  icon: ReactNode;
  data: WeeklyDay[];
  /** Which numeric field of each day to plot. */
  valueKey: string;
  /** Singular label used in the tooltip, e.g. "Protein". */
  label: string;
  unit: string;
  color: string;
  notesMap?: Map<string, DailyNote>;
  /** Where to go when the last 7 days are empty. Defaults to Meals (this chart plots intake); `null` removes the link. */
  emptyAction?: ChartEmptyAction | null;
}

/** Last-7-days bar chart used for calories, protein and carbs. */
export const WeeklyBarChart = ({ title, icon, data, valueKey, label, unit, color, notesMap, emptyAction }: WeeklyBarChartProps) => {
  const action = emptyAction === undefined ? NO_DATA.meals.action : emptyAction;
  const todayStr = new Date().toISOString().split('T')[0];
  // Today is still in progress, so it is left out of the average.
  const pastDays = data.filter((d) => d.fullDate !== todayStr);
  const daysWithData = pastDays.filter((d) => Number(d[valueKey]) > 0);
  const average = daysWithData.length
    ? Math.round(pastDays.reduce((sum, d) => sum + Number(d[valueKey]), 0) / daysWithData.length)
    : 0;
  const noteDays = notesMap ? data.filter((d) => notesMap.has(d.fullDate)) : [];
  const hasData = data.some((d) => Number(d[valueKey]) > 0);
  const rows = data.map((d) => ({ date: d.fullDate, [valueKey]: d[valueKey] }));
  const summary = `${describeSeries(rows, [{ key: valueKey, label, unit, digits: 0 }], 'Last 7 days')}${average ? ` Daily average excluding today: ${formatChartValue(average, unit)}.` : ''}`;

  return (
    <Card titleSize="chart" className="shadow-md min-w-0">
      <ChartHeader
        title={title}
        icon={icon}
        description={<>Avg: <span className="whitespace-nowrap font-semibold text-foreground">{average > 0 ? average.toLocaleString('en-US') : '--'}</span> {unit}/day</>}
      />
      <CardContent>
        {!hasData ? (
          <ChartEmptyState action={action ?? undefined}>No {label.toLowerCase()} logged in the last 7 days.</ChartEmptyState>
        ) : (
          <ChartFigure
            title={title}
            summary={summary}
            caption={`Values in ${unit} · Last 7 days${notesMap ? ' · \u25C6 marks a day with a note' : ''}`}
            table={{ columns: [{ key: 'fullDate', label: 'Date' }, { key: valueKey, label: `${label} (${unit})` }], rows: data }}
          >
            <BarChart accessibilityLayer data={data} margin={{ ...CHART_MARGIN, top: 20 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="date" {...chartXAxisProps} />
              <YAxis {...chartYAxisProps} />
              <Tooltip cursor={chartTooltipProps.cursor} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const day = payload[0].payload as WeeklyDay;
                const note = notesMap?.get(day.fullDate);
                return (
                  <ChartTooltipCard title={`${day.date} (${day.fullDate})`} rows={[{ label, value: formatChartValue(Number(payload[0].value), unit), color }]}>
                    {note && <TooltipNote tags={note.tags} notes={note.notes} />}
                  </ChartTooltipCard>
                );
              }} />
              <Bar dataKey={valueKey} name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={50} />
              {noteDays.map((d) => <ReferenceDot key={d.fullDate} x={d.date} y={Number(d[valueKey])} r={7} shape={<NoteDiamond />} />)}
            </BarChart>
          </ChartFigure>
        )}
      </CardContent>
    </Card>
  );
};
