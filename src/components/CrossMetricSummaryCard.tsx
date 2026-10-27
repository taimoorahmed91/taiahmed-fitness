import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, ArrowRight } from 'lucide-react';
import { useWeight } from '@/hooks/useWeight';
import { useWaist } from '@/hooks/useWaist';
import { useCrossMetricInsights } from '@/hooks/useCrossMetricInsights';
import { computeBodyRecomposition, RECOMP_LABELS, shiftDate } from '@/lib/crossMetricIntelligence';
import { toneClass } from './BodyRecompositionCard';
import { cn } from '@/lib/utils';

const fmt = (v: number | null, unit: string) => (v == null ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(1)} ${unit}`);

export const CrossMetricSummaryCard = () => {
  const { entries: weight } = useWeight();
  const { entries: waist } = useWaist();
  const since = shiftDate(new Date().toISOString().slice(0, 10), -29);
  const insights = useCrossMetricInsights(since);
  const recomp = useMemo(() => computeBodyRecomposition(
    weight.map(w => ({ date: w.date, value: w.weight })),
    waist.map(w => ({ date: w.date, value: w.waist })), 30), [weight, waist]);
  const info = RECOMP_LABELS[recomp.status];

  return (
    <Card className="shadow-md min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />Cross-Metric Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('border', toneClass[info.tone])}>{info.label}</Badge>
          <span className="text-sm text-muted-foreground">30D: Δ Weight <b className="text-foreground">{fmt(recomp.weightDelta, 'kg')}</b> · Δ Waist <b className="text-foreground">{fmt(recomp.waistDelta, 'cm')}</b></span>
        </div>
        {insights.length ? insights.map(i => (
          <div key={i.title} className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div><p className="text-sm font-semibold">{i.title}</p><p className="text-xs text-muted-foreground line-clamp-2">{i.description}</p></div>
            {i.value && <span className={cn('text-sm font-bold', i.correlation === 'positive' ? 'text-chart-min' : i.correlation === 'negative' ? 'text-chart-max' : 'text-muted-foreground')}>{i.value}</span>}
          </div>
        )) : <p className="text-sm text-muted-foreground">Insights appear after at least 3 days on each side of your recovery and sleep cutoffs in the last 30 days.</p>}
        <Button asChild variant="ghost" size="sm" className="px-0 text-primary"><Link to="/reports">Full breakdown in Reports <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
      </CardContent>
    </Card>
  );
};
