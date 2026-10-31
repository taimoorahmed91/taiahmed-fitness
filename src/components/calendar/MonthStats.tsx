import { GroupMark } from './GroupMark';
import { GROUP_LABEL, type CalendarTable, type Group, type MonthStats as Stats } from './calendarModel';

interface MonthStatsProps {
  stats: Stats;
  loading: boolean;
  /** Tables that did not load. Their numbers are shown as a dash, never as 0. */
  missing?: readonly CalendarTable[];
}

const ITEMS: ReadonlyArray<{ label: string; group: Group; table: CalendarTable; pick: (s: Stats) => number }> = [
  { label: 'Days with meals', group: 'meals', table: 'meals', pick: (s) => s.daysWithMeals },
  { label: 'Workouts', group: 'workouts', table: 'gym_sessions', pick: (s) => s.workouts },
  { label: 'Weigh-ins', group: 'body', table: 'weight', pick: (s) => s.weighIns },
  { label: 'Waist logs', group: 'body', table: 'waist', pick: (s) => s.waistLogs },
  { label: 'Sleep logs', group: 'recovery', table: 'sleep', pick: (s) => s.sleepLogs },
  { label: 'Notes', group: 'notes', table: 'daily_notes', pick: (s) => s.notes },
];

/**
 * This month in numbers. It also works as the key to the calendar: each label carries the same shape the
 * day cells use for that area, so a person can match the shapes in the grid to words and totals right here.
 */
export const MonthStats = ({ stats, loading, missing = [] }: MonthStatsProps) => (
  <div aria-busy={loading} className="rounded-lg bg-muted/50 p-3">
    <h3 className="text-sm font-semibold text-foreground">This month, and what the shapes mean</h3>
    <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6">
      {ITEMS.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <GroupMark group={item.group} className="mt-1" />
            <span className="min-w-0">
              {item.label}
              <span className="sr-only"> ({GROUP_LABEL[item.group]})</span>
            </span>
          </dt>
          <dd className="text-lg font-semibold tabular-nums text-foreground">
            {loading || missing.includes(item.table) ? (
              <>
                –<span className="sr-only"> {loading ? 'loading' : 'not loaded'}</span>
              </>
            ) : (
              item.pick(stats)
            )}
          </dd>
        </div>
      ))}
    </dl>
  </div>
);
