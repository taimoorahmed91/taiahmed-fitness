import { Card, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from 'recharts';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { ChartHeader } from '@/components/charts/ChartHeader';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState';
import { CHART_MARGIN, METRIC_COLORS, UNIT_LABEL, chartDotStroke, chartGridProps, chartLegendProps, chartTooltipProps, chartYAxisProps } from '@/lib/chartTheme';
import { describeSeries } from '@/lib/chartSummary';
import { chartDotRadius, chartMotionProps, chartXAxisFor } from '@/lib/chartViewer';
import { computeYAxis } from '@/lib/chartAxis';
import { curveFor } from '@/lib/chartCurves';
import { useMemo } from 'react';
import { createChartDataset, type ChartDatasetStatus } from '@/lib/chartViewerData';

interface ReportChartsProps {
  /** Source status per chart (lib/chartSourceStatus.ts): each chart reports only the tables it is drawn from. */
  status?: { caloriesWorkout?: ChartDatasetStatus; sleep?: ChartDatasetStatus };
  data: Array<{
    date: string;
    calories: number;
    workout: number;
    sleep: number;
  }>;
}

// No link on purpose: these charts mix meals, workouts and sleep, and the fix is the report period above.
const EMPTY = 'No data in the selected report period.';

export const ReportCharts = ({ data, status }: ReportChartsProps) => {
  const motion = chartMotionProps();
  // Each axis is its own metric (src/lib/chartAxis.ts): calories and workout minutes are bars from 0, sleep hours a zoomed line.
  const caloriesAxis = useMemo(() => computeYAxis(data.map((d) => d.calories), { bar: true }), [data]);
  const workoutAxis = useMemo(() => computeYAxis(data.map((d) => d.workout), { bar: true }), [data]);
  const sleepAxis = useMemo(() => computeYAxis(data.map((d) => d.sleep), { base: 'zoom' }), [data]);
  const comboColumns = [{ key: 'date', label: 'Date' }, { key: 'calories', label: `Calories (${UNIT_LABEL.calories})` }, { key: 'workout', label: `Workout (${UNIT_LABEL.minutes})` }];
  const sleepColumns = [{ key: 'date', label: 'Date' }, { key: 'sleep', label: `Sleep (${UNIT_LABEL.hours})` }];

  // The viewer's Table and CSV: every day of the report period, the same rows the plots draw.
  const comboDataset = createChartDataset({
    name: 'Calories & Workout Trend', period: 'Report period', rows: data, status: status?.caloriesWorkout,
    columns: [{ key: 'date', label: 'Date' }, { key: 'calories', label: 'Calories', unit: UNIT_LABEL.calories, digits: 0 }, { key: 'workout', label: 'Workout', unit: UNIT_LABEL.minutes, digits: 0 }],
  });
  const sleepDataset = createChartDataset({
    name: 'Sleep Trend', period: 'Report period', rows: data, status: status?.sleep,
    columns: [{ key: 'date', label: 'Date' }, { key: 'sleep', label: 'Sleep', unit: UNIT_LABEL.hours }],
  });

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
          <YAxis yAxisId="left" domain={caloriesAxis.domain} ticks={caloriesAxis.ticks} {...chartYAxisProps} />
          <YAxis yAxisId="right" orientation="right" domain={workoutAxis.domain} ticks={workoutAxis.ticks} {...chartYAxisProps} />
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
          <YAxis domain={sleepAxis.domain} ticks={sleepAxis.ticks} {...chartYAxisProps} />
          <Tooltip {...chartTooltipProps} />
          <Line {...motion} type={curveFor('report_sleep')} dataKey="sleep" stroke={METRIC_COLORS.sleep} strokeWidth={3} name={`Sleep (${UNIT_LABEL.hours})`} dot={{ r: chartDotRadius(3, data.length, expanded), fill: METRIC_COLORS.sleep, stroke: chartDotStroke, strokeWidth: 1 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartFigure>
    )
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Calories & Workout Combined */}
      <Card titleSize="chart" className="shadow-md min-w-0">
        <ChartHeader title="Calories & Workout Trend" viewer={{ render: () => comboBody(true), dataset: comboDataset }} />
        <CardContent>{comboBody(false)}</CardContent>
      </Card>

      {/* Sleep Trend */}
      <Card titleSize="chart" className="shadow-md min-w-0">
        <ChartHeader title="Sleep Trend" viewer={{ render: () => sleepBody(true), dataset: sleepDataset }} />
        <CardContent>{sleepBody(false)}</CardContent>
      </Card>
    </div>
  );
};
