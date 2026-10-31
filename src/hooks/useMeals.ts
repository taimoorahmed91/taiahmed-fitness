import { Meal } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { getSessionUser } from '@/lib/authSession';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { getMealDate } from '@/lib/mealDateTime';
import { useSharedTable } from '@/lib/sharedTable';
import { byDateTimeDesc, upsertSorted, removeById, errorText } from '@/lib/sharedData';

const getMealPeriod = (time: string): string => {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 8) return 'Overnight';
  if (hour < 11) return 'Morning';
  if (hour < 14) return 'Midday';
  if (hour < 18) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Late night';
};

const mapMeal = (meal: Tables<'fittrack_meals'>): Meal => ({
  id: meal.id,
  food: meal.food,
  calories: meal.calories,
  protein: meal.protein ?? null,
  carbs: meal.carbs ?? null,
  time: meal.time,
  date: meal.date,
});

const MEALS_PAGE_SIZE = 1000;

/** Loads every meal for the user. Paged, because Supabase returns at most 1000 rows per request. */
const fetchAllMeals = async (userId: string): Promise<Meal[]> => {
  const rows: Tables<'fittrack_meals'>[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error } = await supabase
      .from('fittrack_meals')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .range(from, from + MEALS_PAGE_SIZE - 1);

    if (error) throw error;

    if (page && page.length > 0) {
      rows.push(...page);
      from += MEALS_PAGE_SIZE;
      hasMore = page.length === MEALS_PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return rows.map(mapMeal);
};

export const useMeals = () => {
  // One shared query per signed-in user: every component calling useMeals reads the same rows.
  // `lastFetchedAt` is the time of the last SUCCESSFUL meals fetch (local edits do not move it).
  const { data: meals, loading, lastFetchedAt, refetch, patch, invalidate } = useSharedTable<Meal>({
    table: 'meals',
    fetchRows: fetchAllMeals,
    errorMessage: 'Failed to fetch meals',
    errorToastKey: 'meals',
  });

  /**
   * Mutation contract (addMeal / updateMeal / deleteMeal): resolves `true` ONLY when the database confirmed the
   * change by returning the affected row, and `false` for anything else (no signed-in user, a database error, or
   * zero rows affected, e.g. the meal is gone or row-level security refused it). Never rejects, and the failure
   * toast is already shown, so a caller only has to keep its draft on screen when it gets `false`.
   * After a zero-row update/delete the list is refetched so the screen matches the server.
   */
  const addMeal = async (meal: Omit<Meal, 'id'>): Promise<boolean> => {
    try {
      const user = await getSessionUser();
      if (!user) {
        toast.error('You must be logged in to add meals');
        return false;
      }

      const { data, error } = await supabase
        .from('fittrack_meals')
        .insert({
          user_id: user.id,
          food: meal.food,
          calories: meal.calories,
          protein: meal.protein ?? null,
          carbs: meal.carbs ?? null,
          time: meal.time,
          date: meal.date,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No row returned');

      const newMeal = mapMeal(data);
      patch((prev) => upsertSorted(prev, newMeal, byDateTimeDesc), user.id);
      logActivity({ action: 'create', category: 'meal', details: { food: meal.food, calories: meal.calories, time: meal.time, date: meal.date } });
      return true;
    } catch (error) {
      console.error('Error adding meal:', error);
      toast.error('Failed to add meal');
      logActivity({ action: 'create', category: 'meal', status: 'error', error_message: errorText(error, 'Failed to add meal'), details: { food: meal.food, calories: meal.calories } });
      return false;
    }
  };

  const updateMeal = async (id: string, updates: Partial<Omit<Meal, 'id'>>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('fittrack_meals')
        .update(updates as TablesUpdate<'fittrack_meals'>)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // No row came back: it no longer exists or this account may not change it (e.g. the read-only demo).
        // That is not a success. Refresh so the list matches the server.
        void invalidate();
        toast.error('Could not update this meal. It may have been removed, or this account cannot change it.');
        logActivity({ action: 'update', category: 'meal', status: 'error', error_message: 'No row updated', details: { id } });
        return false;
      }
      // The row the database kept is the truth (it also settles any field the edit left out).
      const saved = mapMeal(data);
      patch((prev) => upsertSorted(prev, saved, byDateTimeDesc));
      toast.success('Meal updated successfully');
      logActivity({ action: 'update', category: 'meal', details: { id, ...updates } });
      return true;
    } catch (error) {
      console.error('Error updating meal:', error);
      toast.error('Failed to update meal');
      logActivity({ action: 'update', category: 'meal', status: 'error', error_message: errorText(error, 'Failed to update meal'), details: { id } });
      return false;
    }
  };

  /** Resolves `true` only when a row was really deleted. */
  const deleteMeal = async (id: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('fittrack_meals').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        void invalidate();
        toast.error('Could not delete this meal. It may already be gone, or this account cannot delete it.');
        logActivity({ action: 'delete', category: 'meal', status: 'error', error_message: 'No row deleted', details: { id } });
        return false;
      }
      patch((prev) => removeById(prev, id));
      logActivity({ action: 'delete', category: 'meal', details: { id } });
      return true;
    } catch (error) {
      console.error('Error deleting meal:', error);
      toast.error('Failed to delete meal');
      logActivity({ action: 'delete', category: 'meal', status: 'error', error_message: errorText(error, 'Failed to delete meal'), details: { id } });
      return false;
    }
  };

  const getTodayCalories = () => {
    const today = getMealDate();
    return meals.filter((meal) => meal.date === today).reduce((sum, meal) => sum + meal.calories, 0);
  };

  const getTodayProtein = () => {
    const today = getMealDate();
    return meals.filter((meal) => meal.date === today).reduce((sum, meal) => sum + (meal.protein || 0), 0);
  };

  const getTodayCarbs = () => {
    const today = getMealDate();
    return meals.filter((meal) => meal.date === today).reduce((sum, meal) => sum + (meal.carbs || 0), 0);
  };

  const getWeeklyData = () => {
    const days: { date: string; fullDate: string; calories: number; protein: number; carbs: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = getMealDate(date);
      const dayMeals = meals.filter((meal) => meal.date === dateStr);
      const dayCalories = dayMeals.reduce((sum, meal) => sum + meal.calories, 0);
      const dayProtein = dayMeals.reduce((sum, meal) => sum + (meal.protein || 0), 0);
      const dayCarbs = dayMeals.reduce((sum, meal) => sum + (meal.carbs || 0), 0);
      days.push({ date: date.toLocaleDateString('en-US', { weekday: 'short' }), fullDate: dateStr, calories: dayCalories, protein: Math.round(dayProtein), carbs: Math.round(dayCarbs) });
    }
    return days;
  };

  const getMealsByTimeOfDay = (days: 7 | 14 | 30 | 90) => {
    const today = getMealDate();
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const since = getMealDate(start);
    const periods: Record<string, { calories: number; count: number }> = {
      Overnight: { calories: 0, count: 0 },
      Morning: { calories: 0, count: 0 },
      Midday: { calories: 0, count: 0 },
      Afternoon: { calories: 0, count: 0 },
      Evening: { calories: 0, count: 0 },
      'Late night': { calories: 0, count: 0 },
    };
    meals.filter((meal) => meal.date >= since && meal.date <= today).forEach((meal) => {
      const period = getMealPeriod(meal.time);
      periods[period].calories += meal.calories;
      periods[period].count += 1;
    });
    return Object.entries(periods).map(([name, data]) => ({ name, calories: data.calories, count: data.count }));
  };

  return { meals, loading, lastFetchedAt, addMeal, updateMeal, deleteMeal, getTodayCalories, getTodayProtein, getTodayCarbs, getWeeklyData, getMealsByTimeOfDay, refetch };
};
