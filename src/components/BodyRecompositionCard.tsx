import { useMemo, useRef } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Scale } from 'lucide-react';
import { ChartRangeControls, chartDateLabel, recentChartData, useChartRange } from './ChartViewControls';
import { ChartPdfButton } from './ChartPdfButton';
import { computeBodyRecomposition, RECOMP_LABELS } from '@/lib/crossMetricIntelligence';
import { cn } from '@/lib/utils';

type Entry = { date: string; value: number };

export const toneClass: Record<string, string> = {
  good: 'bg-chart-min/15 text-chart-min border-chart-min/30',
  info: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  warn: 'bg-primary/15 text-primary border-primary/30',
  bad: 'bg-chart-max/15 text-chart-max border-chart-max/30',
  muted: 'bg-muted text-muted-foreground border-border',
};

const fmt = (v: number | null, unit: string) => (v == null ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(1)} ${unit}`);

export const BodyRecompositionCard = ({ weight, waist }: { weight: Entry[]; waist: Entry[] }) => {
  const view = useChartRange('body_recomp');
  const cardRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => computeBodyRecomposition(weight, waist, Number(view.range)), [weight, waist, view.range]);
  const info = RECOMP_LABELS[result.status];

  const data = useMemo(() => {
    const map = new Map<string, { date: string; weight?: number; waist?: number }>();
    weight.forEach(w => map.set(w.date, { ...(map.get(w.date) || { date: w.date }), weight: w.value }));
    waist.forEach(w => map.set(w.date, { ...(map.get(w.date) || { date: w.date }), waist: w.value }));
    return recentChartData([...map.values()], view.range);
  }, [weight, waist, view.range]);

  const domain = (key: 'weight' | 'waist') => {
    const vals = data.map(d => d[key]).filter((v): v is number => typeof v === 'number');
    if (!vals.length) return [0, 1];
    const min = Math.min(...vals), max = Math.max(...vals), pad = Math.max(0.5, (max - min) * 0.1);
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  };

  return (
    <Card ref={cardRef} className="shadow-md min-w-0">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2"><Scale className="h-5 w-5 text-primary" />Body Recomposition Index</CardTitle>
          <div className="flex items-center gap-2"><ChartRangeControls {...view} />
          <ChartPdfButton targetRef={cardRef} title="Body Recomposition Index" subtitle={`Last ${view.range} days`}
            columns={[{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight (kg)' }, { key: 'waist', label: 'Waist (cm)' }]} rows={data} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('border', toneClass[info.tone])}>{info.label}</Badge>
          <span className="text-sm text-muted-foreground">Δ Weight <b className="text-foreground">{fmt(result.weightDelta, 'kg')}</b></span>
          <span className="text-sm text-muted-foreground">Δ Waist <b className="text-foreground">{fmt(result.waistDelta, 'cm')}</b></span>
        </div>
        <p className="text-sm text-muted-foreground">{info.message}</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No weight or waist entries in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickFormatter={chartDateLabel} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="w" domain={domain('weight')} tick={{ fontSize: 11 }} unit="kg" width={48} />
              <YAxis yAxisId="v" orientation="right" domain={domain('waist')} tick={{ fontSize: 11 }} unit="cm" width={48} />
              <Tooltip labelFormatter={chartDateLabel} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Legend />
              <Line yAxisId="w" type="monotone" dataKey="weight" name="Weight (kg)" stroke="hsl(var(--primary))" strokeWidth={3.5} dot={{ r: 4 }} connectNulls />
              <Line yAxisId="v" type="monotone" dataKey="waist" name="Waist (cm)" stroke="hsl(var(--chart-min))" strokeWidth={2.5} strokeDasharray="8 5" dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
