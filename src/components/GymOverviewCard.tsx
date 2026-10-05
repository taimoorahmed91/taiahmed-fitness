import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Dumbbell, History, CalendarCheck } from 'lucide-react';
import { GymSession } from '@/types';

const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' },
  { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const countExercises = (notes?: string | null) =>
  notes ? notes.split(' | ').filter((p) => p.includes(':')).length : 0;

interface Props {
  sessions: GymSession[];
  workoutDays: number[];
}

export const GymOverviewCard = ({ sessions, workoutDays }: Props) => {
  const week = useMemo(() => {
    const now = new Date();
    const today = isoDay(now);
    const monday = new Date(`${today}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return DAYS.map((d, i) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + i);
      const iso = isoDay(date);
      const daySessions = sessions.filter((s) => s.date === iso);
      return {
        ...d,
        iso,
        planned: workoutDays.includes(d.v),
        done: daySessions.length > 0,
        minutes: daySessions.reduce((sum, s) => sum + s.duration, 0),
        isToday: iso === today,
        isPast: iso < today,
      };
    });
  }, [sessions, workoutDays]);

  const plannedCount = week.filter((d) => d.planned).length;
  const plannedHit = week.filter((d) => d.planned && d.done).length;
  const weekSessions = week.filter((d) => d.done).length;
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const avg = sessions.length ? Math.round(sessions.reduce((s, x) => s + x.duration, 0) / sessions.length) : 0;

  const last = useMemo(
    () => [...sessions].sort((a, b) => b.date.localeCompare(a.date) || (b.start_time ?? '').localeCompare(a.start_time ?? ''))[0],
    [sessions],
  );
  const daysAgo = last
    ? Math.round((Date.parse(`${isoDay(new Date())}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 86400000)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          This week's training
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map((d) => {
              const state = d.done ? 'done' : d.planned && d.isPast ? 'missed' : d.planned ? 'planned' : 'rest';
              const styles = {
                done: 'border-chart-min bg-chart-min/15 text-chart-min',
                missed: 'border-chart-max/60 bg-chart-max/10 text-chart-max',
                planned: 'border-primary/60 border-dashed text-primary',
                rest: 'border-border text-muted-foreground',
              }[state];
              return (
                <div
                  key={d.v}
                  className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-xs ${styles} ${d.isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                  title={`${d.iso}${d.done ? ` · ${d.minutes} min` : d.planned ? ' · planned' : ' · rest day'}`}
                >
                  <span className="font-medium">{d.l}</span>
                  <span className="flex h-5 items-center">
                    {d.done ? <Check className="h-4 w-4" /> : d.planned ? <Dumbbell className="h-3.5 w-3.5" /> : <span>–</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span><span className="text-chart-min">●</span> Done</span>
            <span><span className="text-primary">●</span> Planned</span>
            <span><span className="text-chart-max">●</span> Missed</span>
            <span>– Rest</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Plan hit</p>
            <p className="text-xl font-semibold">
              {plannedCount ? `${plannedHit}/${plannedCount}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sessions</p>
            <p className="text-xl font-semibold">{weekSessions}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Minutes</p>
            <p className="text-xl font-semibold">{weekMinutes}</p>
          </div>
        </div>
        {!plannedCount && (
          <p className="text-xs text-muted-foreground">Set your workout days on the Personal page to track your plan.</p>
        )}

        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Last workout
          </p>
          {last ? (
            <>
              <p className="font-semibold">{last.exercise}</p>
              <p className="text-sm text-muted-foreground">
                {last.date}{daysAgo !== null && ` · ${daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}`}
                {` · ${last.duration} min`}
                {countExercises(last.notes) > 0 && ` · ${countExercises(last.notes)} exercises`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
          )}
        </div>

        <div className="flex justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">All time: <span className="font-semibold text-foreground">{sessions.length}</span> workouts</span>
          <span className="text-muted-foreground">Avg <span className="font-semibold text-foreground">{avg}</span> min</span>
        </div>
      </CardContent>
    </Card>
  );
};
