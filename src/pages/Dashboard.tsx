import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { StatsCards } from '@/components/StatsCards';
import { CalorieBalanceChart } from '@/components/CalorieBalanceChart';
import { WorkoutDurationChart } from '@/components/WorkoutDurationChart';
import { MealTimeChart } from '@/components/MealTimeChart';
import { CalorieGoalProgress } from '@/components/CalorieGoalProgress';
import { PreviousDaySnapshot } from '@/components/PreviousDaySnapshot';
import { yesterdayIso } from '@/lib/dayLabels';
import { RecoveryChart } from '@/components/RecoveryChart';
import { MacroTargetChart } from '@/components/MacroTargetChart';

import { ProteinTargetCard } from '@/components/ProteinTargetCard';
import { CarbTargetCard } from '@/components/CarbTargetCard';
import { WeightChart } from '@/components/WeightChart';
import { WaistChart } from '@/components/WaistChart';
import { SleepChart } from '@/components/SleepChart';
import { dashboardSleepRows, dashboardWaistRows, dashboardWeightRows } from '@/lib/dashboardRecordRows';
import { GoalsCard } from '@/components/GoalsCard';
import { CrossMetricSummaryCard } from '@/components/CrossMetricSummaryCard';
import { WeightIntervalSetting } from '@/components/WeightIntervalSetting';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useWeight } from '@/hooks/useWeight';
import { useWaist } from '@/hooks/useWaist';
import { useSleep } from '@/hooks/useSleep';
import { useDailySummary } from '@/hooks/useDailySummary';
import { useDailyNotes } from '@/hooks/useDailyNotes';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useWhoopData } from '@/hooks/useWhoopData';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useExtraActivities } from '@/hooks/useExtraActivities';
import { PageContainer, PageHeader, PageSection, PageEmptyState } from '@/components/layout/Page';
import { CardSkeleton } from '@/components/feedback/CardSkeleton';
import { DataFreshness } from '@/components/feedback/DataFreshness';
import { LoadingAnnouncement } from '@/components/feedback/LoadingAnnouncement';
import { PartialDataNotice } from '@/components/feedback/PartialDataNotice';
import { SectionUnavailable } from '@/components/feedback/SectionUnavailable';
import {
  DASHBOARD_LABELS,
  dashboardPausedText,
  resolveDashboardData,
  type DashboardSection,
} from '@/components/feedback/dashboardSections';
import type { TableView } from '@/components/feedback/tableView';
import { useSharedTableState } from '@/lib/sharedTable';
import { hookLoadFailed } from '@/lib/loadState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { useOpenCalendarDay } from '@/components/charts/useOpenCalendarDay';
import { ROUTES } from '@/app/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Meal } from '@/types';
import { AlertTriangle, Clock, Flame } from 'lucide-react';
import { resolveCalorieRange, macroRange } from '@/lib/targets';
import { buildCalorieBalanceRows } from '@/lib/calorieBalance';
import { dayMacroIntake, type IntakeKind } from '@/lib/macroIntake';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const shiftISODateByDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
};

/**
 * "Daily totals reset in 05:32 (at 00:00 UTC)". Hours and minutes only (it re-reads every 30 seconds, so nothing ticks
 * every second), with the timezone written out so it never needs a hover tooltip. Lives in the Today block, not the header.
 */
