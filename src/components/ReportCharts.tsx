import { Card, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from 'recharts';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState';
import { CHART_MARGIN, METRIC_COLORS, UNIT_LABEL, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartXAxisProps, chartYAxisProps } from '@/lib/chartTheme';
import { describeSeries } from '@/lib/chartSummary';

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
  const comboColumns = [{ key: 'date', label: 'Date' }, { key: 'calories', label: `Calories (${UNIT_LABEL.calories})` }, { key: 'workout', label: `Workout (${UNIT_LABEL.minutes})` }];
  const sleepColumns = [{ key: 'date', label: 'Date' }, { key: 'sleep', label: `Sleep (${UNIT_LABEL.hours})` }];
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Calories & Workout Combined */}
      <Card titleSize="chart" className="shadow-md min-w-0">
        <ChartHeader title="Calories & Workout Trend" />
        <CardContent>
          {data.length === 0 ? <ChartEmptyState>{EMPTY}</ChartEmptyState> : (
            <ChartFigure
              title="Calories and workout trend"
              summary={describeSeries(data, [{ key: 'calories', label: 'Calories', unit: UNIT_LABEL.calories, digits: 0 }, { key: 'workout', label: 'Workout', unit: UNIT_LABEL.minutes, digits: 0 }])}
              caption={`Left axis: ${UNIT_LABEL.calories} · Right axis: workout ${UNIT_LABEL.minutes}`}
              table={{ columns: comboColumns, rows: data }}
            >
              <BarChart accessibilityLayer data={data} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="date" {...chartXAxisProps} />
                <YAxis yAxisId="left" {...chartYAxisProps} />
                <YAxis yAxisId="right" orientation="right" {...chartYAxisProps} />
                <Tooltip {...chartTooltipProps} />
                <Legend {...chartLegendProps} />
                <Bar yAxisId="left" dataKey="calories" fill={METRIC_COLORS.calories} name={`Calories (${UNIT_LABEL.calories})`} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="workout" fill={METRIC_COLORS.workout} name={`Workout (${UNIT_LABEL.minutes})`} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFigure>
          )}
        </CardContent>
      </Card>

      {/* Sleep Trend */}
      <Card titleSize="chart" className="shadow-md min-w-0">
        <ChartHeader title="Sleep Trend" />
        <CardContent>
          {data.length === 0 ? <ChartEmptyState>{EMPTY}</ChartEmptyState> : (
            <ChartFigure
              title="Sleep trend"
              summary={describeSeries(data, [{ key: 'sleep', label: 'Sleep', unit: UNIT_LABEL.hours }])}
              caption={`Values in ${UNIT_LABEL.hours}`}
              table={{ columns: sleepColumns, rows: data }}
            >
              <LineChart accessibilityLayer data={data} margin={CHART_MARGIN}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="date" {...chartXAxisProps} />
                <YAxis domain={[0, 12]} {...chartYAxisProps} />
                <Tooltip {...chartTooltipProps} />
                <Line type="monotone" dataKey="sleep" stroke={METRIC_COLORS.sleep} strokeWidth={3} name={`Sleep (${UNIT_LABEL.hours})`} dot={{ r: 3, fill: METRIC_COLORS.sleep, stroke: chartDotStroke, strokeWidth: 1 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ChartFigure>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
