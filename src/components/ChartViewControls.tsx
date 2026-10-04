import { useEffect, useState } from 'react';
import { BarChart3, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ChartRange = '7' | '14' | '30';
export type ChartStyle = 'line' | 'bar';

const preference = <T extends string>(key: string, values: T[], fallback: T): T => {
  try {
    const stored = localStorage.getItem(key) as T | null;
    return stored && values.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

export const useChartRange = (key: string) => {
  const [range, setRange] = useState<ChartRange>(() => preference(`fittrack_chart_${key}_range`, ['7', '14', '30'], '7'));

  useEffect(() => {
    try { localStorage.setItem(`fittrack_chart_${key}_range`, range); }
    catch { /* Storage may be unavailable. */ }
  }, [key, range]);

  return { range, setRange };
};

export const useChartView = (key: string, defaultStyle: ChartStyle = 'line') => {
  const { range, setRange } = useChartRange(key);
  const [style, setStyle] = useState<ChartStyle>(() => preference(`fittrack_chart_${key}_style`, ['line', 'bar'], defaultStyle));

  useEffect(() => {
    try {
      localStorage.setItem(`fittrack_chart_${key}_style`, style);
    } catch { /* Storage may be unavailable. */ }
  }, [key, style]);

  return { range, setRange, style, setStyle };
};

export const recentChartData = <T extends { date: string }>(data: T[], range: ChartRange): T[] => {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (Number(range) - 1));
  const since = start.toISOString().slice(0, 10);
  return data.filter(row => row.date >= since && row.date <= today).sort((a, b) => a.date.localeCompare(b.date));
};

export const chartDateLabel = (date: string) => date.slice(5).replace('-', '/');

export const ChartRangeControls = ({ range, setRange }: ReturnType<typeof useChartRange>) => {
  const item = (value: ChartRange, label: string) => (
    <Button type="button" size="sm" variant="ghost" aria-label={label} aria-pressed={range === value} title={label}
      onClick={() => setRange(value)}
      className={cn('h-7 rounded-none px-2 text-xs font-medium', range === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
      {value}D
    </Button>
  );
  return <div className="flex shrink-0 overflow-hidden rounded-md border">{item('7', 'Last 7 days')}{item('14', 'Last 14 days')}{item('30', 'Last 30 days')}</div>;
};

export const ChartViewControls = ({ range, setRange, style, setStyle }: ReturnType<typeof useChartView>) => {
  const item = (active: boolean, label: string, onClick: () => void, child: React.ReactNode) => (
    <Button type="button" size="sm" variant="ghost" aria-label={label} aria-pressed={active} title={label} onClick={onClick}
      className={cn('h-7 rounded-none px-2 text-xs font-medium', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
      {child}
    </Button>
  );
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex rounded-md border overflow-hidden">
        {item(range === '7', 'Last 7 days', () => setRange('7'), '7D')}
        {item(range === '14', 'Last 14 days', () => setRange('14'), '14D')}
        {item(range === '30', 'Last 30 days', () => setRange('30'), '30D')}
      </div>
      <div className="flex rounded-md border overflow-hidden">
        {item(style === 'line', 'Line chart', () => setStyle('line'), <LineChart className="h-3.5 w-3.5" />)}
        {item(style === 'bar', 'Bar chart', () => setStyle('bar'), <BarChart3 className="h-3.5 w-3.5" />)}
      </div>
    </div>
  );
};