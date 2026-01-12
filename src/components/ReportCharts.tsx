import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

interface ReportChartsProps {
  data: Array<{
    date: string;
    calories: number;
    workout: number;
    sleep: number;
  }>;
}

export const ReportCharts = ({ data }: ReportChartsProps) => {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Calories & Workout Combined */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Calories & Workout Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <YAxis 
                yAxisId="left" 
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar 
                yAxisId="left" 
                dataKey="calories" 
                fill="hsl(var(--primary))" 
                name="Calories"
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                yAxisId="right" 
                dataKey="workout" 
                fill="hsl(var(--chart-2))" 
                name="Workout (min)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sleep Trend */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Sleep Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <YAxis 
                domain={[0, 12]}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="sleep" 
                stroke="hsl(var(--chart-4))" 
                strokeWidth={2}
                name="Sleep (hours)"
                dot={{ fill: 'hsl(var(--chart-4))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
