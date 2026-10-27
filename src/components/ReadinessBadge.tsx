import { HeartPulse } from 'lucide-react';
import { readinessLevel } from '@/lib/workoutStats';
import { cn } from '@/lib/utils';

const COPY = {
  high: { label: 'High readiness', hint: 'Good day to push strain', cls: 'border-[hsl(var(--chart-min))]/40 text-[hsl(var(--chart-min))]' },
  medium: { label: 'Normal capacity', hint: 'Train as planned', cls: 'border-primary/40 text-primary' },
  low: { label: 'Low recovery', hint: 'Prioritize warmups & extend rest', cls: 'border-destructive/40 text-destructive' },
};

/** Today's WHOOP recovery as a training-readiness hint; renders nothing without a score. */
export const ReadinessBadge = ({ score, compact = false }: { score: number | null | undefined; compact?: boolean }) => {
  const level = readinessLevel(score);
  if (!level) return null;
  const c = COPY[level];
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', c.cls, compact && 'py-1 text-xs')}>
      <HeartPulse className="h-4 w-4 shrink-0" />
      <span className="font-semibold">Recovery {Math.round(score as number)}%</span>
      <span className="text-muted-foreground">· {c.label}{compact ? '' : ` — ${c.hint}`}</span>
    </div>
  );
};
