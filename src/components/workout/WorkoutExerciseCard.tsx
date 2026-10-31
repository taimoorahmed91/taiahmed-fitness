import { memo } from 'react';
import { CheckCircle2, ChevronDown, Plus, StickyNote, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  extractWeightFromExerciseName, fieldInputId, fieldOrder, lastForSet, MAX_SETS, nextInOrder, planUseLastForSet,
  planUseLastWeights, setKeyFor, timeKeyFor, weightKeyFor,
  type AnyExerciseKey, type ExerciseSets, type ExerciseTimestamps, type SetKey,
} from '@/lib/workoutSession';
import { SetColumnHeader, WorkoutSetRow } from './WorkoutSetRow';

interface WorkoutExerciseCardProps {
  /** ORIGINAL exercise index. Every piece of data below is keyed by it, never by display position. */
  index: number;
  exercise: string;
  isExtra: boolean;
  seq?: number;
  previousSeq?: number;
  sets?: ExerciseSets;
  timestamps?: ExerciseTimestamps;
  setCount: number;
  note: string;
  previousSets?: ExerciseSets;
  previousNote?: string;
  isPR: boolean;
  complete: boolean;
  expanded: boolean;
  // Handlers are stable and take the index, so one edited exercise does not re-render the others.
  onToggle: (index: number, open: boolean) => void;
  onUpdateSet: (index: number, key: AnyExerciseKey, value: string) => void;
  onUseLastSet: (index: number, key: SetKey) => void;
  onUseLastWeights: (index: number) => void;
  onAddSet: (index: number) => void;
  onNoteChange: (index: number, value: string) => void;
  onCarryNote: (index: number) => void;
  onCopyNote: (index: number) => void;
  onClearNote: (index: number) => void;
}

const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', className)}>{children}</span>
);

