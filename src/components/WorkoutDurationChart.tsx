import { Dumbbell } from 'lucide-react';
import { TrendChart } from './TrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface WorkoutDurationChartProps { data: { date: string; duration: number }[] }
const series = [{ key: 'duration', label: 'Duration', color: METRIC_COLORS.workout }];
export const WorkoutDurationChart = ({ data }: WorkoutDurationChartProps) =>
  <TrendChart id="workout_duration" title="Workout Duration" icon={<Dumbbell className="h-5 w-5 text-primary" />} data={data} series={series} unit={UNIT_LABEL.minutes} defaultStyle="bar" empty="No workouts in this period. Try a wider date range." summary={rows =>
    <>Total: <span className="font-semibold text-foreground">{rows.reduce((sum, row) => sum + Number(row.duration ?? 0), 0)}</span> {UNIT_LABEL.minutes}</>
  } />;
