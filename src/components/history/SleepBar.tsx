import { sleepBarPercent } from '@/lib/bodyHistory';
import { cn } from '@/lib/utils';

/**
 * A thin picture of a night's length beside its number. Decorative: the hours are written next to it, so it is hidden
 * from screen readers. It is a scale (0 to 12 hours), not a target, and carries no verdict.
 */
export const SleepBar = ({ hours, className }: { hours: number; className?: string }) => (
  <span aria-hidden="true" className={cn('block h-1.5 w-full overflow-hidden rounded-sm bg-muted', className)}>
    <span className="block h-full rounded-sm bg-chart-3" style={{ width: `${sleepBarPercent(hours)}%` }} />
  </span>
);
