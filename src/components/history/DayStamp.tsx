import { defaultToday } from '@/lib/historyDates';

/**
 * The date cell at the start of a history row: the day number large, the weekday small, as one <time>.
 * With `withMonth` (flat, ungrouped lists) the month is added, and the year when it is not the current one,
 * so the row still says which day it is. Uses the calendar day itself, so a date never shifts with the viewer's timezone.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DayStamp = ({ date, withMonth = false, today = defaultToday() }: { date: string; withMonth?: boolean; today?: string }) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return <span className="w-12 shrink-0 text-sm text-muted-foreground">{date}</span>;
  const year = Number(m[1]);
  const day = Number(m[3]);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, Number(m[2]) - 1, day)).getUTCDay()];
  const month = MONTHS[Number(m[2]) - 1];
  const otherYear = String(year) !== today.slice(0, 4);
  return (
    <time dateTime={date} className={withMonth ? 'block w-14 shrink-0 leading-tight' : 'block w-12 shrink-0 leading-tight'}>
      {withMonth && (
        <span className="block text-xs text-muted-foreground">
          {month}
          {otherYear ? ` ${year}` : ''}
        </span>
      )}
      <span className="block text-base font-semibold tabular-nums">{day}</span>
      <span className="block text-xs text-muted-foreground">{weekday}</span>
    </time>
  );
};
