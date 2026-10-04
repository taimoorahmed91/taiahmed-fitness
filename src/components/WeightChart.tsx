import { Scale } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';

interface WeightChartProps { data: { date: string; weight: number }[]; notesMap?: Map<string, DailyNote> }
const series = [{ key: 'weight', label: 'Weight', color: 'hsl(var(--chart-actual))' }];
export const WeightChart = ({ data, notesMap }: WeightChartProps) =>
  <TrendChart id="weight" title="Weight Trend" icon={<Scale className="h-5 w-5 text-primary" />} data={data.filter(d => d.weight > 0)} series={series} unit="kg" notesMap={notesMap} empty="No weight data in this period." summary={rows => {
    const latest = rows[rows.length - 1]?.weight;
    return latest != null && <span className="text-sm text-muted-foreground">Latest: <span className="font-semibold text-foreground">{latest}</span> kg</span>;
  }} />;
