import { Dumbbell } from 'lucide-react';
import { TrendChart } from './TrendChart';

interface WorkoutDurationChartProps { data: { date: string; duration: number }[] }
const series = [{ key: 'duration', label: 'Duration', color: 'hsl(var(--chart-actual))' }];
export const WorkoutDurationChart = ({ data }: WorkoutDurationChartProps) =>
  <TrendChart id="workout_duration" title="Workout Duration" icon={<Dumbbell className="h-5 w-5 text-primary" />} data={data} series={series} unit="min" defaultStyle="bar" empty="No workouts in this period." summary={rows =>
    <span className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{rows.reduce((sum, row) => sum + Number(row.duration ?? 0), 0)}</span> min</span>
  } />;
