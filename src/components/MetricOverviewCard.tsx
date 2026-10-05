import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingDown, TrendingUp, Minus, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DeltaItem {
  label: string;
  value: number | null;
}

/** Tone for a change where lower is better (weight, waist). */
const toneFor = (v: number | null) =>
  v === null || v === 0 ? 'text-muted-foreground' : v < 0 ? 'text-chart-min' : 'text-chart-max';

export const DeltaTile = ({ label, value, unit, decimals = 1 }: DeltaItem & { unit: string; decimals?: number }) => {
  const Icon = value === null || value === 0 ? Minus : value < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn('mt-1 flex items-center gap-1 text-sm font-semibold', toneFor(value))}>
        <Icon className="h-3.5 w-3.5" />
        {value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(decimals)} ${unit}`}
      </div>
    </div>
  );
};

interface Props {
  title: string;
  latestLabel: string;
  latest: number | undefined;
  unit: string;
  totalEntries: number;
  deltas: DeltaItem[];
  emptyText: string;
  /** Optional goal/cadence panel rendered under the headline. */
  extra?: ReactNode;
}

export const MetricOverviewCard = ({ title, latestLabel, latest, unit, totalEntries, deltas, emptyText, extra }: Props) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {latest ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{latestLabel}</p>
              <p className="text-4xl font-bold tracking-tight">
                {latest} <span className="text-lg font-medium text-muted-foreground">{unit}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total entries</p>
              <p className="text-xl font-semibold">{totalEntries}</p>
            </div>
          </div>
          {extra}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {deltas.map((d) => (
              <DeltaTile key={d.label} {...d} unit={unit} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">{emptyText}</p>
      )}
    </CardContent>
  </Card>
);

export const GoalPanel = ({ label, detail, progress }: { label: string; detail: string; progress?: number }) => (
  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">{detail}</span>
    </div>
    {progress !== undefined && <Progress value={Math.max(0, Math.min(100, progress))} className="mt-2 h-2" />}
  </div>
);
