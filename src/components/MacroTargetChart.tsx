import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { BarChart3, LineChart as LineIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MacroTargetChartProps {
  data: { date: string; actual: number; min: number | null; max: number | null }[];
  title: string;
  unit: string;
  color: string;
  storageKey?: string;
}

type Range = '7' | '30';
type Style = 'line' | 'bar';

const LABELS: Record<string, string> = { actual: 'Actual', min: 'Min', max: 'Max' };

const readPref = <T extends string>(key: string, allowed: T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

const Seg = ({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label: string }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      'px-2 py-1 text-xs font-medium transition-colors flex items-center',
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
    )}
  >
    {children}
  </button>
);

export const MacroTargetChart = ({ data, title, unit, color, storageKey }: MacroTargetChartProps) => {
  const key = `fittrack_macro_chart_${storageKey ?? title}`;
  const [range, setRange] = useState<Range>(() => readPref<Range>(`${key}_range`, ['7', '30'], '7'));
  const [style, setStyle] = useState<Style>(() => readPref<Style>(`${key}_style`, ['line', 'bar'], 'line'));

  useEffect(() => {
    try {
      localStorage.setItem(`${key}_range`, range);
      localStorage.setItem(`${key}_style`, style);
    } catch {
      /* ignore */
    }
  }, [key, range, style]);

  const shown = useMemo(() => (range === '7' ? data.slice(-7) : data), [data, range]);

  const yDomain = useMemo(() => {
    const values = shown.flatMap((d) => [d.actual, d.min, d.max]).filter((v): v is number => v != null);
    if (values.length === 0) return [0, 1];
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (style === 'bar') min = 0;
    if (max === min) {
      max += 1;
      min = Math.max(0, min - 1);
    }
    const pad = Math.max(1, (max - min) * 0.1);
    return [style === 'bar' ? 0 : Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [shown, style]);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <Seg label="Last 7 days" active={range === '7'} onClick={() => setRange('7')}>7D</Seg>
              <Seg label="Last 30 days" active={range === '30'} onClick={() => setRange('30')}>30D</Seg>
            </div>
            <div className="flex rounded-md border overflow-hidden">
              <Seg label="Line chart" active={style === 'line'} onClick={() => setStyle('line')}>
                <LineIcon className="h-3.5 w-3.5" />
              </Seg>
              <Seg label="Bar chart" active={style === 'bar'} onClick={() => setStyle('bar')}>
                <BarChart3 className="h-3.5 w-3.5" />
              </Seg>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={shown} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" width={50} domain={yDomain} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number | undefined, name?: string) => [
                  `${Math.round(value ?? 0)} ${unit}`,
                  LABELS[name ?? ''] ?? name,
                ]}
              />
              <Legend formatter={(value) => LABELS[value] ?? value} />
              {style === 'bar' ? (
                <Bar dataKey="actual" fill={color} radius={[4, 4, 0, 0]} name="actual" />
              ) : (
                <Line type="monotone" dataKey="actual" stroke={color} strokeWidth={2} dot={{ r: 3 }} name="actual" connectNulls />
              )}
              <Line type="monotone" dataKey="min" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" dot={false} name="min" connectNulls />
              <Line type="monotone" dataKey="max" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={false} name="max" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
