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

/**
 * Layout for the small stat tiles under an overview headline. The overview card sits in a half-width column from
 * 768px up (about 340px wide on a tablet), where four tiles cannot fit in one row, so tiles stay in a 2x2 grid
 * and only go four-across on wide desktops where the card is wide enough.
 */
export const STAT_GRID_CLASS = 'grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0';

/** One labelled number. The label may wrap between words; the value never splits from its arrow or unit. */
export const StatTile = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="mt-1 text-sm font-semibold tabular-nums">{children}</div>
  </div>
);

export const DeltaTile = ({ label, value, unit, decimals = 1 }: DeltaItem & { unit: string; decimals?: number }) => {
  const Icon = value === null || value === 0 ? Minus : value < 0 ? TrendingDown : TrendingUp;
  return (
    <StatTile label={label}>
      <div className={cn('flex items-center gap-1 whitespace-nowrap', toneFor(value))}>
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(decimals)} ${unit}`}
      </div>
    </StatTile>
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
  /** Draws a thin ruler of tick marks under the headline number (for measurements). Decorative only. */
  ruler?: boolean;
}

export const MetricOverviewCard = ({ title, latestLabel, latest, unit, totalEntries, deltas, emptyText, extra, ruler }: Props) => (
  <Card className="h-full" titleSize="chart">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Activity aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {latest ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{latestLabel}</p>
              <p className="text-4xl font-bold tabular-nums tracking-tight">
                {latest} <span className="text-lg font-medium text-muted-foreground">{unit}</span>
              </p>
              {ruler && (
                <span
                  aria-hidden="true"
                  className="mt-1.5 block h-2 w-full max-w-44 border-b border-foreground/40 [background-image:repeating-linear-gradient(90deg,hsl(var(--foreground)/0.4)_0,hsl(var(--foreground)/0.4)_1px,transparent_1px,transparent_8px)]"
                />
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total entries</p>
              <p className="text-xl font-semibold">{totalEntries}</p>
            </div>
          </div>
          {extra}
          <div className={STAT_GRID_CLASS}>
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
