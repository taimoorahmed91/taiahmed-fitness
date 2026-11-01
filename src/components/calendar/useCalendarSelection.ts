import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { planDayNavigation, resolveCalendarDate, type DaySelectionIntent } from '@/lib/selectedDay';
import { monthOf, shiftMonth, stepDay } from './calendarModel';

/**
 * The Calendar's selected day and visible month, kept in the address (`?date=YYYY-MM-DD`).
 *
 *  - Direct load, refresh, Back and Forward all land on the day in the address, and the grid shows its month.
 *  - No date, or one that is not a real calendar day, shows UTC today. The address is not rewritten until the
 *    person picks something.
 *  - Picking a day (grid, previous / next day, Today) REPLACES the history entry. Other query parameters survive.
 *    `open` is for an explicit "open this day" action and pushes a new entry.
 *  - Paging months is view state only: it never touches the address. It is forgotten as soon as the selected day changes.
 */
export const useCalendarSelection = (today: string) => {
  const [params, setParams] = useSearchParams();
  const resolved = resolveCalendarDate(params, today);
  const selected = resolved.isoDate;

  const [override, setOverride] = useState<{ forDate: string; month: string } | null>(null);
  const month = override && override.forDate === selected ? override.month : monthOf(selected);
  // Back / Forward change the day without going through `choose`; do not let an old month override come back later.
  useEffect(() => setOverride(null), [selected]);

  const choose = useCallback(
    (target: string, intent: DaySelectionIntent = 'select') => {
      setOverride(null);
      const plan = planDayNavigation({ search: params, selected, target, intent });
      if (plan.navigate) setParams(new URLSearchParams(plan.search), { replace: plan.replace });
    },
    [params, selected, setParams],
  );

  return {
    selected,
    month,
    /** A `date` was in the address but could not be used. */
    invalidDateInUrl: resolved.invalid,
    select: (iso: string) => choose(iso, 'select'),
    step: (delta: -1 | 1) => choose(stepDay(selected, delta), 'step'),
    goToToday: () => choose(today, 'today'),
    open: (iso: string) => choose(iso, 'open-in-calendar'),
    shiftMonth: (delta: number) => setOverride({ forDate: selected, month: shiftMonth(month, delta) }),
  };
};
