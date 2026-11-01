import { forwardRef, useId, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HistoryGroup, HistoryList } from '@/components/history/HistoryGroup';
import { HistoryRow } from '@/components/history/HistoryRow';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { GroupMark } from './GroupMark';
import { SectionUnavailable } from '@/components/feedback/SectionUnavailable';
import { buildAgenda, describeDayTotals, formatLongDay, joinTableLabels, summarizeDay, type CalendarMode, type CalendarTable, type DayEntry, type DisplayFilter } from './calendarModel';

interface DayDetailProps {
  iso: string;
  entries: DayEntry[];
  today: string;
  loading: boolean;
  filter: DisplayFilter;
  /** Where the data really is. `unavailable` pauses the agenda instead of calling the day empty. */
  mode: CalendarMode;
  /** Tables whose first load failed. */
  missing: readonly CalendarTable[];
  /** Previous / next day buttons. Leave out to hide them (for example when a chart owns the selection). */
  onStep?: (delta: -1 | 1) => void;
  /** Buttons under the day's sentence: add / edit note, open in Calendar. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The selected day as ONE grouped agenda (meals, workouts, body, recovery, notes), not a card per event.
 * Each group has a heading with its totals and plain history rows underneath: time on the left where the
 * eye scans, the thing and its numbers on the right. Previous / next day buttons let a phone user step
 * through days without scrolling back up to the grid.
 *
 * Every id is made per instance (useId), so two day panels on one page never share an id. Find a panel by its
 * `data-day-detail` attribute (the value is the ISO date), never by a fixed id.
 */
export const DayDetail = forwardRef<HTMLElement, DayDetailProps>(({ iso, entries, today, loading, filter, mode, missing, onStep, actions, className }, ref) => {
  const uid = useId();
  const headingId = `${uid}-day-heading`;
  const summary = summarizeDay(entries);
  const sections = buildAgenda(entries);
  const unavailable = mode === 'unavailable';
  const showAgenda = !loading && !unavailable && sections.length > 0;
  return (
    <section ref={ref} data-day-detail={iso} aria-labelledby={headingId} className={cn('scroll-mt-20 rounded-lg border bg-card text-card-foreground shadow-sm', className)}>
      <header className={cn('flex items-start justify-between gap-2 p-[var(--card-pad)]', showAgenda || unavailable ? 'pb-3' : '')}>
        <div className="min-w-0">
          <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold leading-snug tracking-tight focus:outline-none">
            <time dateTime={iso}>{formatLongDay(iso)}</time>
            {iso === today && <span className="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 align-middle text-xs font-semibold text-primary-foreground">Today</span>}
          </h2>
          <p role="status" className="mt-1 text-sm text-muted-foreground">
            {unavailable ? "This day's entries couldn't be loaded." : describeDayTotals(summary, loading, filter, mode === 'partial' ? missing : [])}
          </p>
          {actions && <div className="mt-3 flex flex-wrap items-start gap-2">{actions}</div>}
        </div>
        {onStep && (
          <div className="flex shrink-0 items-center">
            <IconButton label="Previous day" size="sm" onClick={() => onStep(-1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton label="Next day" size="sm" onClick={() => onStep(1)}>
              <ChevronRight />
            </IconButton>
          </div>
        )}
      </header>

      {unavailable && (
        <div className="px-[var(--card-pad)] pb-[var(--card-pad)]">
          <SectionUnavailable
            title="The day's agenda is paused"
            description={`Needs your ${joinTableLabels(missing)}, which didn't load. Use Try again in the calendar.`}
            minHeightClassName="min-h-[8rem]"
            className="border-dashed shadow-none"
          />
        </div>
      )}
      {showAgenda && (
        <div>
          {sections.map((section) => (
            <HistoryGroup
              key={section.group}
              headingLevel="h3"
              title={
                <span className="inline-flex items-center gap-2">
                  <GroupMark group={section.group} className="h-2.5 w-2.5" />
                  {section.heading}
                </span>
              }
              summary={section.items.length > 1 ? section.facts : []}
            >
              <HistoryList>
                {section.items.map((item) => (
                  <HistoryRow
                    key={item.key}
                    summary={
                      <>
                        {section.items.some((i) => i.time) && (
                          <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{item.time ?? ''}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-medium text-foreground">{item.title}</span>
                          {item.details.length > 0 && <span className="block break-words text-xs text-muted-foreground">{item.details.join(' · ')}</span>}
                        </span>
                      </>
                    }
                  />
                ))}
              </HistoryList>
            </HistoryGroup>
          ))}
        </div>
      )}
    </section>
  );
});
DayDetail.displayName = 'DayDetail';
