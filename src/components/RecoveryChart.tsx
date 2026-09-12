import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HeartPulse } from 'lucide-react';

interface RecoveryChartProps {
  data: { date: string; recovery: number }[];
}

export const RecoveryChart = ({ data }: RecoveryChartProps) => {
  const latest = data.length > 0 ? data[data.length - 1].recovery : null;

  const yDomain = useMemo(() => {
    if (data.length === 0) return [0, 100];

    const values = data.map((d) => d.recovery);
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (max === min) {
      max = Math.min(100, max + 1);
      min = Math.max(0, min - 1);
    }

    const range = max - min;
    const pad = Math.max(1, range * 0.1);

    const yMin = Math.max(0, Math.floor(min - pad));
    const yMax = Math.min(100, Math.ceil(max + pad));

    return [yMin, yMax];
  }, [data]);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HeartPulse className="h-5 w-5 text-primary" />
            WHOOP Recovery
          </CardTitle>
          {latest !== null && (
            <span className="text-sm text-muted-foreground">
              Latest: <span className="font-semibold text-foreground">{latest}%</span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No WHOOP recovery data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                domain={yDomain}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`${value}%`, 'Recovery']}
              />
              <Line
                type="monotone"
                dataKey="recovery"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--chart-2))' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
