import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SpokenText } from './SpokenText';
import { formatChangedAt, formatHistoryRow, type HistoryRow } from './model';

/** How many earlier changes show before "Show all". Keeps a long history from turning into a wall of rows. */
export const EARLIER_PREVIEW = 5;

export interface ValueHistoryProps {
  /** Newest first (see singleHistoryRows / rangeHistoryRows). */
  rows: HistoryRow[];
  /** Unit written after every value, for example "kcal" or "kg". */
  unit: string;
  /** Names the history for assistive tech, for example "Gym day calories". */
  label: string;
}

/**
 * The saved history of one target, as a small timeline.
 *
 * The current value and the date it was set are always on screen. Earlier values sit behind one disclosure
 * button ("Show 3 earlier") and open as a dated list, newest first. Dates are UTC like every date in the app.
 */
export const ValueHistory = ({ rows, unit, label }: ValueHistoryProps) => {
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <History aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>No history yet. Save to record a value.</span>
      </p>
    );
  }

  const [current, ...earlier] = rows;
  const visible = showAll ? earlier : earlier.slice(0, EARLIER_PREVIEW);

  return (
    <Collapsible className="min-w-0 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 flex-1 basis-48 items-start gap-1.5">
          <History aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">
            Current: <strong className="font-semibold text-foreground"><SpokenText value={formatHistoryRow(current, unit)} /></strong>
            {' '}&middot; set <time dateTime={current.changedAt}>{formatChangedAt(current.changedAt)}</time>
          </span>
        </p>
        {earlier.length > 0 && (
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group/history shrink-0 px-2 text-muted-foreground"
            >
              <ChevronDown
                aria-hidden="true"
                className="transition-transform motion-reduce:transition-none group-data-[state=open]/history:rotate-180"
              />
              <span className="group-data-[state=open]/history:hidden">Show {earlier.length} earlier</span>
              <span className="hidden group-data-[state=open]/history:inline">Hide earlier</span>
              <span className="sr-only"> {label} values</span>
            </Button>
          </CollapsibleTrigger>
        )}
      </div>
      {earlier.length > 0 && (
        <CollapsibleContent>
          <ol aria-label={`${label}: earlier values, newest first`} className="relative ml-2 mt-3 space-y-3 border-l-2 border-border pl-4">
            {visible.map((row) => (
              <li key={row.id} className="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="min-w-0 break-words font-medium text-foreground"><SpokenText value={formatHistoryRow(row, unit)} /></span>
                <time dateTime={row.changedAt} className="min-w-0 break-words">{formatChangedAt(row.changedAt)}</time>
              </li>
            ))}
          </ol>
          {!showAll && earlier.length > EARLIER_PREVIEW && (
            <Button type="button" variant="ghost" size="sm" className="mt-1 px-2 text-muted-foreground" onClick={() => setShowAll(true)}>
              Show all {earlier.length} earlier
            </Button>
          )}
          <p className="mt-2 text-xs">Dates are shown in UTC.</p>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};
