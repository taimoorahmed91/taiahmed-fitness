import { useState, useEffect } from 'react';
import { Meal } from '@/types';

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

  return { meals, addMeal, deleteMeal, getTodayCalories, getWeeklyData };
};
