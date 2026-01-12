import { useMemo } from 'react';
import { useMeals } from './useMeals';
import { useGymSessions } from './useGymSessions';
import { useWeight } from './useWeight';
import { useSleep } from './useSleep';
import { useUserSettings } from './useUserSettings';
import { GymSession, Meal } from '@/types';
import { SleepEntry } from './useSleep';
import { WeightEntry } from './useWeight';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ReportStats {
  avgCalories: number;
  totalWorkouts: number;
  avgWorkoutDuration: number;
  avgSleepHours: number;
  avgWeight: number;
  weightChange: number;
  goalsMetDays: number;
  totalDays: number;
  calorieGoal: number;
}

export interface CorrelationInsight {
  title: string;
  description: string;
  correlation: 'positive' | 'negative' | 'neutral';
  value?: string;
}

export interface DailyData {
  date: string;
  calories: number;
  workoutMinutes: number;
  sleepHours: number;
  weight: number | null;
}

// Helper functions to avoid date-fns circular dependency issues
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatShortDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
};

const isWithinRange = (dateStr: string, from: Date, to: Date): boolean => {
  const date = new Date(dateStr);
  const startOfFrom = new Date(from);
  startOfFrom.setHours(0, 0, 0, 0);
  const endOfTo = new Date(to);
  endOfTo.setHours(23, 59, 59, 999);
  return date >= startOfFrom && date <= endOfTo;
};

