import { useMemo } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DailyNote } from '@/hooks/useDailyNotes';
import { ChartViewControls, chartDateLabel, recentChartData, useChartView, ChartStyle } from './ChartViewControls';

type Series = { key: string; label: string; color: string; dashed?: boolean };
type Row = { date: string; [key: string]: string | number | null | undefined };

interface TrendChartProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  data: Row[];
  series: Series[];
  unit: string;
  defaultStyle?: ChartStyle;
  notesMap?: Map<string, DailyNote>;
  cap?: number;
  summary?: (rows: Row[]) => React.ReactNode;
  empty: string;
}

export const TrendChart = ({ id, title, icon, data, series, unit, defaultStyle, notesMap, cap, summary, empty }: TrendChartProps) => {
  const view = useChartView(id, defaultStyle);
  const shown = useMemo(() => recentChartData(data, view.range), [data, view.range]);
  const values = shown.flatMap(row => series.map(s => row[s.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max(cap ? 1 : 0.5, (max - min) * 0.1);
  const domain = view.style === 'bar'
    ? [Math.min(0, Math.floor(min - (min < 0 ? pad : 0))), Math.max(1, Math.ceil(max + pad))]
    : [Math.min(0, Math.floor(min - pad)), cap ? Math.min(cap, Math.ceil(max + pad)) : Math.ceil(max + pad)];
  const noteDots = shown.filter(row => notesMap?.has(row.date) && typeof row[series[0]?.key] === 'number');

  return (
    <Card className="shadow-md min-w-0">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">{icon}{title}</CardTitle>
          {summary?.(shown)}
        </div>
        <ChartViewControls {...view} />
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? <p className="text-muted-foreground text-center py-12">{empty}</p> : (
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={shown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={chartDateLabel} minTickGap={20} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <YAxis domain={domain} width={44} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const note = notesMap?.get(String(label));
                return <div className="bg-card border border-border rounded-md p-3 shadow-lg text-sm max-w-64">
                  <p className="font-semibold mb-1">{String(label)}</p>
                  {payload.filter(p => p.value != null).map(p => <p key={String(p.dataKey)} style={{ color: String(p.color ?? p.fill) }}>
                    {p.name}: {p.value} {unit}
                  </p>)}
                  {note && <div className="border-t mt-2 pt-2 text-muted-foreground">
                    <p className="font-medium">Note</p>
                    {note.tags?.length > 0 && <p>{note.tags.join(', ')}</p>}
                    {note.notes && <p className="break-words">{note.notes}</p>}
                  </div>}
                </div>;
              }} />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {series.map(s => view.style === 'bar' ?
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={40} radius={[3, 3, 0, 0]} /> :
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.dashed ? 2 : 3} strokeDasharray={s.dashed ? '8 5' : undefined} dot={s.dashed ? false : { r: 3, fill: s.color, stroke: 'hsl(var(--card))', strokeWidth: 1 }} activeDot={{ r: 5 }} connectNulls />
              )}
              {noteDots.map(row => <ReferenceDot key={row.date} x={row.date} y={Number(row[series[0].key])} r={5} fill="hsl(var(--destructive))" stroke="hsl(var(--card))" strokeWidth={2} />)}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};