import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Clock } from 'lucide-react';
import { ChartRangeControls, useChartRange } from './ChartViewControls';

interface MealTimeChartProps {
  data7: { name: string; calories: number; count: number }[];
  data14: { name: string; calories: number; count: number }[];
  data30: { name: string; calories: number; count: number }[];
}

const COLORS: Record<string, string> = {
  Overnight: 'hsl(var(--chart-5))',
  Morning: 'hsl(var(--primary))',
  Midday: 'hsl(var(--chart-min))',
  Afternoon: 'hsl(var(--chart-2))',
  Evening: 'hsl(var(--chart-max))',
  'Late night': 'hsl(var(--chart-actual))',
};

export const MealTimeChart = ({ data7, data14, data30 }: MealTimeChartProps) => {
  const { range, setRange } = useChartRange('meal_time');
  const data = range === '7' ? data7 : range === '14' ? data14 : data30;
  const filteredData = data.filter((d) => d.calories > 0);
  const total = filteredData.reduce((sum, d) => sum + d.calories, 0);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-primary" />
            Calories by Time of Day
          </CardTitle>
          <ChartRangeControls range={range} setRange={setRange} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[190px] w-full">
          {filteredData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No meals in the last {range} days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={filteredData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={76}
                  paddingAngle={4}
                  dataKey="calories"
                  nameKey="name"
                >
                  {filteredData.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [`${value.toLocaleString()} cal · ${Math.round(value / total * 100)}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        {total > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2" aria-label="Calories by time of day distribution">
            {data.map((entry) => (
              <div key={entry.name} className="flex min-w-0 items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[entry.name] }} aria-hidden="true" />
                <span className="min-w-0 truncate text-muted-foreground">{entry.name}</span>
                <span className="ml-auto tabular-nums font-semibold text-foreground">{Math.round(entry.calories / total * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
