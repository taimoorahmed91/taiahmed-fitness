import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildCalendarHref, type SelectedDay } from '@/lib/selectedDay';
import { DayDetail } from './DayDetail';
import { DayNoteEditor } from './DayNoteEditor';
import { useDayNote } from './useDayNote';
import { useDayAgenda } from './useDayAgenda';
import { formatLongDay, todayIso, type CalendarMode, type CalendarTable, type DayEntry, type DisplayFilter } from './calendarModel';

export interface SelectedDayPanelProps {
  /** The selected day. Only its `isoDate` is used to look things up; its origin is context for the caller. */
  day: SelectedDay;
  /** That day's records, already filtered the way the caller wants (see `groupEntriesByDate`, `useDayAgenda`). */
  entries: DayEntry[];
  today: string;
  loading: boolean;
  filter: DisplayFilter;
  mode: CalendarMode;
  /** Tables whose first load failed (the agenda says so instead of calling the day empty). */
  missing: readonly CalendarTable[];
  /** Previous / next day buttons. Leave out when something else (a chart, a link) owns the selection. */
  onStep?: (delta: -1 | 1) => void;
  /** Show an "Open in Calendar" link (a normal push). Off on the Calendar page itself. */
  openInCalendar?: boolean;
  className?: string;
}

/**
 * One selected day: its grouped agenda, a safe Add / Edit note, and (optionally) a link to open it in Calendar.
 * Built from the Calendar's own agenda code, so a day reads the same wherever it is shown.
 *
 * Needs a Router (the link) and the shared data providers (notes). The note editor is keyed by account and date:
 * a different account, or a different day, always starts with a closed editor and no draft.
 */
export const SelectedDayPanel = forwardRef<HTMLElement, SelectedDayPanelProps>(
  ({ day, entries, today, loading, filter, mode, missing, onStep, openInCalendar = false, className }, ref) => {
    const { isoDate } = day;
    const note = useDayNote(isoDate);
    return (
      <DayDetail
        ref={ref}
        iso={isoDate}
        entries={entries}
        today={today}
        loading={loading}
        filter={filter}
        mode={mode}
        missing={missing}
        onStep={onStep}
        className={className}
        actions={
          <>
            <DayNoteEditor key={`${note.userId ?? 'anonymous'}|${isoDate}`} isoDate={isoDate} access={note.access} onSave={note.save} onRetry={note.retry} />
            {openInCalendar && (
              <Button asChild variant="outline" size="sm">
                <Link to={buildCalendarHref(isoDate)} aria-label={`Open ${formatLongDay(isoDate)} in Calendar`}>
                  Open in Calendar
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            )}
          </>
        }
      />
    );
  },
);
SelectedDayPanel.displayName = 'SelectedDayPanel';

/**
 * The panel with its own data: for pages that are not the Calendar (the shared chart integration). Give it a
 * SelectedDay and it loads the same records the Calendar reads. Opens in Calendar by default.
 */
export const ConnectedSelectedDayPanel = ({
  day,
  filter = 'all',
  onStep,
  openInCalendar = true,
  className,
}: {
  day: SelectedDay;
  filter?: DisplayFilter;
  onStep?: (delta: -1 | 1) => void;
  openInCalendar?: boolean;
  className?: string;
}) => {
  const agenda = useDayAgenda(filter);
  const { mode } = agenda.availability;
  return (
    <SelectedDayPanel
      day={day}
      entries={agenda.entriesByDate.get(day.isoDate) ?? []}
      today={todayIso()}
      loading={mode === 'loading'}
      filter={filter}
      mode={mode}
      missing={agenda.availability.failed}
      onStep={onStep}
      openInCalendar={openInCalendar}
      className={className}
    />
  );
};
