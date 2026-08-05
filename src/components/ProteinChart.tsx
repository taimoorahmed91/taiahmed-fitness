import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Drumstick } from 'lucide-react';

interface ProteinChartProps {
  data: { date: string; fullDate: string; protein: number }[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const fullDate = payload[0]?.payload?.fullDate;
  const displayDate = payload[0]?.payload?.date;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground mb-1">{displayDate} ({fullDate})</p>
      <p className="text-sm text-muted-foreground">
        Protein: <span className="font-semibold text-foreground">{payload[0].value} g</span>
      </p>
    </div>
  );
};

export const ProteinChart = ({ data }: ProteinChartProps) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const pastDays = data.filter((d) => d.fullDate !== todayStr);
  const daysWithData = pastDays.filter((d) => d.protein > 0);
  const avgProtein = daysWithData.length
    ? Math.round(pastDays.reduce((sum, d) => sum + d.protein, 0) / daysWithData.length)
    : 0;

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Drumstick className="h-5 w-5 text-primary" />
            Weekly Protein
          </CardTitle>
          {avgProtein > 0 && (
            <span className="text-sm text-muted-foreground">
              Avg: <span className="font-semibold text-foreground">{avgProtein}</span> g/day
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
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
              <Bar dataKey="protein" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
