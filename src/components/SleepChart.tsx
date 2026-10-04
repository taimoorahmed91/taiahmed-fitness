import { Moon } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { TrendChart } from './TrendChart';

interface SleepChartProps { data: { date: string; hours: number; whoopHours?: number }[]; notesMap?: Map<string, DailyNote> }
const series = [
  { key: 'hours', label: 'Manual Sleep', color: 'hsl(var(--chart-actual))' },
  { key: 'whoopHours', label: 'WHOOP In Bed', color: 'hsl(var(--chart-min))', dashed: true },
];
export const SleepChart = ({ data, notesMap }: SleepChartProps) =>
  <TrendChart id="sleep" title="Sleep" icon={<Moon className="h-5 w-5 text-primary" />} data={data.filter(d => d.hours > 0 || (d.whoopHours ?? 0) > 0).map(d => ({ ...d, hours: d.hours || null, whoopHours: d.whoopHours || null }))} series={series} unit="hrs" notesMap={notesMap} defaultStyle="bar" empty="No sleep data in this period." summary={rows => {
    const avg = (key: 'hours' | 'whoopHours') => {
      const values = rows.map(d => d[key]).filter((value): value is number => typeof value === 'number' && value > 0);
      return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : null;
    };
    return <span className="text-xs text-muted-foreground">{avg('hours') && `Manual avg: ${avg('hours')} hrs`}{avg('hours') && avg('whoopHours') && ' · '}{avg('whoopHours') && `WHOOP avg: ${avg('whoopHours')} hrs`}</span>;
  }} />;
