import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GroupMark } from './GroupMark';
import {
  WEEKDAYS_SUN_FIRST,
  buildMonthGrid,
  dayAriaLabel,
  formatMonthLabel,
  splitForCell,
  summarizeDay,
  type CalendarTable,
  type DayEntry,
} from './calendarModel';

interface MonthGridProps {
  month: string;
  entriesByDate: ReadonlyMap<string, DayEntry[]>;
  selected: string | null;
  today: string;
  loading: boolean;
  /** Tables that did not load: a day with nothing in the loaded data is not called empty. */
  missing?: readonly CalendarTable[];
  onSelect: (iso: string) => void;
}

/**
 * The month as a seven-column grid of buttons.
 *
 * Reading a cell, from most to least obvious:
 *  - the day number; TODAY is a filled disc around the number (a shape, not just a colour)
 *  - SELECTED is a thick inset outline plus a tinted fill around the whole cell
 *  - DAYS WITH DATA have a soft fill and either small shapes (phones: one per area) or up to four short lines
 *    of real numbers (from `sm`: "1,850 cal", "45 min", "7.5 h") with "+N more" past that
 *  - empty days stay plain and quiet
 * Each button's accessible name spells all of it out, so the shapes never carry meaning alone.
 */
export const MonthGrid = ({ month, entriesByDate, selected, today, loading, missing = [], onSelect }: MonthGridProps) => {
  const { leading, days, trailing } = buildMonthGrid(month, 0);
  return (
    // Hairline grid: the wrapper shows through the 1px gaps as the lines between days. That is how seven
    // columns still give every day at least 44px of width on a 320px phone (the card goes edge to edge there).
    <div className="flex flex-col gap-px overflow-hidden border-y bg-border sm:rounded-md sm:border-x">
      {/* Weekday names are repeated in every day's accessible name, so this row is visual only. */}
      <div aria-hidden="true" className="grid grid-cols-7 gap-px">
        {WEEKDAYS_SUN_FIRST.map((day) => (
          <div key={day} className="bg-muted py-1.5 text-center text-xs font-medium text-muted-foreground">
            <span className="sm:hidden">{day.slice(0, 1)}</span>
            <span className="hidden sm:inline">{day}</span>
          </div>
        ))}
      </div>
      <div role="group" aria-label={`Days of ${formatMonthLabel(month)}`} className="grid grid-cols-7 gap-px">
        {Array.from({ length: leading }, (_, i) => (
          <div key={`lead-${i}`} aria-hidden="true" className="bg-muted/40" />
        ))}
        {days.map((iso) => {
          const entries = entriesByDate.get(iso) ?? [];
          const summary = summarizeDay(entries);
          const isToday = iso === today;
          const isSelected = iso === selected;
          const hasData = !loading && summary.total > 0;
          const { shown, more } = splitForCell(summary);
          return (
            <Button
              key={iso}
              type="button"
              variant="ghost"
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={dayAriaLabel(iso, summary, { today, loading, missing })}
              className={cn(
                'relative h-auto min-h-14 w-full min-w-0 flex-col items-stretch justify-start gap-1 whitespace-normal rounded-none p-1 text-left font-normal sm:min-h-[6.5rem] sm:p-1.5',
                // The shared Button asks for 44px on touch; keep the same row height as mouse users get.
                '[@media(pointer:coarse)]:min-h-14 sm:[@media(pointer:coarse)]:min-h-[6.5rem]',
                'focus-visible:z-10',
                isSelected ? 'bg-primary/10 ring-2 ring-inset ring-primary [@media(hover:hover)]:hover:bg-primary/15' : hasData ? 'bg-muted' : 'bg-card',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center self-center rounded-full text-sm tabular-nums sm:self-start',
                  isToday ? 'bg-primary font-bold text-primary-foreground' : hasData ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {Number(iso.slice(8, 10))}
              </span>
              {hasData && (
                <>
                  <span aria-hidden="true" className="flex flex-wrap justify-center gap-[3px] sm:hidden">
                    {summary.groups.map((g) => (
                      <GroupMark key={g.group} group={g.group} />
                    ))}
                  </span>
                  <span aria-hidden="true" className="hidden min-w-0 flex-col gap-0.5 text-xs leading-tight text-foreground sm:flex">
                    {shown.map((g) => (
                      <span key={g.group} className="flex min-w-0 items-center gap-1">
                        <GroupMark group={g.group} />
                        <span className="min-w-0 truncate">{g.short}</span>
                      </span>
                    ))}
                    {more > 0 && <span className="text-muted-foreground">+{more} more</span>}
                  </span>
                </>
              )}
            </Button>
          );
        })}
        {Array.from({ length: trailing }, (_, i) => (
          <div key={`trail-${i}`} aria-hidden="true" className="bg-muted/40" />
        ))}
      </div>
    </div>
  );
};
