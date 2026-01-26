import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceDot } from 'recharts';
import { Moon, AlertCircle } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { Badge } from '@/components/ui/badge';

interface SleepChartProps {
  data: { date: string; hours: number }[];
  notesMap?: Map<string, DailyNote>;
}

const CustomTooltip = ({ active, payload, label, notesMap }: any) => {
  if (!active || !payload || !payload.length) return null;

  const note = notesMap?.get(label);

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p className="text-sm text-muted-foreground">
        Sleep: <span className="font-semibold text-foreground">{payload[0].value} hrs</span>
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

export const SleepChart = ({ data, notesMap }: SleepChartProps) => {
  const validData = data.filter(d => d.hours > 0);
  const avgHours = validData.length > 0
    ? (validData.reduce((sum, d) => sum + d.hours, 0) / validData.length).toFixed(1)
    : 0;
  
  // Reverse for chronological order and take last 7
  const chartData = [...validData].reverse().slice(-7);

  // Find dates with notes
  const datesWithNotes = notesMap
    ? chartData.filter((d) => notesMap.has(d.date))
    : [];

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
              <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
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
                <Tooltip content={<CustomTooltip notesMap={notesMap} />} />
                <Bar
                  dataKey="hours"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
                {/* Note indicators */}
                {datesWithNotes.map((item) => (
                  <ReferenceDot
                    key={item.date}
                    x={item.date}
                    y={item.hours}
                    r={6}
                    fill="hsl(var(--destructive))"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
