import { Drumstick } from 'lucide-react';
import { WeeklyBarChart } from '@/components/charts/WeeklyBarChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface ProteinChartProps {
  data: { date: string; fullDate: string; protein: number }[];
}

export const ProteinChart = ({ data }: ProteinChartProps) => (
  <WeeklyBarChart title="Weekly Protein" icon={<Drumstick className="h-5 w-5 text-primary" />} data={data} valueKey="protein" label="Protein" unit={UNIT_LABEL.grams} color={METRIC_COLORS.protein} />
);
