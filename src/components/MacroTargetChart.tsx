import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MacroTargetChartProps {
  data: { date: string; actual: number; target: number | null }[];
  title: string;
  unit: string;
  color: string;
}

export const MacroTargetChart = ({ data, title, unit, color }: MacroTargetChartProps) => {
  const yDomain = useMemo(() => {
    const values = data
      .flatMap((d) => [d.actual, d.target])
      .filter((v): v is number => v != null);

    if (values.length === 0) return [0, 1];

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (max === min) {
      max += 1;
      min = Math.max(0, min - 1);
    }

    const range = max - min;
    const pad = Math.max(1, range * 0.1);

    const yMin = Math.max(0, Math.floor(min - pad));
    const yMax = Math.ceil(max + pad);

    return [yMin, yMax];
  }, [data]);

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
                  name === 'actual' ? 'Actual' : 'Target',
                ]}
              />
              <Legend formatter={(value) => (value === 'actual' ? 'Actual' : 'Target')} />
              <Line
                type="monotone"
                dataKey="actual"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="actual"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="target"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="target"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
