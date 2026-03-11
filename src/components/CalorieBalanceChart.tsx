import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Line, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell, Legend } from 'recharts';
import { Scale } from 'lucide-react';

interface CalorieBalanceChartProps {
  data: { date: string; consumed: number; burned: number; balance: number }[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground mb-1">{entry.date}</p>
      <p className="text-sm" style={{ color: 'hsl(25, 95%, 53%)' }}>
        WHOOP Burned: <span className="font-semibold">{entry.burned} cal</span>
      </p>
      <p className="text-sm" style={{ color: 'hsl(221, 83%, 53%)' }}>
        Meals Consumed: <span className="font-semibold">{entry.consumed} cal</span>
      </p>
      <p className={`text-sm font-semibold ${entry.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        Balance: {entry.balance >= 0 ? '+' : ''}{entry.balance} cal
        {entry.balance >= 0 ? ' (deficit)' : ' (surplus)'}
      </p>
    </div>
  );
};

export const CalorieBalanceChart = ({ data }: CalorieBalanceChartProps) => {
  if (data.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scale className="h-5 w-5 text-primary" />
            Calorie Balance (WHOOP vs Meals)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No overlapping data yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scale className="h-5 w-5 text-primary" />
            Calorie Balance
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Bar: deficit (green) / surplus (red)
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
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
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    burned: 'WHOOP Burned',
                    consumed: 'Meals Consumed',
                    balance: 'Balance',
                  };
                  return labels[value] || value;
                }}
              />
              <Bar dataKey="balance" maxBarSize={40} radius={[4, 4, 0, 0]} opacity={0.6}>
                {data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.balance >= 0 ? 'hsl(142, 71%, 45%)' : 'hsl(0, 84%, 60%)'}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="burned"
                stroke="hsl(25, 95%, 53%)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(25, 95%, 53%)' }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="consumed"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(221, 83%, 53%)' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