export const useReportData = (dateRange: DateRange) => {
  const { meals } = useMeals();
  const { sessions } = useGymSessions();
  const { entries: weightEntries } = useWeight();
  const { entries: sleepEntries } = useSleep();
  const { settings } = useUserSettings();

  const filteredData = useMemo(() => {
    const filteredMeals = meals.filter((m: Meal) =>
      isWithinRange(m.date, dateRange.from, dateRange.to)
    );

    const filteredSessions = sessions.filter((s: GymSession) =>
      isWithinRange(s.date, dateRange.from, dateRange.to)
    );

    const filteredWeight = weightEntries.filter((w: WeightEntry) =>
      isWithinRange(w.date, dateRange.from, dateRange.to)
    );

    const filteredSleep = sleepEntries.filter((s: SleepEntry) =>
      isWithinRange(s.date, dateRange.from, dateRange.to)
    );

    return { filteredMeals, filteredSessions, filteredWeight, filteredSleep };
  }, [meals, sessions, weightEntries, sleepEntries, dateRange]);

  const dailyData = useMemo((): DailyData[] => {
    const days: DailyData[] = [];
    const { filteredMeals, filteredSessions, filteredWeight, filteredSleep } = filteredData;

    const currentDate = new Date(dateRange.from);
    while (currentDate <= dateRange.to) {
      const dateStr = formatDate(currentDate);

      const dayCalories = filteredMeals
        .filter((m: Meal) => m.date === dateStr)
        .reduce((sum: number, m: Meal) => sum + m.calories, 0);

      const dayWorkout = filteredSessions
        .filter((s: GymSession) => s.date === dateStr)
        .reduce((sum: number, s: GymSession) => sum + s.duration, 0);

      const daySleep = filteredSleep.find((s: SleepEntry) => s.date === dateStr)?.hours ?? 0;
      const dayWeight = filteredWeight.find((w: WeightEntry) => w.date === dateStr)?.weight ?? null;

      days.push({
        date: dateStr,
        calories: dayCalories,
        workoutMinutes: dayWorkout,
        sleepHours: daySleep,
        weight: dayWeight,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
  }, [filteredData, dateRange]);

  const stats = useMemo((): ReportStats => {
    const { filteredSessions, filteredWeight, filteredSleep } = filteredData;

    const totalDays = dailyData.length;
    const daysWithCalories = dailyData.filter((d) => d.calories > 0).length;
    const avgCalories = daysWithCalories > 0
      ? Math.round(dailyData.reduce((sum, d) => sum + d.calories, 0) / daysWithCalories)
      : 0;

    const totalWorkouts = filteredSessions.length;
    const avgWorkoutDuration = totalWorkouts > 0
      ? Math.round(filteredSessions.reduce((sum: number, s: GymSession) => sum + s.duration, 0) / totalWorkouts)
      : 0;

    const daysWithSleep = filteredSleep.length;
    const avgSleepHours = daysWithSleep > 0
      ? Number((filteredSleep.reduce((sum: number, s: SleepEntry) => sum + s.hours, 0) / daysWithSleep).toFixed(1))
      : 0;

    const weightsWithData = filteredWeight.filter((w: WeightEntry) => w.weight > 0);
    const avgWeight = weightsWithData.length > 0
      ? Number((weightsWithData.reduce((sum: number, w: WeightEntry) => sum + w.weight, 0) / weightsWithData.length).toFixed(1))
      : 0;

    const sortedWeights = [...weightsWithData].sort((a, b) => a.date.localeCompare(b.date));
    const weightChange = sortedWeights.length >= 2
      ? Number((sortedWeights[sortedWeights.length - 1].weight - sortedWeights[0].weight).toFixed(1))
      : 0;

    const goalsMetDays = dailyData.filter(
      (d) => d.calories > 0 && d.calories <= settings.daily_calorie_goal
    ).length;

    return {
      avgCalories,
      totalWorkouts,
      avgWorkoutDuration,
      avgSleepHours,
      avgWeight,
      weightChange,
      goalsMetDays,
      totalDays,
      calorieGoal: settings.daily_calorie_goal,
    };
  }, [filteredData, dailyData, settings.daily_calorie_goal]);

  const correlationInsights = useMemo((): CorrelationInsight[] => {
    const insights: CorrelationInsight[] = [];
    const { filteredMeals } = filteredData;

    // Sleep vs Workout Duration correlation
    const daysWithBoth = dailyData.filter((d) => d.sleepHours > 0 && d.workoutMinutes > 0);
    if (daysWithBoth.length >= 3) {
      const avgSleep = daysWithBoth.reduce((sum, d) => sum + d.sleepHours, 0) / daysWithBoth.length;
      const goodSleepDays = daysWithBoth.filter((d) => d.sleepHours >= avgSleep);
      const poorSleepDays = daysWithBoth.filter((d) => d.sleepHours < avgSleep);

      const goodSleepWorkout = goodSleepDays.length > 0
        ? goodSleepDays.reduce((sum, d) => sum + d.workoutMinutes, 0) / goodSleepDays.length
        : 0;
      const poorSleepWorkout = poorSleepDays.length > 0
        ? poorSleepDays.reduce((sum, d) => sum + d.workoutMinutes, 0) / poorSleepDays.length
        : 0;

      if (goodSleepWorkout > poorSleepWorkout * 1.15 && poorSleepWorkout > 0) {
        insights.push({
          title: 'Sleep Boosts Workouts',
          description: `On days with ${avgSleep.toFixed(1)}+ hours of sleep, you work out ${Math.round(goodSleepWorkout - poorSleepWorkout)} minutes longer on average.`,
          correlation: 'positive',
          value: `+${Math.round(((goodSleepWorkout - poorSleepWorkout) / poorSleepWorkout) * 100)}%`,
        });
      }
    }

    // Meal timing and calorie intake
    const morningMeals = filteredMeals.filter((m: Meal) => {
      const hour = parseInt(m.time.split(':')[0], 10);
      return hour >= 6 && hour < 10;
    });
    const totalMeals = filteredMeals.length;

    if (totalMeals >= 5) {
      const morningRatio = morningMeals.length / totalMeals;
      if (morningRatio >= 0.2) {
        const avgMorningCal = morningMeals.reduce((sum: number, m: Meal) => sum + m.calories, 0) / morningMeals.length;
        insights.push({
          title: 'Early Eater',
          description: `${Math.round(morningRatio * 100)}% of your meals are before 10 AM, averaging ${Math.round(avgMorningCal)} calories.`,
          correlation: 'positive',
          value: `${Math.round(morningRatio * 100)}%`,
        });
      } else {
        insights.push({
          title: 'Late Starter',
          description: 'Most of your meals are consumed after 10 AM. Consider adding breakfast for sustained energy.',
          correlation: 'neutral',
        });
      }
    }

    // Workout consistency
    const workoutDays = dailyData.filter((d) => d.workoutMinutes > 0).length;
    const workoutConsistency = stats.totalDays > 0 ? (workoutDays / stats.totalDays) * 100 : 0;
    if (workoutConsistency >= 50) {
      insights.push({
        title: 'Workout Warrior',
        description: `You worked out on ${Math.round(workoutConsistency)}% of days in this period. Great consistency!`,
        correlation: 'positive',
        value: `${Math.round(workoutConsistency)}%`,
      });
    } else if (workoutConsistency > 0) {
      insights.push({
        title: 'Room to Grow',
        description: `You worked out on ${workoutDays} out of ${stats.totalDays} days. Try adding one more workout per week!`,
        correlation: 'negative',
        value: `${Math.round(workoutConsistency)}%`,
      });
    }

    // Calorie goal achievement
    if (stats.goalsMetDays > 0) {
      const goalPercentage = Math.round((stats.goalsMetDays / stats.totalDays) * 100);
      insights.push({
        title: 'Goal Achievement',
        description: `You stayed within your ${stats.calorieGoal} calorie goal on ${stats.goalsMetDays} days (${goalPercentage}%).`,
        correlation: goalPercentage >= 60 ? 'positive' : goalPercentage >= 30 ? 'neutral' : 'negative',
        value: `${goalPercentage}%`,
      });
    }

    return insights;
  }, [filteredData, dailyData, stats]);

  const chartData = useMemo(() => {
    return dailyData.map((d) => ({
      date: formatShortDate(d.date),
      calories: d.calories,
      workout: d.workoutMinutes,
      sleep: d.sleepHours,
    }));
  }, [dailyData]);

  return {
    stats,
    dailyData,
    chartData,
    correlationInsights,
  };
};
