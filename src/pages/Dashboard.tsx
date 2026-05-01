import { useState, useMemo } from 'react';
import { StatsCards } from '@/components/StatsCards';
import { CalorieChart } from '@/components/CalorieChart';
import { CalorieBalanceChart } from '@/components/CalorieBalanceChart';
import { WorkoutDurationChart } from '@/components/WorkoutDurationChart';
import { MealTimeChart } from '@/components/MealTimeChart';
import { CalorieGoalProgress } from '@/components/CalorieGoalProgress';
import { YesterdayStatus } from '@/components/YesterdayStatus';
import { WeightChart } from '@/components/WeightChart';
import { WaistChart } from '@/components/WaistChart';
import { SleepChart } from '@/components/SleepChart';
import { GoalsCard } from '@/components/GoalsCard';
import { SearchFilter } from '@/components/SearchFilter';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Meal } from '@/types';
import { Clock, Flame } from 'lucide-react';
const shiftISODateByDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
};

const Dashboard = () => {
  const { meals, getTodayCalories, getWeeklyData, getMealsByTimeOfDay, refetch: refetchMeals } = useMeals();
  const { getThisWeekSessions, getWeeklyWorkoutData, sessions: gymSessions, refetch: refetchGym } = useGymSessions();
  const { settings, updateCalorieGoal, updateWeightInterval, refetch: refetchSettings } = useUserSettings();
  const { entries: weightEntries, refetch: refetchWeight } = useWeight();
  const { entries: waistEntries, refetch: refetchWaist } = useWaist();
  const { entries: sleepEntries, refetch: refetchSleep } = useSleep();
  const { summary, refetch: refetchSummary } = useDailySummary();
  const { getNotesMap, refetch: refetchNotes } = useDailyNotes();
  const { entries: whoopEntries } = useWhoopData();
  const { data: personalData } = usePersonalData();

  // Resolve effective calorie goal for a given date based on workout activity that day
  const resolveGoalForDate = (dateStr: string) => {
    const workedOut = gymSessions.some((s) => s.date === dateStr);
    const gymTarget = personalData.gym_day_calorie_target;
    const restTarget = personalData.rest_day_calorie_target;
    const auto = gymTarget != null || restTarget != null;
    let goal = settings.daily_calorie_goal;
    if (auto) {
      if (workedOut && gymTarget != null) goal = gymTarget;
      else if (!workedOut && restTarget != null) goal = restTarget;
      else if (gymTarget != null) goal = gymTarget;
      else if (restTarget != null) goal = restTarget;
    }
    return { goal, workedOut, auto };
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();

  const { goal: effectiveGoal, workedOut: isGymDay, auto: autoMode } = useMemo(
    () => resolveGoalForDate(todayStr),
    [gymSessions, personalData, settings.daily_calorie_goal, todayStr]
  );
  const { goal: yesterdayGoal } = useMemo(
    () => resolveGoalForDate(yesterdayStr),
    [gymSessions, personalData, settings.daily_calorie_goal, yesterdayStr]
  );

  // Latest WHOOP recovery score (most recent entry by date)
  const latestRecoveryScore = useMemo(() => {
    const withScore = whoopEntries.find((e) => e.recovery_score != null);
    return withScore?.recovery_score ?? null;
  }, [whoopEntries]);
  // Auto-refresh every 30 seconds (only on Dashboard) - includes daily summary to keep it updated
  useAutoRefresh([refetchMeals, refetchGym, refetchSettings, refetchWeight, refetchWaist, refetchSleep, refetchSummary, refetchNotes]);

  const notesMap = useMemo(() => getNotesMap(), [getNotesMap]);

  const weightChartData = useMemo(() => 
    weightEntries.map(e => ({ date: e.date, weight: e.weight })), 
    [weightEntries]
  );

  const waistChartData = useMemo(() => 
    waistEntries.map(e => ({ date: e.date, waist: e.waist })), 
    [waistEntries]
  );

  const sleepChartData = useMemo(() => {
    const map = new Map<string, { date: string; hours: number; whoopHours: number }>();
    sleepEntries.forEach(e => {
      map.set(e.date, { date: e.date, hours: e.hours, whoopHours: 0 });
    });
    whoopEntries.forEach(e => {
      const inBed = e.total_in_bed_hours ?? 0;
      if (!inBed) return;
      const existing = map.get(e.date);
      if (existing) existing.whoopHours = inBed;
      else map.set(e.date, { date: e.date, hours: 0, whoopHours: inBed });
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [sleepEntries, whoopEntries]);

  const calorieChartData = useMemo(() => {
    const data = getWeeklyData();
    // Keep full date for notes matching
    return data;
  }, [getWeeklyData]);
  
  const calorieBalanceData = useMemo(() => {
    const mealsByDate = new Map<string, number>();
    meals.forEach((meal) => {
      mealsByDate.set(meal.date, (mealsByDate.get(meal.date) || 0) + meal.calories);
    });

    return whoopEntries
      .filter((entry) => {
        if (entry.kilojoule == null) return false;
        // Use created_at minus 1 day as reference date
        const refDate = shiftISODateByDays(entry.created_at.split('T')[0], -1);
        return mealsByDate.has(refDate);
      })
      .map((entry) => {
        const burned = Math.round(Number(entry.kilojoule) / 4.184);
        const refDate = shiftISODateByDays(entry.created_at.split('T')[0], -1);
        const consumed = mealsByDate.get(refDate) || 0;
        const balance = burned - consumed;
        const [year, month, day] = refDate.split('-');

        return {
          date: `${month}/${day}`,
          consumed,
          burned,
          balance,
        };
      })
      .reverse();
  }, [meals, whoopEntries]);

  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('today');

  // Calculate yesterday's calories
  const yesterdayCalories = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    return meals
      .filter((meal) => meal.date === yesterdayStr)
      .reduce((sum, meal) => sum + meal.calories, 0);
  }, [meals]);

  const filteredMeals = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return meals.filter((meal) => {
      const matchesSearch = meal.food.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesTime = true;
      if (timeFilter === 'today') {
        matchesTime = meal.date === today;
      } else if (timeFilter === 'week') {
        matchesTime = new Date(meal.date) >= weekStart;
      } else if (timeFilter === 'month') {
        matchesTime = new Date(meal.date) >= monthStart;
      }
      
      return matchesSearch && matchesTime;
    });
  }, [meals, searchQuery, timeFilter]);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Track your nutrition and fitness progress</p>
      </div>

      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
      />

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="h-5 w-5 text-primary" />
            Meals ({filteredMeals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMeals.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchQuery ? 'No meals match your search.' : 'No meals logged. Start tracking!'}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredMeals.map((meal: Meal) => (
                <div
                  key={meal.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{meal.food}</p>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {meal.time}
                    </span>
                  </div>
                  <span className="font-semibold text-primary shrink-0 ml-2">{meal.calories} cal</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <StatsCards weightMeasurementInterval={settings.weight_measurement_interval} dailySummary={summary} recoveryScore={latestRecoveryScore} />

      <div className="grid lg:grid-cols-4 gap-6">
        <CalorieGoalProgress 
          current={getTodayCalories()} 
          goal={effectiveGoal} 
          onGoalChange={updateCalorieGoal}
          autoMode={autoMode}
          dayType={autoMode ? (isGymDay ? 'gym' : 'rest') : undefined}
        />
        <YesterdayStatus 
          yesterdayCalories={yesterdayCalories} 
          goal={yesterdayGoal} 
        />
        <WeightIntervalSetting
          interval={settings.weight_measurement_interval}
          onIntervalChange={updateWeightInterval}
        />
        <MealTimeChart data={getMealsByTimeOfDay()} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <CalorieChart data={calorieChartData} notesMap={notesMap} />
        <WorkoutDurationChart data={getWeeklyWorkoutData()} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <WeightChart data={weightChartData} notesMap={notesMap} />
        <WaistChart data={waistChartData} notesMap={notesMap} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SleepChart data={sleepChartData} notesMap={notesMap} />
        <CalorieBalanceChart data={calorieBalanceData} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <GoalsCard />
      </div>
    </div>
  );
};

export default Dashboard;
