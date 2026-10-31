import { StickyNote } from 'lucide-react';
import type { ParsedExercise, ParsedWorkoutNotes } from '@/lib/workoutNotes';

/**
 * The opened part of a workout row: each exercise with its sets as a small Set / Reps / Weight table.
 * Set times are shown quietly in their own column, only when the workout stored them.
 * Anything the notes parser did not understand is shown as plain text under "Other notes", so nothing is lost.
 */
const kg = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg`;

const ExerciseBlock = ({ exercise }: { exercise: ParsedExercise }) => {
  const hasTimes = exercise.sets.some((s) => s.time);
  return (
    <div className="min-w-0 rounded-md border bg-card p-3">
      <p className="flex items-baseline gap-2 text-sm font-semibold">
        {exercise.seq !== null && <span className="font-normal tabular-nums text-muted-foreground">{exercise.seq}.</span>}
        <span className="min-w-0 break-words">{exercise.name}</span>
      </p>
      <table className="mt-2 w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">Sets for {exercise.name}</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="w-[34%] py-1 pr-2 font-medium">Set</th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">Reps</th>
            <th scope="col" className="py-1 text-right font-medium">Weight</th>
            {hasTimes && <th scope="col" className="w-[22%] py-1 pl-2 text-right font-medium">Time</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {exercise.sets.map((set, i) => (
            <tr key={i}>
              <th scope="row" className={`py-1.5 pr-2 text-left font-normal ${set.warmup ? 'text-muted-foreground' : ''}`}>
                {set.warmup ? 'Warm-up' : `Set ${set.label}`}
              </th>
              <td className="py-1.5 pr-2 text-right tabular-nums">{set.reps}</td>
              <td className="py-1.5 text-right tabular-nums">
                {set.weightKg !== null ? kg(set.weightKg) : (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">no weight recorded</span>
                  </>
                )}
              </td>
              {hasTimes && <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-muted-foreground">{set.time ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {exercise.note && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
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
    <div className="space-y-3">
      {parsed.exercises.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {parsed.exercises.map((exercise, i) => (
            <ExerciseBlock key={`${exercise.seq ?? 'x'}-${i}`} exercise={exercise} />
          ))}
        </div>
      )}
      {parsed.unparsed.length > 0 && (
        <div className="rounded-md border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">{nothingStructured ? 'Notes' : 'Other notes'}</p>
          <p className="mt-1 text-sm break-words whitespace-pre-wrap">{parsed.unparsed.join('\n')}</p>
        </div>
      )}
      {nothingStructured && parsed.unparsed.length === 0 && (
        <p className="text-sm text-muted-foreground">No exercise details were recorded for this workout.</p>
      )}
    </div>
  );
};
