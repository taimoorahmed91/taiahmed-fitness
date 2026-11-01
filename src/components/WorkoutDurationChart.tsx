import { Dumbbell } from 'lucide-react';
import type { ChartDatasetStatus } from '@/lib/chartViewerData';
import { TrendChart } from './TrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface WorkoutDurationChartProps { data: { date: string; duration: number }[]; status?: ChartDatasetStatus }
const series = [{ key: 'duration', label: 'Duration', color: METRIC_COLORS.workout }];
// The Dashboard fills every day of the window, with 0 minutes on a day without a workout. That 0 is "nothing logged", so such a day can not be A or B.
const daySelection = { compareObserved: (row: Record<string, unknown>) => Number(row.duration) > 0 };
export const WorkoutDurationChart = ({ data, status }: WorkoutDurationChartProps) =>
  <TrendChart status={status} id="workout_duration" title="Workout Duration" icon={<Dumbbell className="h-5 w-5 text-primary" />} data={data} series={series} unit={UNIT_LABEL.minutes} defaultStyle="bar" daySelection={daySelection} empty="No workouts in this period. Try a wider date range." summary={rows =>
    <>Total: <span className="font-semibold text-foreground">{rows.reduce((sum, row) => sum + Number(row.duration ?? 0), 0)}</span> {UNIT_LABEL.minutes}</>
  } />;
