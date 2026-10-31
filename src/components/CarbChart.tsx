import { Wheat } from 'lucide-react';
import { WeeklyBarChart } from '@/components/charts/WeeklyBarChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface CarbChartProps {
  data: { date: string; fullDate: string; carbs: number }[];
}

export const CarbChart = ({ data }: CarbChartProps) => (
  <WeeklyBarChart title="Weekly Carbs" icon={<Wheat className="h-5 w-5 text-primary" />} data={data} valueKey="carbs" label="Carbs" unit={UNIT_LABEL.grams} color={METRIC_COLORS.carbs} />
);
