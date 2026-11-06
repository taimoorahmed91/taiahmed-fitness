import { ChartLine, StickyNote } from 'lucide-react';
import type { ParsedExercise, ParsedWorkoutNotes } from '@/lib/workoutNotes';
import type { ExerciseHistoryTarget } from '@/lib/workoutExerciseHistory';
import { cn } from '@/lib/utils';

/**
 * The opened part of a workout row, laid out in clear sections:
 *  - "Exercises": each one as a soft block with its number, its name and its sets as a small Set / Reps / Weight table.
 *    Set times sit quietly in their own column, only when the workout stored them.
 *  - "Other notes": anything the notes parser did not understand, as plain text, so nothing is lost.
 */
const kg = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg`;

const SectionLabel = ({ children, count }: { children: string; count?: number }) => (
  <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    {children}
    {count !== undefined && <span className="font-normal normal-case tracking-normal tabular-nums">({count})</span>}
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
  </p>
);

interface HistoryLink {
  target: ExerciseHistoryTarget;
  onOpen: (target: ExerciseHistoryTarget, trigger: HTMLButtonElement) => void;
}

/** `tallHeader`: a plain name header matches the 44px button headers beside it, so the set tables line up across a row. */
const ExerciseBlock = ({ exercise, history, tallHeader }: { exercise: ParsedExercise; history?: HistoryLink; tallHeader?: boolean }) => {
  const hasTimes = exercise.sets.some((s) => s.time);
  const number = exercise.seq !== null && (
    <>
      <span aria-hidden="true" className="grid h-6 min-w-6 shrink-0 place-items-center rounded-md bg-chart-2/10 px-1 text-xs font-semibold tabular-nums text-chart-2">
        {exercise.seq}
      </span>
      <span className="sr-only">{exercise.seq}. </span>
    </>
  );
  return (
    <div className="panel-surface min-w-0 overflow-hidden rounded-lg border bg-card">
      {history ? (
        // A real button beside the number, 44px tall, never inside the row's own disclosure button.
        <div className="flex items-center gap-2.5 border-b bg-muted/40 pl-3 text-sm font-semibold">
          {number}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Show history for ${exercise.name}`}
            data-exercise-history={history.target.index}
            onClick={(event) => history.onOpen(history.target, event.currentTarget)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 pr-3 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [@media(hover:hover)]:hover:bg-muted/70"
          >
            <span className="min-w-0 flex-1 break-words underline decoration-muted-foreground/50 decoration-dotted underline-offset-4">{exercise.name}</span>
            <span aria-hidden="true" className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
              <ChartLine className="h-3.5 w-3.5" />History
            </span>
          </button>
        </div>
      ) : (
        <p className={cn('flex items-center gap-2.5 border-b bg-muted/40 px-3 py-2 text-sm font-semibold', tallHeader && 'min-h-11')}>
          {number}
          <span className="min-w-0 break-words">{exercise.name}</span>
        </p>
      )}
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">Sets for {exercise.name}</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="w-[34%] px-3 py-1.5 font-medium">Set</th>
            <th scope="col" className="py-1.5 pr-2 text-right font-medium">Reps</th>
            <th scope="col" className={cn('py-1.5 text-right font-medium', hasTimes ? 'pr-2' : 'pr-3')}>Weight</th>
            {hasTimes && <th scope="col" className="w-[22%] py-1.5 pl-2 pr-3 text-right font-medium">Time</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {exercise.sets.map((set, i) => (
            <tr key={i}>
              <th scope="row" className={cn('px-3 py-1.5 text-left font-normal', set.warmup && 'italic text-muted-foreground')}>
                {set.warmup ? 'Warm-up' : `Set ${set.label}`}
              </th>
              <td className="py-1.5 pr-2 text-right font-medium tabular-nums">{set.reps}</td>
              <td className={cn('py-1.5 text-right font-medium tabular-nums', hasTimes ? 'pr-2' : 'pr-3')}>
                {set.weightKg !== null ? kg(set.weightKg) : (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">no weight recorded</span>
                  </>
                )}
              </td>
              {hasTimes && <td className="py-1.5 pl-2 pr-3 text-right text-xs tabular-nums text-muted-foreground">{set.time ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {exercise.note && (
        <p className="flex items-start gap-1.5 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <StickyNote aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words whitespace-pre-wrap">{exercise.note}</span>
        </p>
      )}
    </div>
  );
};

interface WorkoutDetailProps {
  parsed: ParsedWorkoutNotes;
  hasNotes: boolean;
  /**
   * One entry per exercise, same order and same index as `parsed.exercises` (see exerciseHistoryTargets).
   * Only `openable` ones become buttons. Leave out to show a plain, read-only detail.
   */
  historyTargets?: readonly ExerciseHistoryTarget[];
  onShowHistory?: (target: ExerciseHistoryTarget, trigger: HTMLButtonElement) => void;
}

export const WorkoutDetail = ({ parsed, hasNotes, historyTargets, onShowHistory }: WorkoutDetailProps) => {
  if (!hasNotes) {
    return <p className="text-sm text-muted-foreground">No exercise details were recorded for this workout.</p>;
  }
  const nothingStructured = parsed.exercises.length === 0;
  const anyHistory = !!onShowHistory && !!historyTargets?.some((t) => t.openable);
  return (
    <div className="space-y-4">
      {parsed.exercises.length > 0 && (
        <div>
          <SectionLabel count={parsed.exercises.length}>Exercises</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {parsed.exercises.map((exercise, i) => {
              const target = historyTargets?.[i];
              return (
                <ExerciseBlock
                  key={`${exercise.seq ?? 'x'}-${i}`}
                  exercise={exercise}
                  history={target?.openable && onShowHistory ? { target, onOpen: onShowHistory } : undefined}
                  tallHeader={anyHistory}
                />
              );
            })}
          </div>
        </div>
      )}
      {parsed.unparsed.length > 0 && (
        <div>
          <SectionLabel>{nothingStructured ? 'Notes' : 'Other notes'}</SectionLabel>
          <p className="break-words whitespace-pre-wrap text-sm">{parsed.unparsed.join('\n')}</p>
        </div>
      )}
      {nothingStructured && parsed.unparsed.length === 0 && (
        <p className="text-sm text-muted-foreground">No exercise details were recorded for this workout.</p>
      )}
    </div>
  );
};
