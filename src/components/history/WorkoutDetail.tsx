import { StickyNote } from 'lucide-react';
import type { ParsedExercise, ParsedWorkoutNotes } from '@/lib/workoutNotes';
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

const ExerciseBlock = ({ exercise }: { exercise: ParsedExercise }) => {
  const hasTimes = exercise.sets.some((s) => s.time);
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
      <p className="flex items-center gap-2.5 border-b bg-muted/40 px-3 py-2 text-sm font-semibold">
        {exercise.seq !== null && (
          <span aria-hidden="true" className="grid h-6 min-w-6 shrink-0 place-items-center rounded-md bg-chart-2/10 px-1 text-xs font-semibold tabular-nums text-chart-2">
            {exercise.seq}
          </span>
        )}
        {exercise.seq !== null && <span className="sr-only">{exercise.seq}. </span>}
        <span className="min-w-0 break-words">{exercise.name}</span>
      </p>
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

export const WorkoutDetail = ({ parsed, hasNotes }: { parsed: ParsedWorkoutNotes; hasNotes: boolean }) => {
  if (!hasNotes) {
    return <p className="text-sm text-muted-foreground">No exercise details were recorded for this workout.</p>;
  }
  const nothingStructured = parsed.exercises.length === 0;
  return (
    <div className="space-y-4">
      {parsed.exercises.length > 0 && (
        <div>
          <SectionLabel count={parsed.exercises.length}>Exercises</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {parsed.exercises.map((exercise, i) => (
              <ExerciseBlock key={`${exercise.seq ?? 'x'}-${i}`} exercise={exercise} />
            ))}
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
