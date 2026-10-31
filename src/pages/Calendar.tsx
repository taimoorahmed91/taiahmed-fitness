import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/Page';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { DataLoadError } from '@/components/feedback/DataLoadError';
import { PartialDataNotice } from '@/components/feedback/PartialDataNotice';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useSleep } from '@/hooks/useSleep';
import { useWaist } from '@/hooks/useWaist';
import { useDailyNotes } from '@/hooks/useDailyNotes';
import { useSharedTableState } from '@/lib/sharedTable';
import { DayDetail, CALENDAR_DAY_ID } from '@/components/calendar/DayDetail';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { MonthStats } from '@/components/calendar/MonthStats';
import {
  CALENDAR_TABLES,
  FILTER_OPTIONS,
  TABLE_LABEL,
  formatBriefDay,
  formatMonthLabel,
  groupEntriesByDate,
  joinTableLabels,
  monthOf,
  monthStats,
  monthSubtitle,
  resolveCalendarAvailability,
  shiftMonth,
  stepDay,
  summarizeDay,
  todayIso,
  type CalendarTable,
  type DisplayFilter,
} from '@/components/calendar/calendarModel';

/**
 * Calendar: the month on one side, the selected day's agenda on the other (stacked below on phones).
 * All dates are plain "YYYY-MM-DD" days and "today" is the UTC day, like every other page.
 */
