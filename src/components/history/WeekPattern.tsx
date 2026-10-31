import { cn } from '@/lib/utils';
import { WEEKDAY_NAMES, describeTrainedDays } from '@/lib/workoutHistory';

/**
 * Seven small squares, Monday to Sunday: filled where a workout happened, hollow where none did.
 * The shape (filled vs hollow) carries the meaning, not the colour, and screen readers get the same fact as words.
 * Weekday initials sit under the squares.
 */
const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const WeekPattern = ({ days, className }: { days: readonly boolean[]; className?: string }) => {
  const spoken = describeTrainedDays(days);
  return (
    <span className={cn('block', className)}>
      <span className="sr-only">{spoken ? `Trained on ${spoken}.` : 'No training days recorded.'}</span>
      <span aria-hidden="true" className="flex items-start gap-1">
        {days.map((trained, i) => (
          <span key={WEEKDAY_NAMES[i]} className="flex w-4 flex-col items-center gap-1">
            <span className={cn('h-3.5 w-3.5 rounded-[3px] border', trained ? 'border-chart-2 bg-chart-2' : 'border-muted-foreground/50 bg-card')} />
            <span className="text-xs leading-none text-muted-foreground">{INITIALS[i]}</span>
          </span>
        ))}
      </span>
    </span>
  );
};
