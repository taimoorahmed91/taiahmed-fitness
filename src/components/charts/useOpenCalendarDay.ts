import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildCalendarHref, isValidIsoDate } from '@/lib/selectedDay';

/**
 * "Open this date in Calendar" for places that report a date but are not a chart (insight evidence dates).
 * A normal history push to `/calendar?date=YYYY-MM-DD`, so Back returns to the page the person came from. It goes
 * straight to the Calendar's own day view instead of opening yet another panel or dialog on top of the page.
 *
 * Only a real ISO date navigates: anything else does nothing (it never lands on a wrong or empty Calendar day).
 * Unrelated query parameters of the current page are not carried over: they belong to this page, not to Calendar.
 */
export const useOpenCalendarDay = (): ((isoDate: string) => void) => {
  const navigate = useNavigate();
  return useCallback((isoDate: string) => {
    if (isValidIsoDate(isoDate)) navigate(buildCalendarHref(isoDate));
  }, [navigate]);
};
