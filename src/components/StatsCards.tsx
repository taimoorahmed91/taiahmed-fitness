import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dumbbell, CalendarOff, Scale, Activity, CheckCircle, AlertTriangle, Ruler, ChevronRight } from 'lucide-react';
import { ROUTES } from '@/app/navigation';
import { computeStatsStatus } from '@/lib/statsStatus';

export type StatTileKey = 'workout' | 'weight' | 'waist' | 'whoop';
/** `error` = the data this tile needs never loaded, so the tile makes no claim and pauses its reminder. */
export type StatTileStatus = 'loading' | 'error' | 'ready';

interface StatsCardsProps {
  weightMeasurementInterval: number;
  waistMeasurementInterval: number;
  recoveryScore?: number | null;
  /** Days of the week (0 = Sunday) the user plans to work out. */
  workoutDays?: number[];
  /** Data the page already loaded. The tiles read these instead of running their own queries. */
  gymSessions: { date: string }[];
  weightEntries: { date: string }[];
  waistEntries: { date: string }[];
  whoopEntries: { created_at: string }[];
  /** True until all of the data above has loaded. Tiles show skeletons, never placeholder text. */
  loading?: boolean;
  /**
   * Where each tile's own data is. A tile not listed follows `loading`. A tile only says "do this today"
   * or "on track" when its status is `ready`: reminders are never guessed from data that did not load.
   */
  tileStatus?: Partial<Record<StatTileKey, StatTileStatus>>;
}

/** Two-line placeholder with the same line heights as the real text, so nothing jumps on load. */
const TileTextSkeleton = () => (
  <div aria-hidden="true">
    <Skeleton className="mt-1 h-5 w-40 max-w-full" />
    <Skeleton className="mt-1 h-4 w-24" />
  </div>
);

/**
 * One reminder tile. Once data has loaded the whole tile is a real link to the
 * page where the reminder is handled (so it works with keyboard, touch and
 * screen readers). While loading it is a plain, non-interactive placeholder.
 */
