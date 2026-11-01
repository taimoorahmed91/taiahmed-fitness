import { useMemo } from 'react';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useSleep } from '@/hooks/useSleep';
import { useWaist } from '@/hooks/useWaist';
import { useDailyNotes } from '@/hooks/useDailyNotes';
import { useSharedTableState } from '@/lib/sharedTable';
import { CALENDAR_TABLES, groupEntriesByDate, resolveCalendarAvailability, type CalendarTable, type DisplayFilter } from './calendarModel';

/**
 * Every record the Calendar agenda reads, grouped by date, plus where each table really is (loading / failed /
 * stale). It is what lets a page OTHER than Calendar (a chart's day panel) show the same agenda without copying the
 * Calendar page's wiring. The tables are shared queries, so mounting this next to Calendar costs no extra requests.
 */
export const useDayAgenda = (filter: DisplayFilter = 'all') => {
  const { meals, refetch: refetchMeals } = useMeals();
  const { sessions, refetch: refetchGym } = useGymSessions();
  const { entries: weight, refetch: refetchWeight } = useWeight();
  const { entries: sleep, refetch: refetchSleep } = useSleep();
  const { entries: waist, refetch: refetchWaist } = useWaist();
  const { notes, refetch: refetchNotes } = useDailyNotes();

  const states = {
    meals: useSharedTableState('meals'),
    gym_sessions: useSharedTableState('gym_sessions'),
    weight: useSharedTableState('weight'),
    waist: useSharedTableState('waist'),
    sleep: useSharedTableState('sleep'),
    daily_notes: useSharedTableState('daily_notes'),
  } satisfies Record<CalendarTable, unknown>;
  const availability = resolveCalendarAvailability(filter, states);

  const entriesByDate = useMemo(
    () => groupEntriesByDate({ meals, sessions, weight, sleep, waist, notes }, filter),
    [meals, sessions, weight, sleep, waist, notes, filter],
  );

  const retryers: Record<CalendarTable, () => Promise<void>> = {
    meals: refetchMeals,
    gym_sessions: refetchGym,
    weight: refetchWeight,
    waist: refetchWaist,
    sleep: refetchSleep,
    daily_notes: refetchNotes,
  };
  /** Reload only what failed or went stale. Joins fetches already running and never rejects. */
  const retryMissing = async () => {
    await Promise.all([...availability.failed, ...availability.stale].map((t) => retryers[t]()));
  };

  return { entriesByDate, availability, retryMissing, tables: CALENDAR_TABLES };
};
