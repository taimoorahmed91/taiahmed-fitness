import { TrendingUp } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { WeeklyBarChart } from '@/components/charts/WeeklyBarChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface CalorieChartProps {
  data: { date: string; fullDate: string; calories: number }[];
  notesMap?: Map<string, DailyNote>;
}

export const CalorieChart = ({ data, notesMap }: CalorieChartProps) => (
  <WeeklyBarChart title="Weekly Calories" icon={<TrendingUp className="h-5 w-5 text-primary" />} data={data} valueKey="calories" label="Calories" unit={UNIT_LABEL.calories} color={METRIC_COLORS.calories} notesMap={notesMap} />
);
