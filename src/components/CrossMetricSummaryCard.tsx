import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Brain, ArrowRight } from 'lucide-react';
import { useWeight } from '@/hooks/useWeight';
import { useWaist } from '@/hooks/useWaist';
import { useCrossMetricInsights } from '@/hooks/useCrossMetricInsights';
import { computeBodyRecomposition, RECOMP_LABELS, shiftDate } from '@/lib/crossMetricIntelligence';
import { toneClass } from './BodyRecompositionCard';
import { cn } from '@/lib/utils';
import { InsightEvidence } from '@/components/insights/InsightEvidence';

const formatDelta = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

interface CrossMetricSummaryCardProps {
  /** Called with an ISO date (YYYY-MM-DD) when someone picks a date inside an insight's evidence. */
  onSelectDate?: (isoDate: string) => void;
}

export const CrossMetricSummaryCard = ({ onSelectDate }: CrossMetricSummaryCardProps = {}) => {
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
          <span className="text-sm text-muted-foreground">30D: Δ Weight <b className="text-foreground"><AnimatedNumber value={recomp.weightDelta} format={formatDelta} suffix=" kg" fallback="--" /></b> · Δ Waist <b className="text-foreground"><AnimatedNumber value={recomp.waistDelta} format={formatDelta} suffix=" cm" fallback="--" /></b></span>
        </div>
        {insights.length ? insights.map(i => (
          <div key={i.id} className="min-w-0 rounded-md border p-3" data-testid={`cross-metric-${i.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h4 className="text-sm font-semibold">{i.title}</h4>
              {i.value && (
                <p className="text-sm font-bold tabular-nums text-foreground">
                  {i.value}
                  {i.valueLabel && <span className="ml-1 text-xs font-normal text-muted-foreground">{i.valueLabel} difference</span>}
                </p>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{i.description}</p>
            <InsightEvidence title={i.title} evidence={i.evidence} staleSources={i.staleSources} onSelectDate={onSelectDate} />
          </div>
        )) : <p className="text-sm text-muted-foreground">Insights appear after at least 3 days on each side of your recovery and sleep cutoffs in the last 30 days.</p>}
        <Button asChild variant="ghost" size="sm" className="px-0 text-primary"><Link to="/reports">Full breakdown in Reports <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
      </CardContent>
    </Card>
  );
};
