import { memo, useEffect } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useWallClock } from '@/hooks/useWallClock';
import { cn } from '@/lib/utils';
import { elapsedSeconds, formatClock, restProgressPercent, restRemaining, type RestState } from '@/lib/workoutTiming';

/**
 * Clock faces. Each one owns its own once-a-second state, so a tick re-renders only
 * the digits. The workout screen, the exercise cards and the saved workout never
 * re-render or write to storage because a second went by.
 */

export const ElapsedClock = memo(({ startMs, className }: { startMs: number; className?: string }) => {
  const now = useWallClock(true);
  return (
    <span role="timer" aria-label="Workout time" className={cn('font-mono font-bold tabular-nums', className)}>
      {formatClock(elapsedSeconds(startMs, now))}
    </span>
  );
});
ElapsedClock.displayName = 'ElapsedClock';

const RunningRest = ({ rest, onElapsed, onSkip }: { rest: RestState; onElapsed: (startedAt: number) => void; onSkip: () => void }) => {
  const now = useWallClock(true);
  const remaining = restRemaining(rest.startedAt, rest.total, now);
  const label = rest.type === 'set' ? 'Set rest' : 'Exercise rest';
  const finished = remaining <= 0;

  // Tell the screen once, when this timer reaches zero. The screen decides what to show and announce.
  useEffect(() => {
    if (finished) onElapsed(rest.startedAt);
  }, [finished, rest.startedAt, onElapsed]);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <div className="flex items-center gap-3">
        <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p role="timer" aria-label={`${label} remaining`} className="font-mono text-2xl font-bold leading-none tabular-nums text-primary">
            {formatClock(remaining)}
          </p>
        </div>
        <Button type="button" variant="outline" size="touch" onClick={onSkip} aria-label="Skip rest">
          Skip
        </Button>
      </div>
      <Progress value={restProgressPercent(rest.total, remaining)} className="mt-2 h-1.5" aria-hidden="true" />
    </div>
  );
};

const RestOver = ({ onDismiss }: { onDismiss: () => void }) => (
  <div className="flex items-center gap-3 rounded-lg bg-primary px-3 py-2 text-primary-foreground motion-safe:animate-in motion-safe:fade-in-0">
    <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="font-semibold leading-tight">Rest over</p>
      <p className="text-xs leading-tight">Ready for your next set</p>
    </div>
    <Button type="button" variant="secondary" size="touch" onClick={onDismiss}>
      Dismiss
    </Button>
  </div>
);

/**
 * Rest timer. While running it ticks on its own. When it ends the screen swaps it for a
 * clear "Rest over" bar that stays until dismissed, so it is seen even with sound off.
 * The spoken announcement lives in the screen's live region, not here (no double speech).
 */
export const RestTimerPanel = memo(
  ({ rest, onElapsed, onDismiss }: { rest: RestState; onElapsed: (startedAt: number) => void; onDismiss: () => void }) =>
    rest.status === 'over' ? (
      <RestOver onDismiss={onDismiss} />
    ) : (
      <RunningRest rest={rest} onElapsed={onElapsed} onSkip={onDismiss} />
    ),
);
RestTimerPanel.displayName = 'RestTimerPanel';