const Calendar = () => {
  const today = todayIso();
  const [month, setMonth] = useState(() => monthOf(today));
  const [displayFilter, setDisplayFilter] = useState<DisplayFilter>('all');
  // Start on today so the detail panel is never an empty "pick a date" box.
  const [selected, setSelected] = useState<string>(today);

  const { meals, refetch: refetchMeals } = useMeals();
  const { sessions, refetch: refetchGym } = useGymSessions();
  const { entries: weightEntries, refetch: refetchWeight } = useWeight();
  const { entries: sleepEntries, refetch: refetchSleep } = useSleep();
  const { entries: waistEntries, refetch: refetchWaist } = useWaist();
  const { notes, refetch: refetchNotes } = useDailyNotes();

  // Where each table really is. Counts, "nothing logged" and empty days only mean something once the tables the
  // current view needs have loaded: a failed first load means UNKNOWN, never zero.
  const availability = resolveCalendarAvailability(displayFilter, {
    meals: useSharedTableState('meals'),
    gym_sessions: useSharedTableState('gym_sessions'),
    weight: useSharedTableState('weight'),
    waist: useSharedTableState('waist'),
    sleep: useSharedTableState('sleep'),
    daily_notes: useSharedTableState('daily_notes'),
  });
  const { mode } = availability;
  const loading = mode === 'loading';
  const unavailable = mode === 'unavailable';
  const retryers: Record<CalendarTable, () => Promise<void>> = {
    meals: refetchMeals,
    gym_sessions: refetchGym,
    weight: refetchWeight,
    waist: refetchWaist,
    sleep: refetchSleep,
    daily_notes: refetchNotes,
  };
  // Reload only what failed or went stale. Joins any fetch already running and never rejects.
  const retryMissing = async () => {
    await Promise.all([...availability.failed, ...availability.stale].map((t) => retryers[t]()));
  };

  const sources = useMemo(
    () => ({ meals, sessions, weight: weightEntries, sleep: sleepEntries, waist: waistEntries, notes }),
    [meals, sessions, weightEntries, sleepEntries, waistEntries, notes],
  );
  const entriesByDate = useMemo(() => groupEntriesByDate(sources, displayFilter), [sources, displayFilter]);
  const stats = useMemo(() => monthStats(month, sources), [month, sources]);

  const selectedEntries = entriesByDate.get(selected) ?? [];
  const selectedSummary = summarizeDay(selectedEntries);

  const goToToday = () => {
    setMonth(monthOf(today));
    setSelected(today);
  };
  // Stepping a day can cross into another month; the grid follows so the selected day is always on screen.
  const stepSelected = (delta: -1 | 1) => {
    const next = stepDay(selected, delta);
    setSelected(next);
    setMonth(monthOf(next));
  };

  // Phones: the agenda sits below the grid. Move there and focus its heading so everyone arrives.
  const jumpToDay = useCallback(() => {
    const section = document.getElementById(CALENDAR_DAY_ID);
    if (!section) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, []);

  return (
    <PageContainer>
      <PageHeader icon={CalendarIcon} title="Calendar View" description="See everything you logged, day by day" />

      {/* A persistent notice (not a toast) when only SOME areas failed or went stale. The total-failure state explains itself in the calendar. */}
      {!unavailable && (
        <PartialDataNotice
          failed={availability.failed.map((t) => TABLE_LABEL[t])}
          stale={availability.stale.map((t) => TABLE_LABEL[t])}
          onRetry={retryMissing}
        />
      )}

      <section aria-labelledby="calendar-month-heading" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start">
        {/* On phones the card runs edge to edge (cancelling the page gutter) so seven columns can each be 44px wide at 320px. */}
        <Card className="-mx-4 min-w-0 rounded-none border-x-0 sm:mx-0 sm:rounded-lg sm:border-x">
          <CardContent className="space-y-3 px-0 pb-3 pt-3 sm:p-[var(--card-pad)]">
            <div className="flex flex-col gap-2 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-0">
              <div className="flex items-center justify-between gap-1 sm:justify-start">
                <IconButton label="Previous month" tooltip onClick={() => setMonth(shiftMonth(month, -1))}>
                  <ChevronLeft />
                </IconButton>
                <div className="min-w-0 flex-1 text-center sm:min-w-[11rem] sm:flex-none">
                  <h2 id="calendar-month-heading" aria-live="polite" className="text-lg font-semibold leading-tight tracking-tight">
                    {formatMonthLabel(month)}
                  </h2>
                  <p className="text-xs text-muted-foreground">{monthSubtitle(availability, stats.daysLogged)}</p>
                </div>
                <IconButton label="Next month" tooltip onClick={() => setMonth(shiftMonth(month, 1))}>
                  <ChevronRight />
                </IconButton>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <Select value={displayFilter} onValueChange={(v: DisplayFilter) => setDisplayFilter(v)}>
                  <SelectTrigger className="min-w-0 flex-1 sm:w-[10.5rem] sm:flex-none" aria-label="Filter calendar entries">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {unavailable ? (
              <div className="mx-3 sm:mx-0">
                <DataLoadError
                  title="We couldn't load your entries"
                  description={`Your ${joinTableLabels(availability.failed)} didn't load, so the month, its totals and the day's agenda are paused. Nothing was lost.`}
                  onRetry={retryMissing}
                  minHeightClassName="min-h-[16rem]"
                  className="border-dashed shadow-none"
                />
              </div>
            ) : (
              <>
                <MonthGrid month={month} entriesByDate={entriesByDate} selected={selected} today={today} loading={loading} missing={availability.missing} onSelect={setSelected} />

                {/* Phones and tablets: a one-line reminder of the selected day with a jump to its agenda. */}
                <div className="mx-3 flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 sm:mx-0 lg:hidden">
                  <p className="min-w-0 text-sm">
                    <span className="font-semibold text-foreground">{formatBriefDay(selected)}</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {loading ? 'loading…' : selectedSummary.total === 0 ? (mode === 'partial' ? 'nothing in loaded data' : 'nothing logged') : selectedSummary.groups.map((g) => g.short).join(' · ')}
                    </span>
                  </p>
                  <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={jumpToDay}>
                    Details <ArrowDown aria-hidden="true" />
                  </Button>
                </div>

                <div className="mx-3 sm:mx-0">
                  <MonthStats stats={stats} loading={loading} missing={availability.missing} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <DayDetail iso={selected} entries={selectedEntries} today={today} loading={loading} filter={displayFilter} mode={mode} missing={availability.failed} onStep={stepSelected} />
      </section>
    </PageContainer>
  );
};

export default Calendar;