export const WorkoutExerciseCard = memo((props: WorkoutExerciseCardProps) => {
  const {
    index, exercise, isExtra, seq, previousSeq, sets, timestamps, setCount, note, previousSets, previousNote,
    isPR, complete, expanded, onToggle, onUpdateSet, onUseLastSet, onUseLastWeights, onAddSet,
    onNoteChange, onCarryNote, onCopyNote, onClearNote,
  } = props;

  const setsObj = sets as unknown as Record<string, string | undefined> | undefined;
  const tsObj = timestamps as unknown as Record<string, string | undefined> | undefined;
  const defaultWeight = extractWeightFromExerciseName(exercise);
  const setNums = Array.from({ length: setCount }, (_, i) => i + 1);
  const order = fieldOrder(setCount);
  const hasHistory = !!previousSets;
  const hintFor = (key: AnyExerciseKey) => (nextInOrder(order, key) ? 'next' : 'done') as 'next' | 'done';
  const advance = (key: AnyExerciseKey, input: HTMLInputElement) => {
    const next = nextInOrder(order, key);
    if (next) document.getElementById(fieldInputId('wk', index, next))?.focus();
    else input.blur(); // last field: close the keyboard
  };
  const canFillWeights = planUseLastWeights(sets, previousSets, setCount).length > 0;

  // One row. `key` is the rep key ('warmup' | 'set1' ...); its weight key is derived.
  const renderRow = (key: SetKey, setLabel: string, shortLabel: string) => {
    const wKey = weightKeyFor(key);
    const last = lastForSet(previousSets, key);
    const reps = setsObj?.[key] || '';
    const weight = setsObj?.[wKey] || '';
    const plan = planUseLastForSet(sets, previousSets, key);
    return (
      <WorkoutSetRow
        key={key}
        idBase={`wk-${index}-${key}`}
        exerciseName={exercise}
        setLabel={setLabel}
        shortLabel={shortLabel}
        reps={reps}
        weight={weight}
        repsPlaceholder={last.reps || undefined}
        weightPlaceholder={last.weight || defaultWeight || undefined}
        repsHighlight={!!reps}
        weightHighlight={!!weight}
        loggedAt={tsObj?.[timeKeyFor(key)]}
        last={last}
        useLastDone={plan.length === 0}
        onUseLast={() => onUseLastSet(index, key)}
        onRepsChange={(v) => onUpdateSet(index, key, v)}
        onWeightChange={(v) => onUpdateSet(index, wKey, v)}
        enterHints={{ reps: hintFor(key), weight: hintFor(wKey) }}
        onEnter={(field, input) => advance(field === 'reps' ? key : wKey, input)}
      />
    );
  };

  return (
    <Collapsible open={expanded} onOpenChange={(open) => onToggle(index, open)}>
      <div data-workout-exercise={index} className={cn('rounded-lg border transition-colors', complete ? 'border-primary/30 bg-primary/10' : 'bg-card')}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-12 w-full justify-between gap-2 whitespace-normal rounded-lg p-3 text-left text-base font-normal focus-visible:ring-inset focus-visible:ring-offset-0"
          >
            <span className="flex min-w-0 items-center gap-2">
              {complete && (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="sr-only">Has logged sets.</span>
                </>
              )}
              <span className={cn('min-w-0 break-words font-medium', complete && 'text-primary')}>
                {seq !== undefined ? (
                  <span className="mr-1 text-xs text-muted-foreground">{seq}.</span>
                ) : previousSeq !== undefined ? (
                  <span className="mr-1 text-xs italic text-muted-foreground">prev #{previousSeq}</span>
                ) : null}
                {exercise}
                {isExtra && <Badge className="ml-2 align-middle font-medium uppercase tracking-wide text-muted-foreground">added</Badge>}
                {isPR && (
                  <Badge className="ml-2 bg-primary/15 uppercase tracking-wide text-primary">
                    <Trophy className="!size-3" aria-hidden="true" /> PR
                  </Badge>
                )}
              </span>
            </span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} aria-hidden="true" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 px-3 pb-3 pt-1">
            <div role="group" aria-label={`${exercise} sets`} className="space-y-2">
              <SetColumnHeader withUse />
              {renderRow('warmup', 'Warm-up', 'Warm')}
              {setNums.map((n) => renderRow(setKeyFor(n), `Set ${n}`, String(n)))}
            </div>

            <div className="grid gap-2 pt-1">
              {canFillWeights && (
                <Button type="button" variant="outline" size="touch" className="w-full" aria-label={`Use last weights for ${exercise}`} onClick={() => onUseLastWeights(index)}>
                  Use last weights
                </Button>
              )}
              {setCount < MAX_SETS && (
                <Button type="button" variant="outline" size="touch" className="w-full border-dashed" aria-label={`Add set (${setCount + 1} of ${MAX_SETS}) for ${exercise}`} onClick={() => onAddSet(index)}>
                  <Plus aria-hidden="true" />
                  Add set ({setCount + 1} of {MAX_SETS})
                </Button>
              )}
            </div>
            {!hasHistory && <p className="text-xs text-muted-foreground">No previous session for this workout yet, so there is no "last" to show.</p>}

            <div className="space-y-2 pt-1">
              <Label htmlFor={`wk-note-${index}`} className="flex items-center gap-1 text-xs font-medium">
                <StickyNote className="h-3 w-3" aria-hidden="true" />
                Notes<span className="sr-only"> for {exercise}</span>
              </Label>
              <Textarea
                id={`wk-note-${index}`}
                placeholder={previousNote || 'Form cues, how it felt, adjustments...'}
                value={note}
                onChange={(e) => onNoteChange(index, e.target.value)}
                rows={2}
                maxLength={300}
                className="min-h-[64px] resize-none text-base md:text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" size="touch" variant="outline" className="px-2 text-xs" disabled={!previousNote} aria-label={`Carry forward previous note for ${exercise}`} onClick={() => onCarryNote(index)}>
                  Carry forward
                </Button>
                <Button type="button" size="touch" variant="outline" className="px-2 text-xs" disabled={!previousNote} aria-label={`Copy previous note for ${exercise}`} onClick={() => onCopyNote(index)}>
                  Copy previous
                </Button>
                <ConfirmDeleteButton
                  type="button"
                  size="touch"
                  variant="ghost"
                  className="px-2 text-xs text-muted-foreground"
                  confirmationTitle="Clear exercise notes?"
                  confirmationDescription={`Clear the current notes and carried-forward suggestion for “${exercise}”? Previously saved workouts will stay unchanged.`}
                  aria-label={`Clear notes for ${exercise}`}
                  confirmLabel="Yes, clear notes"
                  onConfirm={() => onClearNote(index)}
                >
                  Clear
                </ConfirmDeleteButton>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
});
WorkoutExerciseCard.displayName = 'WorkoutExerciseCard';
