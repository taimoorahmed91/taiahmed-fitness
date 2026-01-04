import { useState, useEffect } from 'react';
import { Meal } from '@/types';

const getMealPeriod = (time: string): string => {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour >= 5 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 14) return 'Lunch';
  if (hour >= 14 && hour < 18) return 'Afternoon';
  return 'Evening';
};

export const useMeals = () => {
  const [meals, setMeals] = useState<Meal[]>(() => {
    const stored = localStorage.getItem('fittrack-meals');
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem('fittrack-meals', JSON.stringify(meals));
  }, [meals]);

  const addMeal = (meal: Omit<Meal, 'id'>) => {
    const newMeal: Meal = {
      ...meal,
      id: crypto.randomUUID(),
    };
    setMeals((prev) => [...prev, newMeal]);
  };

  const deleteMeal = (id: string) => {
    setMeals((prev) => prev.filter((meal) => meal.id !== id));
  };

  const getTodayCalories = () => {
    const today = new Date().toISOString().split('T')[0];
    return meals
      .filter((meal) => meal.date === today)
      .reduce((sum, meal) => sum + meal.calories, 0);
  };

  const getWeeklyData = () => {
    const days: { date: string; calories: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayCalories = meals
        .filter((meal) => meal.date === dateStr)
        .reduce((sum, meal) => sum + meal.calories, 0);
      days.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
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

  return { meals, addMeal, deleteMeal, getTodayCalories, getWeeklyData, getMealsByTimeOfDay };
};
