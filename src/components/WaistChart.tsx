import { Ruler } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';

interface WaistChartProps { data: { date: string; waist: number }[]; notesMap?: Map<string, DailyNote> }
const series = [{ key: 'waist', label: 'Waist', color: 'hsl(var(--primary))' }];
export const WaistChart = ({ data, notesMap }: WaistChartProps) =>
  <TrendChart id="waist" title="Waist Trend" icon={<Ruler className="h-5 w-5 text-primary" />} data={data.filter(d => d.waist > 0)} series={series} unit="cm" notesMap={notesMap} empty="No waist data in this period." summary={rows => {
    const latest = rows[rows.length - 1]?.waist;
    return latest != null && <span className="text-sm text-muted-foreground">Latest: <span className="font-semibold text-foreground">{latest}</span> cm</span>;
  }} />;