const StatTile = ({
  to,
  destination,
  label,
  status,
  unavailableSubject,
  icon,
  iconBoxClass,
  children,
}: {
  to: string;
  /** Plain name of the page the link opens, read out to screen readers. */
  destination: string;
  label: string;
  status: StatTileStatus;
  /** What could not be loaded, in plain words ("workouts"). */
  unavailableSubject: string;
  icon: ReactNode;
  iconBoxClass: string;
  children: ReactNode;
}) => {
  const loading = status === 'loading';
  if (status === 'error') {
    // No claim, no link: the page-level notice explains and offers Try again. Same size as a loaded tile.
    return (
      <Card className="shadow-md" data-stat-tile-unavailable>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-sm font-medium mt-1 text-muted-foreground">Reminder paused</p>
              <p className="text-xs text-muted-foreground">Couldn't load your {unavailableSubject}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--chart-warn))]" aria-hidden="true" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  const card = (
    <Card className="shadow-md transition-colors motion-reduce:transition-none [@media(hover:hover)]:group-hover:border-primary/50">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {label}
              {!loading && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </p>
            {loading ? <TileTextSkeleton /> : children}
          </div>
          <div className={`p-2 rounded-lg ${iconBoxClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
  if (loading) return card;
  return (
    <Link
      to={to}
      className="group block rounded-lg ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
      <span className="sr-only">Open {destination}</span>
    </Link>
  );
};

export const StatsCards = ({
  weightMeasurementInterval,
  waistMeasurementInterval,
  recoveryScore = null,
  workoutDays = [],
  gymSessions,
  weightEntries,
  waistEntries,
  whoopEntries,
  loading = false,
  tileStatus,
}: StatsCardsProps) => {
  const statusOf = (key: StatTileKey): StatTileStatus => tileStatus?.[key] ?? (loading ? 'loading' : 'ready');
  const { didWorkoutToday, didWorkoutYesterday, whoopSyncedToday, weight, waist } = useMemo(
    () =>
      computeStatsStatus({
        gymDates: gymSessions.map((s) => s.date),
        weightDates: weightEntries.map((e) => e.date),
        waistDates: waistEntries.map((e) => e.date),
        whoopCreatedAt: whoopEntries.map((e) => e.created_at),
        weightIntervalDays: weightMeasurementInterval,
        waistIntervalDays: waistMeasurementInterval,
        now: Date.now(),
      }),
    [gymSessions, weightEntries, waistEntries, whoopEntries, weightMeasurementInterval, waistMeasurementInterval],
  );
  const { due: weightDueToday, daysUntil: daysUntilWeight } = weight;
  const { due: waistDueToday, daysUntil: daysUntilWaist } = waist;

  const todayDow = new Date().getDay();
  const yesterdayDow = (todayDow + 6) % 7;
  const isWorkoutDay = workoutDays.includes(todayDow);
  const yesterdayWasWorkoutDay = workoutDays.includes(yesterdayDow);
  const missedYesterdayWorkout = yesterdayWasWorkoutDay && !didWorkoutYesterday && !isWorkoutDay && !didWorkoutToday;

  const showWorkoutReminder = (isWorkoutDay && !didWorkoutToday) || missedYesterdayWorkout;

  let workoutTitle: string;
  let workoutSubtitle: string;
  if (didWorkoutToday) {
    workoutTitle = 'You did workout today';
    workoutSubtitle = 'Rest now!';
  } else if (isWorkoutDay) {
    workoutTitle = 'Today is a workout day';
    workoutSubtitle = recoveryScore != null
      ? (recoveryScore < 50
          ? 'See if you can skip today'
          : `Recovery is ${Math.round(recoveryScore)}% so try working out`)
      : 'Get moving!';
  } else if (missedYesterdayWorkout) {
    workoutTitle = 'You missed a workout day';
    workoutSubtitle = 'Try to recompensate today';
  } else {
    workoutTitle = 'Rest day';
    workoutSubtitle = 'Recover and recharge';
  }

  const workoutIcon =
    missedYesterdayWorkout && !isWorkoutDay && !didWorkoutToday ? (
      <AlertTriangle className="h-5 w-5 text-primary" aria-hidden="true" />
    ) : showWorkoutReminder ? (
      <Dumbbell className="h-5 w-5 text-primary" aria-hidden="true" />
    ) : (
      <CalendarOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
    );

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatTile
        to={ROUTES.gym}
        destination="Gym"
        label="Workout"
        status={statusOf('workout')}
        unavailableSubject="workouts"
        icon={workoutIcon}
        iconBoxClass={!showWorkoutReminder ? 'bg-muted' : 'bg-primary/10'}
      >
        <p className={`text-sm font-medium mt-1 ${!showWorkoutReminder ? 'text-muted-foreground' : ''}`}>{workoutTitle}</p>
        <p className="text-xs text-muted-foreground">{workoutSubtitle}</p>
      </StatTile>

      <StatTile
        to={ROUTES.weight}
        destination="Weight"
        label="Weight"
        status={statusOf('weight')}
        unavailableSubject="weight entries"
        icon={<Scale className={`h-5 w-5 ${weightDueToday ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />}
        iconBoxClass={!weightDueToday ? 'bg-muted' : 'bg-primary/10'}
      >
        <p className={`text-sm font-medium mt-1 ${!weightDueToday ? 'text-muted-foreground' : ''}`}>
          {weightDueToday ? 'Measure your weight today' : `Next measurement in ${daysUntilWeight} day${daysUntilWeight !== 1 ? 's' : ''}`}
        </p>
        <p className="text-xs text-muted-foreground">{weightDueToday ? 'Time to check in!' : 'On track'}</p>
      </StatTile>

      <StatTile
        to={ROUTES.waist}
        destination="Waist"
        label="Waist"
        status={statusOf('waist')}
        unavailableSubject="waist entries"
        icon={<Ruler className={`h-5 w-5 ${waistDueToday ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />}
        iconBoxClass={!waistDueToday ? 'bg-muted' : 'bg-primary/10'}
      >
        <p className={`text-sm font-medium mt-1 ${!waistDueToday ? 'text-muted-foreground' : ''}`}>
          {waistDueToday ? 'Measure your waist today' : `Next measurement in ${daysUntilWaist} day${daysUntilWaist !== 1 ? 's' : ''}`}
        </p>
        <p className="text-xs text-muted-foreground">{waistDueToday ? 'Time to check in!' : 'On track'}</p>
      </StatTile>

      <StatTile
        to={ROUTES.whoopData}
        destination="WHOOP data"
        label="WHOOP"
        status={statusOf('whoop')}
        unavailableSubject="WHOOP data"
        icon={whoopSyncedToday
          ? <CheckCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          : <Activity className="h-5 w-5 text-primary" aria-hidden="true" />}
        iconBoxClass={whoopSyncedToday ? 'bg-muted' : 'bg-primary/10'}
      >
        <p className={`text-sm font-medium mt-1 ${!whoopSyncedToday ? '' : 'text-muted-foreground'}`}>
          {whoopSyncedToday ? 'Data synced today' : 'Not synced yet today'}
        </p>
        <p className="text-xs text-muted-foreground">
          {whoopSyncedToday ? 'All good!' : 'Sync your WHOOP data'}
        </p>
      </StatTile>
    </div>
  );
};