const ResetCountdown = () => {
  const compute = () => {
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const ms = Math.max(0, next - now.getTime());
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const [label, setLabel] = useState(compute);
  useEffect(() => {
    const id = setInterval(() => setLabel(compute()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" aria-hidden="true" />
      <span>
        Daily totals reset in <span className="font-mono font-semibold text-foreground">{label}</span> (at 00:00 UTC)
      </span>
    </p>
  );
};

/** Loading / error / ready for a hook that is not a shared table. It only reports a failure if the hook exposes one. */
const hookView = (loading: boolean, hook: object): TableView =>
  loading ? 'loading' : hookLoadFailed(hook) ? 'error' : 'ready';

const Dashboard = () => {
  // Evidence dates in the insight card open that day in Calendar (a normal link push, no extra dialog).
  const openCalendarDay = useOpenCalendarDay();
  const { meals, loading: mealsLoading, lastFetchedAt, getTodayCalories, getTodayProtein, getTodayCarbs, getWeeklyData, getMealsByTimeOfDay } = useMeals();
  const { sessions: gymSessions } = useGymSessions();
  const settingsHook = useUserSettings();
  const { settings, loading: settingsLoading, updateWeightInterval, updateWaistInterval } = settingsHook;
  const { entries: weightEntries } = useWeight();
  const { entries: waistEntries } = useWaist();
  const { entries: sleepEntries } = useSleep();
  useDailySummary();
  const { getNotesMap } = useDailyNotes();
  const { entries: whoopEntries } = useWhoopData();
  const personalHook = usePersonalData();
  const { data: personalData, loading: personalLoading } = personalHook;
  const { activities: extraActivities } = useExtraActivities();

  // Effective calorie min/max for a date: the day's target plus any extra-activity calories,
  // using the workout range when a gym session was logged that day.
  const resolveGoalForDate = useCallback((dateStr: string) => {
    const extraCalories = extraActivities
      .filter((a) => a.date === dateStr)
      .reduce((sum, a) => sum + (a.calories || 0), 0);
    const workedOut = gymSessions.some((s) => s.date === dateStr);
    const r = resolveCalorieRange(personalData, settings.daily_calorie_goal, workedOut, extraCalories);
    return { goal: r.min, goalMax: r.max, workedOut, auto: r.auto, extraCalories };
  }, [gymSessions, personalData, settings.daily_calorie_goal, extraActivities]);

  const todayStr = new Date().toISOString().split('T')[0];
  // The UTC calendar day before today: the same day the meals, goal and label below are all built from.
  const yesterdayStr = yesterdayIso(todayStr);

  const { goal: effectiveGoal, goalMax: effectiveGoalMax, workedOut: isGymDay, auto: autoMode } = useMemo(
    () => resolveGoalForDate(todayStr),
    [resolveGoalForDate, todayStr]
  );
  const { goal: yesterdayGoal, goalMax: yesterdayGoalMax, workedOut: yesterdayWorkedOut, auto: yesterdayAuto, extraCalories: yesterdayExtra } = useMemo(
    () => resolveGoalForDate(yesterdayStr),
    [resolveGoalForDate, yesterdayStr]
  );

  // Latest WHOOP recovery score (most recent entry by date)
  const latestRecoveryScore = useMemo(() => {
    const withScore = whoopEntries.find((e) => e.recovery_score != null);
    return withScore?.recovery_score ?? null;
  }, [whoopEntries]);

  // WHOOP recovery trend for the last 30 days (oldest -> newest)
  const recoveryChartData = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = shiftISODateByDays(today, -89);
    return whoopEntries
      .filter((e) => e.recovery_score != null && e.date >= thirtyDaysAgo && e.date <= today)
      .map((e) => ({ date: e.date, recovery: Number(e.recovery_score) }))
      .reverse();
  }, [whoopEntries]);

  const workoutChartData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const start = shiftISODateByDays(today, -89);
    const totals = new Map<string, number>();
    gymSessions.forEach(session => {
      if (session.date >= start && session.date <= today)
        totals.set(session.date, (totals.get(session.date) ?? 0) + session.duration);
    });
    return Array.from({ length: 90 }, (_, index) => {
      const date = shiftISODateByDays(start, index);
      return { date, duration: totals.get(date) ?? 0 };
    });
  }, [gymSessions]);

  // Actual vs target for calories, protein and carbs over the last 30 days (oldest -> newest)
  const macroComparisonData = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const start = shiftISODateByDays(today, -89);

    const sortedWeights = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date));
    const weightOn = (date: string) => {
      let value: number | null = null;
      for (const entry of sortedWeights) {
        if (entry.date <= date) value = entry.weight;
        else break;
      }
      return value ?? sortedWeights[0]?.weight ?? null;
    };

    // `actual` is what was really logged: null (not 0) for a day with no meals, with no value for this macro, or with only some
    // meals carrying it. `intake` says which (src/lib/macroIntake.ts). An explicit 0 stays 0 and stays selectable.
    type Row = { date: string; actual: number | null; intake: IntakeKind; min: number | null; max: number | null };
    const calories: Row[] = [];
    const protein: Row[] = [];
    const carbs: Row[] = [];

    for (let i = 0; i < 90; i++) {
      const date = shiftISODateByDays(start, i);
      const dayMeals = meals.filter((m) => m.date === date);
      const { goal, goalMax } = resolveGoalForDate(date);
      const weight = weightOn(date);
      const pr = macroRange(personalData.protein_multiplier, personalData.protein_multiplier_max, weight);
      const cr = macroRange(personalData.carb_multiplier, personalData.carb_multiplier_max, weight);
      // ISO dates, so each chart can window by real calendar days (and show MM/DD itself).
      const label = date;

      const cal = dayMacroIntake(dayMeals, 'calories');
      const pro = dayMacroIntake(dayMeals, 'protein');
      const car = dayMacroIntake(dayMeals, 'carbs');
      calories.push({ date: label, actual: cal.value, intake: cal.kind, min: goal, max: goalMax });
      protein.push({ date: label, actual: pro.value, intake: pro.kind, min: pr?.min ?? null, max: pr?.max ?? null });
      carbs.push({ date: label, actual: car.value, intake: car.kind, min: cr?.min ?? null, max: cr?.max ?? null });
    }

    return { calories, protein, carbs };
  }, [meals, weightEntries, personalData, resolveGoalForDate]);

  // Refresh every 30 minutes while visible and on tab return. The header's refresh action is answered by
  // this same hook (same single-flight refetchAll), so a manual refresh never starts a second batch.
  // Every mounted data hook registers itself with the shell refresh owner. This hook contributes
  // only the timer/tab-return trigger, so each source is refreshed and counted exactly once.
  const { refetchAll, isRefreshing, lastStartedAt, lastFinishedAt } = useAutoRefresh([], { intervalMs: REFRESH_INTERVAL_MS });

  const notesMap = useMemo(() => getNotesMap(), [getNotesMap]);

  // Weight and Sleep trends carry one EXACT stored record per day (the same plan as the Weight and Sleep pages), so the
  // viewer can offer A / B Compare. See src/lib/dashboardRecordRows.ts for the identity rule. Waist stays aggregate.
  const weightChartData = useMemo(() => dashboardWeightRows(weightEntries), [weightEntries]);

  // One deterministic measurement per UTC date (lowest id), whatever order the rows arrive in; the chart says when a day had more.
  const waistChartData = useMemo(() => dashboardWaistRows(waistEntries), [waistEntries]);

  const sleepChartData = useMemo(() => dashboardSleepRows(sleepEntries, whoopEntries), [sleepEntries, whoopEntries]);

  const calorieChartData = useMemo(() => {
    const data = getWeeklyData();
    // Keep full date for notes matching
    return data;
  }, [getWeeklyData]);
  
  // Burn for day D comes from the WHOOP cycle dated D + 1 (see src/lib/calorieBalance.ts); dates are each entry's own `date`.
  const calorieBalanceData = useMemo(
    () => buildCalorieBalanceRows(whoopEntries, meals, new Date().toISOString().split('T')[0]),
    [meals, whoopEntries],
  );

  // Yesterday's meals, using the same UTC day as `yesterdayStr`. The COUNT decides "No data" (a day with no meals is not
  // zero calories); the total is the calories of exactly those meals.
  const yesterdayMeals = useMemo(() => meals.filter((meal) => meal.date === yesterdayStr), [meals, yesterdayStr]);
  const yesterdayMealCount = yesterdayMeals.length;
  const yesterdayCalories = useMemo(() => yesterdayMeals.reduce((sum, meal) => sum + meal.calories, 0), [yesterdayMeals]);

  // Today's meals (UTC day, matching the "Resets at 00:00 UTC" countdown).
  const todaysMeals = useMemo(() => meals.filter((meal) => meal.date === todayStr), [meals, todayStr]);

  // Where each source really is. A block only draws numbers once EVERYTHING it is computed from has loaded
  // (see dashboardSections.ts). A first-load failure never turns into zero calories, "no meals today", a
  // default target or a reminder; rows kept after a failed refresh stay on screen with a notice.
  const data = resolveDashboardData(
    {
      meals: useSharedTableState('meals'),
      gym_sessions: useSharedTableState('gym_sessions'),
      weight: useSharedTableState('weight'),
      waist: useSharedTableState('waist'),
      sleep: useSharedTableState('sleep'),
      whoop: useSharedTableState('whoop'),
      extra_activities: useSharedTableState('extra_activities'),
      daily_notes: useSharedTableState('daily_notes'),
    },
    {
      // Not shared tables. They report a failure only if their hook exposes one (see lib/loadState).
      settings: hookView(settingsLoading, settingsHook),
      personal: hookView(personalLoading, personalHook),
    },
  );
  const { sections } = data;
  const personalFailed = data.failed.includes('personal');

  const retryDashboard = useCallback(async () => {
    // refetchAll is the single-flight batch (shared tables + settings). Personal targets reload only if they failed,
    // because reloading them while they are fine would flash their cards back to skeletons.
    await refetchAll();
  }, [refetchAll]);

  const mealsView = sections.mealsToday.view;
  const yesterdayView = sections.yesterday.view;
  const pageLoading = data.loading;

  /** One block: skeleton while loading, a quiet "paused" card if its data never loaded, otherwise the content. */
  const gate = (
    section: DashboardSection,
    pausedTitle: string,
    skeleton: ReactNode,
    ready: () => ReactNode,
    minHeightClassName = 'min-h-[13rem]',
  ): ReactNode => {
    const { view, missing } = sections[section];
    if (view === 'loading') return skeleton;
    if (view === 'error') {
      return (
        <SectionUnavailable
          title={pausedTitle}
          description={dashboardPausedText(missing)}
          minHeightClassName={minHeightClassName}
        />
      );
    }
    return ready();
  };

  // Each reminder tile follows its own data. The workout tile also waits for WHOOP while it is still loading,
  // so its "recovery" line does not change after the tile appears (a failed WHOOP load just drops that line).
  const tileStatus = {
    workout: sections.reminderWorkout.view === 'ready' && sections.recovery.view === 'loading' ? 'loading' : sections.reminderWorkout.view,
    weight: sections.reminderWeight.view,
    waist: sections.reminderWaist.view,
    whoop: sections.reminderWhoop.view,
  } as const;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        // The tagline is only shown from sm up: on a phone the header is the title and one "Updated 14:32 · Refresh" line.
        description={<span className="hidden sm:inline">Track your nutrition and fitness progress</span>}
        actions={
          <DataFreshness
            fetchedAt={lastFetchedAt}
            loading={mealsLoading}
            refreshing={isRefreshing}
            lastStartedAt={lastStartedAt}
            lastFinishedAt={lastFinishedAt}
            intervalMs={REFRESH_INTERVAL_MS}
            onRetry={retryDashboard}
            // The same single-flight batch as the timer and the header's "Refresh data": a second tap joins the run in progress.
            onRefresh={retryDashboard}
            className="sm:justify-end"
          />
        }
      />
      <LoadingAnnouncement loading={pageLoading} label="Loading dashboard" />

      {/* One persistent notice (not a toast): what never loaded (its blocks are paused) and what is showing earlier data. */}
      <PartialDataNotice
        failed={data.failed.map((source) => DASHBOARD_LABELS[source])}
        stale={data.stale.map((table) => DASHBOARD_LABELS[table])}
        onRetry={retryDashboard}
      />

      {/* aria-busy: assistive tech waits for the refresh to finish instead of reading half-updated cards. */}
      {/* Every chart keeps its own saved date range (and line/bar choice). There is no page-wide range. */}
      <div aria-busy={pageLoading || isRefreshing} className="space-y-6">
        <PageSection title="Today" hideTitle className="space-y-6">
          {/* Order matters: today's targets (Calories, Protein and Carbs stay together as one group), then yesterday, then reminders
              you can act on, then the raw meal list, then the reminder settings. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h3 className="text-base font-semibold tracking-tight">Today&apos;s targets</h3>
              <ResetCountdown />
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {gate('calorieToday', 'Calorie target is paused', <CardSkeleton bodyClassName="h-32" />, () => (
                <CalorieGoalProgress
                  current={getTodayCalories()}
                  goal={effectiveGoal}
                  goalMax={effectiveGoalMax}
                  autoMode={autoMode}
                  dayType={autoMode ? (isGymDay ? 'gym' : 'rest') : undefined}
                />
              ))}
              {gate('proteinTarget', 'Protein target is paused', <CardSkeleton bodyClassName="h-32" />, () => (
                <ProteinTargetCard
                  multiplier={personalData.protein_multiplier}
                  multiplierMax={personalData.protein_multiplier_max}
                  currentWeight={weightEntries[0]?.weight ?? null}
                  todayProtein={getTodayProtein()}
                />
              ))}
              {gate('carbTarget', 'Carb target is paused', <CardSkeleton bodyClassName="h-32" />, () => (
                <CarbTargetCard
                  multiplier={personalData.carb_multiplier}
                  multiplierMax={personalData.carb_multiplier_max}
                  currentWeight={weightEntries[0]?.weight ?? null}
                  todayCarbs={getTodayCarbs()}
                />
              ))}
            </div>
          </div>

          {/* Yesterday is a normal full-width card in the grid, right under today's targets (it used to live in the page header). */}
          {yesterdayView === 'loading' ? (
            <Skeleton aria-hidden="true" className="h-[4.25rem] w-full" />
          ) : yesterdayView === 'error' ? (
            <div role="status" className="panel-surface w-full rounded-lg border px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 text-chart-warn" aria-hidden="true" />
                Yesterday&apos;s summary is paused
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{dashboardPausedText(sections.yesterday.missing)}</p>
            </div>
          ) : (
            <div className="w-full min-w-0">
              <PreviousDaySnapshot
                date={yesterdayStr}
                mealCount={yesterdayMealCount}
                calories={yesterdayCalories}
                goal={yesterdayGoal}
                goalMax={yesterdayGoalMax}
                dayType={yesterdayAuto ? (yesterdayWorkedOut ? 'gym' : 'rest') : undefined}
                extraCalories={yesterdayExtra}
              />
            </div>
          )}

          <StatsCards
            weightMeasurementInterval={settings.weight_measurement_interval}
            waistMeasurementInterval={settings.waist_measurement_interval}
            recoveryScore={latestRecoveryScore}
            workoutDays={personalData.workout_days}
            gymSessions={gymSessions}
            weightEntries={weightEntries}
            waistEntries={waistEntries}
            whoopEntries={whoopEntries}
            tileStatus={tileStatus}
          />

          {mealsView === 'error' ? (
            <SectionUnavailable
              title="Today's meals are unavailable"
              description={dashboardPausedText(sections.mealsToday.missing)}
              minHeightClassName="min-h-[9rem]"
            />
          ) : (
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Flame className="h-5 w-5 text-primary" aria-hidden="true" />
                  Meals{mealsView === 'ready' ? ` (${todaysMeals.length})` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mealsView === 'loading' ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-hidden="true">
                    {Array.from({ length: 3 }, (_, i) => (
                      <Skeleton key={i} className="h-[4.5rem]" />
                    ))}
                  </div>
                ) : todaysMeals.length === 0 ? (
                  <PageEmptyState
                    className="min-h-[9rem] justify-center"
                    title="No meals logged today"
                    description="Log your first meal to see today's calories and macros here."
                    action={
                      <Button asChild>
                        <Link to={ROUTES.meals}>Log a meal</Link>
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {todaysMeals.map((meal: Meal) => (
                      <div
                        key={meal.id}
                        className="panel-well flex items-center justify-between p-3 rounded-lg bg-background border"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium break-words">{meal.food}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {meal.time}
                            </span>
                            {(meal.protein != null || meal.carbs != null) && (
                              <span className="text-xs text-muted-foreground">
                                {meal.protein != null && `${meal.protein}g protein`}
                                {meal.protein != null && meal.carbs != null && ' · '}
                                {meal.carbs != null && `${meal.carbs}g carbs`}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-semibold tabular-nums text-primary shrink-0 ml-2">{meal.calories} cal</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* The reminder settings are settings, not targets: they sit below the meal list, outside the Calories / Protein / Carbs group. */}
          {gate('measurementSettings', 'Measurement reminders are paused', <CardSkeleton bodyClassName="h-32" />, () => (
            <WeightIntervalSetting
              interval={settings.weight_measurement_interval}
              onIntervalChange={updateWeightInterval}
              waistInterval={settings.waist_measurement_interval}
              onWaistIntervalChange={updateWaistInterval}
            />
          ))}

          {/* Two charts share the row. */}
          <div className="grid lg:grid-cols-2 gap-6">
            {gate('mealTiming', 'Meal timing is paused', <CardSkeleton />, () => (
              <MealTimeChart status={sections.mealTiming.chartStatus} data7={getMealsByTimeOfDay(7)} data14={getMealsByTimeOfDay(14)} data30={getMealsByTimeOfDay(30)} data90={getMealsByTimeOfDay(90)} />
            ), 'min-h-[16rem]')}
            {gate('recovery', 'Recovery trend is paused', <CardSkeleton />, () => <RecoveryChart data={recoveryChartData} status={sections.recovery.chartStatus} />, 'min-h-[16rem]')}
          </div>
        </PageSection>

        <PageSection title="Trends" className="space-y-6">
          {/* Three charts across only from xl: each card holds a title, the range + line/bar row and a legend, which need about 340px. At lg
              (two columns) the third chart takes the whole row instead of squeezing three into 300px cards. */}
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3 lg:[&>*:nth-child(3)]:col-span-2 xl:[&>*:nth-child(3)]:col-span-1">
            {sections.macroTrends.view === 'ready' ? (
              <>
                <MacroTargetChart status={sections.macroTrends.chartStatus} data={macroComparisonData.calories} title="Calories: Actual vs Target" unit="cal" metric="calories" />
                <MacroTargetChart status={sections.macroTrends.chartStatus} data={macroComparisonData.protein} title="Protein: Actual vs Target" unit="g" metric="protein" />
                <MacroTargetChart status={sections.macroTrends.chartStatus} data={macroComparisonData.carbs} title="Carbs: Actual vs Target" unit="g" metric="carbs" />
              </>
            ) : sections.macroTrends.view === 'error' ? (
              <SectionUnavailable
                className="lg:col-span-2 xl:col-span-3"
                title="Target charts are paused"
                description={dashboardPausedText(sections.macroTrends.missing)}
                minHeightClassName="min-h-[16rem]"
              />
            ) : (
              <>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {gate('workoutTrend', 'Workout chart is paused', <CardSkeleton />, () => <WorkoutDurationChart data={workoutChartData} status={sections.workoutTrend.chartStatus} />, 'min-h-[20rem]')}
            {gate('calorieBalance', 'Calorie balance is paused', <CardSkeleton />, () => <CalorieBalanceChart data={calorieBalanceData} status={sections.calorieBalance.chartStatus} />, 'min-h-[20rem]')}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {gate('weightTrend', 'Weight chart is paused', <CardSkeleton />, () => <WeightChart compare data={weightChartData} notesMap={notesMap} status={sections.weightTrend.chartStatus} />, 'min-h-[20rem]')}
            {gate('waistTrend', 'Waist chart is paused', <CardSkeleton />, () => <WaistChart data={waistChartData} notesMap={notesMap} status={sections.waistTrend.chartStatus} />, 'min-h-[20rem]')}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {gate('sleepTrend', 'Sleep chart is paused', <CardSkeleton />, () => <SleepChart compare data={sleepChartData} notesMap={notesMap} status={sections.sleepTrend.chartStatus} />, 'min-h-[20rem]')}
            <GoalsCard />
          </div>
        </PageSection>

        <PageSection title="Insights" hideTitle>
          {/* Cross-metric claims (recovery vs gym, sleep vs food, body recomposition) read six tables. Never draw them from a partial set. */}
          {gate('insights', 'Insights are paused', <CardSkeleton bodyClassName="h-32" />, () => <CrossMetricSummaryCard onSelectDate={openCalendarDay} />, 'min-h-[10rem]')}
        </PageSection>
      </div>
    </PageContainer>
  );
};

export default Dashboard;
