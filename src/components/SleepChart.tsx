import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Moon } from 'lucide-react';

interface SleepChartProps {
  data: { date: string; hours: number }[];
}

export const SleepChart = ({ data }: SleepChartProps) => {
  const validData = data.filter(d => d.hours > 0);
  const avgHours = validData.length > 0
    ? (validData.reduce((sum, d) => sum + d.hours, 0) / validData.length).toFixed(1)
    : 0;
  
  // Reverse for chronological order and take last 7
  const chartData = [...validData].reverse().slice(-7);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Moon className="h-5 w-5 text-primary" />
            Sleep (Last 7 Days)
          </CardTitle>
          {Number(avgHours) > 0 && (
            <span className="text-sm text-muted-foreground">
              Avg: <span className="font-semibold text-foreground">{avgHours}</span> hrs
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No sleep data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  domain={[0, 12]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number) => [`${value} hrs`, 'Sleep']}
                />
                <Bar
                  dataKey="hours"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
