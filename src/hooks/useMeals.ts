import { useState, useEffect } from 'react';
import { Meal } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const getMealPeriod = (time: string): string => {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour >= 5 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 14) return 'Lunch';
  if (hour >= 14 && hour < 18) return 'Afternoon';
  return 'Evening';
};

export const useMeals = () => {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMeals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMeals([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('fittrack_meals')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('time', { ascending: false });

      if (error) throw error;

      const formattedMeals: Meal[] = (data || []).map((meal) => ({
        id: meal.id,
        food: meal.food,
        calories: meal.calories,
        time: meal.time,
        date: meal.date,
      }));

      setMeals(formattedMeals);
    } catch (error) {
      console.error('Error fetching meals:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch meals',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeals();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchMeals();
    });

    return () => subscription.unsubscribe();
  }, []);

  const addMeal = async (meal: Omit<Meal, 'id'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to add meals',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase
        .from('fittrack_meals')
        .insert({
          user_id: user.id,
          food: meal.food,
          calories: meal.calories,
          time: meal.time,
          date: meal.date,
        })
        .select()
        .single();

      if (error) throw error;

      const newMeal: Meal = {
        id: data.id,
        food: data.food,
        calories: data.calories,
        time: data.time,
        date: data.date,
      };

      setMeals((prev) => [newMeal, ...prev]);
    } catch (error) {
      console.error('Error adding meal:', error);
      toast({
        title: 'Error',
        description: 'Failed to add meal',
        variant: 'destructive',
      });
    }
  };

  const updateMeal = async (id: string, updates: Partial<Omit<Meal, 'id'>>) => {
    try {
      const { error } = await supabase
        .from('fittrack_meals')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setMeals((prev) =>
        prev.map((meal) => (meal.id === id ? { ...meal, ...updates } : meal))
      );

      toast({
        title: 'Success',
        description: 'Meal updated successfully',
      });
    } catch (error) {
      console.error('Error updating meal:', error);
      toast({
        title: 'Error',
        description: 'Failed to update meal',
        variant: 'destructive',
      });
    }
  };

  const deleteMeal = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fittrack_meals')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMeals((prev) => prev.filter((meal) => meal.id !== id));
    } catch (error) {
      console.error('Error deleting meal:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete meal',
        variant: 'destructive',
      });
    }
  };

  const getTodayCalories = () => {
    const today = new Date().toISOString().split('T')[0];
    return meals
      .filter((meal) => meal.date === today)
      .reduce((sum, meal) => sum + meal.calories, 0);
  };

  const getWeeklyData = () => {
    const days: { date: string; fullDate: string; calories: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayCalories = meals
        .filter((meal) => meal.date === dateStr)
        .reduce((sum, meal) => sum + meal.calories, 0);
      days.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        fullDate: dateStr,
        calories: dayCalories,
      });
    }
    return days;
  };

  const getMealsByTimeOfDay = () => {
    const periods: Record<string, { calories: number; count: number }> = {
      Morning: { calories: 0, count: 0 },
      Lunch: { calories: 0, count: 0 },
      Afternoon: { calories: 0, count: 0 },
      Evening: { calories: 0, count: 0 },
    };

    meals.forEach((meal) => {
      const period = getMealPeriod(meal.time);
      periods[period].calories += meal.calories;
      periods[period].count += 1;
    });

    return Object.entries(periods).map(([name, data]) => ({
      name,
      calories: data.calories,
      count: data.count,
    }));
  };

  return { meals, loading, addMeal, updateMeal, deleteMeal, getTodayCalories, getWeeklyData, getMealsByTimeOfDay, refetch: fetchMeals };
};
