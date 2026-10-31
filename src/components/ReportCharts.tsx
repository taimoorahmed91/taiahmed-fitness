import { Card, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from 'recharts';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState';
import { CHART_MARGIN, METRIC_COLORS, UNIT_LABEL, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartYAxisProps } from '@/lib/chartTheme';
import { describeSeries } from '@/lib/chartSummary';
import { chartDotRadius, chartMotionProps, chartXAxisFor } from '@/lib/chartViewer';

interface ReportChartsProps {
  data: Array<{
    date: string;
    calories: number;
    workout: number;
    sleep: number;
  }>;
}

// No link on purpose: these charts mix meals, workouts and sleep, and the fix is the report period above.
const EMPTY = 'No data in the selected report period.';

export const ReportCharts = ({ data }: ReportChartsProps) => {
  const motion = chartMotionProps();
  const comboColumns = [{ key: 'date', label: 'Date' }, { key: 'calories', label: `Calories (${UNIT_LABEL.calories})` }, { key: 'workout', label: `Workout (${UNIT_LABEL.minutes})` }];
  const sleepColumns = [{ key: 'date', label: 'Date' }, { key: 'sleep', label: `Sleep (${UNIT_LABEL.hours})` }];

  // Each card and its full-screen viewer draw the same chart from the same report data; only `expanded` differs.
  const comboBody = (expanded: boolean) => (
    data.length === 0 ? <ChartEmptyState>{EMPTY}</ChartEmptyState> : (
      <ChartFigure
        expanded={expanded}
        title="Calories and workout trend"
        summary={describeSeries(data, [{ key: 'calories', label: 'Calories', unit: UNIT_LABEL.calories, digits: 0 }, { key: 'workout', label: 'Workout', unit: UNIT_LABEL.minutes, digits: 0 }])}
        caption={`Left axis: ${UNIT_LABEL.calories} · Right axis: workout ${UNIT_LABEL.minutes}`}
        table={{ columns: comboColumns, rows: data }}
      >
        <BarChart accessibilityLayer data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="date" {...chartXAxisFor(data.length, expanded)} />
          <YAxis yAxisId="left" {...chartYAxisProps} />
          <YAxis yAxisId="right" orientation="right" {...chartYAxisProps} />
          <Tooltip {...chartTooltipProps} />
          <Legend {...chartLegendProps} />
          <Bar {...motion} yAxisId="left" dataKey="calories" fill={METRIC_COLORS.calories} name={`Calories (${UNIT_LABEL.calories})`} radius={[4, 4, 0, 0]} />
          <Bar {...motion} yAxisId="right" dataKey="workout" fill={METRIC_COLORS.workout} name={`Workout (${UNIT_LABEL.minutes})`} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartFigure>
    )
  );

  const sleepBody = (expanded: boolean) => (
    data.length === 0 ? <ChartEmptyState>{EMPTY}</ChartEmptyState> : (
      <ChartFigure
        expanded={expanded}
        title="Sleep trend"
        summary={describeSeries(data, [{ key: 'sleep', label: 'Sleep', unit: UNIT_LABEL.hours }])}
        caption={`Values in ${UNIT_LABEL.hours}`}
        table={{ columns: sleepColumns, rows: data }}
      >
        <LineChart accessibilityLayer data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="date" {...chartXAxisFor(data.length, expanded)} />
          <YAxis domain={[0, 12]} {...chartYAxisProps} />
          <Tooltip {...chartTooltipProps} />
          <Line {...motion} type="monotone" dataKey="sleep" stroke={METRIC_COLORS.sleep} strokeWidth={3} name={`Sleep (${UNIT_LABEL.hours})`} dot={{ r: chartDotRadius(3, data.length, expanded), fill: METRIC_COLORS.sleep, stroke: chartDotStroke, strokeWidth: 1 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartFigure>
    )
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Calories & Workout Combined */}
      <Card titleSize="chart" className="shadow-md min-w-0">
        <ChartHeader title="Calories & Workout Trend" viewer={{ render: () => comboBody(true) }} />
        <CardContent>{comboBody(false)}</CardContent>
      </Card>

      {/* Sleep Trend */}
      <Card titleSize="chart" className="shadow-md min-w-0">
        <ChartHeader title="Sleep Trend" viewer={{ render: () => sleepBody(true) }} />
        <CardContent>{sleepBody(false)}</CardContent>
      </Card>
    </div>
  );
};
