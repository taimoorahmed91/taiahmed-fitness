import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceDot } from 'recharts';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { Badge } from '@/components/ui/badge';

interface CalorieChartProps {
  data: { date: string; fullDate: string; calories: number }[];
  notesMap?: Map<string, DailyNote>;
}

const CustomTooltip = ({ active, payload, notesMap }: any) => {
  if (!active || !payload || !payload.length) return null;

  const fullDate = payload[0]?.payload?.fullDate;
  const displayDate = payload[0]?.payload?.date;
  const note = notesMap?.get(fullDate);

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground mb-1">{displayDate} ({fullDate})</p>
      <p className="text-sm text-muted-foreground">
        Calories: <span className="font-semibold text-foreground">{payload[0].value}</span>
      </p>
      {note && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center gap-1 text-destructive text-xs font-medium mb-1">
            <AlertCircle className="h-3 w-3" />
            Note
          </div>
          <div className="flex flex-wrap gap-1 mb-1">
            {note.tags.map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs py-0">
                {tag}
              </Badge>
            ))}
          </div>
          {note.notes && (
            <p className="text-xs text-muted-foreground">{note.notes}</p>
          )}
        </div>
      )}
    </div>
  );
};

export const CalorieChart = ({ data, notesMap }: CalorieChartProps) => {
  const avgCalories = Math.round(
    data.reduce((sum, d) => sum + d.calories, 0) / data.filter((d) => d.calories > 0).length || 0
  );

  // Find dates with notes to render indicators (use fullDate for matching)
  const datesWithNotes = notesMap
    ? data.filter((d) => notesMap.has(d.fullDate))
    : [];

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Weekly Calories
          </CardTitle>
          {avgCalories > 0 && (
            <span className="text-sm text-muted-foreground">
              Avg: <span className="font-semibold text-foreground">{avgCalories}</span> cal/day
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
              <Tooltip content={<CustomTooltip notesMap={notesMap} />} />
              <Bar
                dataKey="calories"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
              {/* Note indicators */}
              {datesWithNotes.map((item) => (
                <ReferenceDot
                  key={item.fullDate}
                  x={item.date}
                  y={item.calories}
                  r={6}
                  fill="hsl(var(--destructive))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
