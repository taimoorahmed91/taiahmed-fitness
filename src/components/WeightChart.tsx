import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceDot } from 'recharts';
import { Scale, AlertCircle } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';
import { Badge } from '@/components/ui/badge';

interface WeightChartProps {
  data: { date: string; weight: number }[];
  notesMap?: Map<string, DailyNote>;
}

const CustomTooltip = ({ active, payload, label, notesMap }: any) => {
  if (!active || !payload || !payload.length) return null;

  const note = notesMap?.get(label);

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p className="text-sm text-muted-foreground">
        Weight: <span className="font-semibold text-foreground">{payload[0].value} kg</span>
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

export const WeightChart = ({ data, notesMap }: WeightChartProps) => {
  const validData = data.filter(d => d.weight > 0);
  const latestWeight = validData[0]?.weight;
  
  // Reverse for chronological order in chart
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
            <Scale className="h-5 w-5 text-primary" />
            Weight Trend
          </CardTitle>
          {latestWeight && (
            <span className="text-sm text-muted-foreground">
              Latest: <span className="font-semibold text-foreground">{latestWeight}</span> kg
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No weight data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
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
                  domain={['dataMin - 1', 'dataMax + 1']}
                />
                <Tooltip content={<CustomTooltip notesMap={notesMap} />} />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                {/* Note indicators */}
                {datesWithNotes.map((item) => (
                  <ReferenceDot
                    key={item.date}
                    x={item.date}
                    y={item.weight}
                    r={6}
                    fill="hsl(var(--destructive))"
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
