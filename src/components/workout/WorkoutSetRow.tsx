import type { KeyboardEvent } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { describeLast, formatLast, type LastSetValues } from '@/lib/workoutSession';

/**
 * Column sizes shared by the header row and every set row. Fixed small columns plus
 * flexible inputs keep six sets on one line each at 320px, with room for "102.5".
 */
export const SET_GRID = 'grid items-center gap-x-1.5 gap-y-0.5';
export const SET_COLUMNS = 'grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1.5fr)]';
export const SET_COLUMNS_WITH_USE = 'grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1.5fr)_4rem]';

export type EnterHint = 'next' | 'done';

interface WorkoutSetRowProps {
  /** Unique id prefix. Inputs get `${idBase}-reps` and `${idBase}-weight`. */
  idBase: string;
  exerciseName: string;
  /** Spoken name: "Warm-up" or "Set 2". */
  setLabel: string;
  /** Short visible name that fits a 44px column: "Warm" or "2". */
  shortLabel: string;
  reps: string;
  weight: string;
  onRepsChange: (value: string) => void;
  onWeightChange: (value: string) => void;
  repsPlaceholder?: string;
  weightPlaceholder?: string;
  repsHighlight?: boolean;
  weightHighlight?: boolean;
  /** Time this set was logged, e.g. "09:41". */
  loggedAt?: string;
  /** Previous session's values for this set. Shown as visible "last: ..." text. */
  last?: LastSetValues;
  /** Shows the Use button when given. */
  onUseLast?: () => void;
  /** True when there is nothing left to fill (button stays focusable, does nothing). */
  useLastDone?: boolean;
  enterHints: { reps: EnterHint; weight: EnterHint };
  /** Enter pressed in a field. The parent decides which field comes next. */
  onEnter: (field: 'reps' | 'weight', input: HTMLInputElement) => void;
  decimalReps?: boolean;
  /** Longest reps value. Live logging stops at 3 digits; the editor allows decimals from saved notes. */
  repsMaxLength?: number;
}

const filled = 'border-chart-min focus-visible:ring-chart-min';

/** One set on one row: label, reps, weight, optional Use-last, then a small context line. */
export const WorkoutSetRow = (
  {
    idBase, exerciseName, setLabel, shortLabel, reps, weight, onRepsChange, onWeightChange,
    repsPlaceholder, weightPlaceholder, repsHighlight, weightHighlight, loggedAt, last, onUseLast,
    useLastDone, enterHints, onEnter, decimalReps, repsMaxLength = 3,
  }: WorkoutSetRowProps) => {
    const lastText = last ? formatLast(last) : '';
    const hasUse = !!onUseLast;
    const handleKey = (field: 'reps' | 'weight') => (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
      e.preventDefault();
      onEnter(field, e.currentTarget);
    };

    return (
      <div role="group" aria-label={`${exerciseName}, ${setLabel}`} className={cn(SET_GRID, hasUse ? SET_COLUMNS_WITH_USE : SET_COLUMNS)}>
        <span className="text-xs font-medium text-muted-foreground" aria-hidden="true">{shortLabel}</span>
        <Input
          id={`${idBase}-reps`}
          data-workout-field
          aria-label={`${exerciseName}, ${setLabel}, reps`}
          type="text"
          inputMode={decimalReps ? 'decimal' : 'numeric'}
          enterKeyHint={enterHints.reps}
          autoComplete="off"
          placeholder={repsPlaceholder ?? 'reps'}
          value={reps}
          onChange={(e) => onRepsChange(e.target.value)}
          onKeyDown={handleKey('reps')}
          maxLength={repsMaxLength}
          className={cn('h-11 px-1 text-center tabular-nums', repsHighlight && filled)}
        />
        <Input
          id={`${idBase}-weight`}
          data-workout-field
          aria-label={`${exerciseName}, ${setLabel}, weight in kilograms`}
          type="text"
          inputMode="decimal"
          enterKeyHint={enterHints.weight}
          autoComplete="off"
          placeholder={weightPlaceholder ?? 'kg'}
          value={weight}
          onChange={(e) => onWeightChange(e.target.value)}
          onKeyDown={handleKey('weight')}
          maxLength={6}
          className={cn('h-11 px-1 text-center tabular-nums', weightHighlight && filled)}
        />
        {hasUse &&
          (lastText ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full px-1"
              aria-disabled={useLastDone ? true : undefined}
              aria-label={
                useLastDone
                  ? `${exerciseName}, ${setLabel}: already filled, last was ${describeLast(last!)}`
                  : `Use last for ${exerciseName}, ${setLabel}: ${describeLast(last!)}`
              }
              onClick={onUseLast}
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Use
            </Button>
          ) : (
            <span aria-hidden="true" />
          ))}
        {(lastText || loggedAt) && (
          <div className="col-start-2 col-end-[-1] flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
            {lastText ? <span className="min-w-0 truncate">last: {lastText}</span> : <span />}
            {loggedAt && (
              <span className="inline-flex shrink-0 items-center gap-1 text-primary">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">Logged at </span>
                {loggedAt}
              </span>
            )}
          </div>
        )}
      </div>
    );
};

/** Visible column titles above the set rows. Hidden from screen readers: every input has its own full label. */
export const SetColumnHeader = ({ withUse }: { withUse: boolean }) => (
  <div aria-hidden="true" className={cn(SET_GRID, 'text-xs font-medium text-muted-foreground', withUse ? SET_COLUMNS_WITH_USE : SET_COLUMNS)}>
    <span>Set</span>
    <span className="text-center">Reps</span>
    <span className="text-center">Weight (kg)</span>
    {withUse && <span />}
  </div>
);
