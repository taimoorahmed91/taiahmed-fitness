/**
 * How a calendar day is written for people (pure, no component imports): "Friday, October 30, 2026" and "Fri, Oct 30".
 * A day is the UTC calendar date, shown as that exact date; the viewer's time zone is never read. A value that is not a
 * real date comes back unchanged, so a label is never "Invalid Date".
 *
 * src/components/calendar/calendarModel.ts has the same two formats for the Calendar page; tests/selectedDay.test.ts
 * keeps the two in step. Lib code (day entry adapters) uses this file so lib never imports from components.
 */
import { isoDayToMs } from '@/lib/historyDates';

const fmtUtc = (ms: number, options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(ms);

/** "Friday, October 30, 2026" */
export const formatLongDay = (iso: string): string => {
  const ms = isoDayToMs(iso);
  return ms === null ? iso : fmtUtc(ms, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

/** "Fri, Oct 30" */
export const formatBriefDay = (iso: string): string => {
  const ms = isoDayToMs(iso);
  return ms === null ? iso : fmtUtc(ms, { weekday: 'short', month: 'short', day: 'numeric' });
};
