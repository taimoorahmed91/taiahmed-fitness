import { Scale } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';
import { METRIC_COLORS, UNIT_LABEL } from '@/lib/chartTheme';

interface WeightChartProps { data: { date: string; weight: number }[]; notesMap?: Map<string, DailyNote> }
const series = [{ key: 'weight', label: 'Weight', color: METRIC_COLORS.weight }];
export const WeightChart = ({ data, notesMap }: WeightChartProps) =>
  <TrendChart extendedRanges id="weight" title="Weight Trend" icon={<Scale className="h-5 w-5 text-primary" />} data={data.filter(d => d.weight > 0)} series={series} unit={UNIT_LABEL.kilograms} notesMap={notesMap} empty="No weight entries in this period. Try a wider date range." summary={rows => {
    const latest = rows[rows.length - 1]?.weight;
    return latest != null && <>Latest: <span className="font-semibold text-foreground">{latest}</span> {UNIT_LABEL.kilograms}</>;
  }} />;
