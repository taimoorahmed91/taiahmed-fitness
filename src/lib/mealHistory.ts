/**
 * Pure helpers behind the grouped Meals history: newest-first ordering, grouping by calendar day,
 * and day totals that never claim more than the data supports.
 *
 * Rules:
 *  - A missing protein/carb value is unknown, not zero. A day's macro total reports how many of
 *    that day's meals had the value ("3 of 4 meals"), and is hidden when none did.
 *  - When any filter is active the rows are only part of the day, so a day is described as
 *    "N of M meals shown" and no totals are produced for it.
 */
import type { Meal } from '@/types';

export interface MealDayGroup {
  key: string;
  date: string;
  items: Meal[];
}

/** Newest day first, and within a day the latest time first. Stable for equal keys. */
export const sortMealsNewestFirst = (meals: readonly Meal[]): Meal[] =>
  [...meals].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

/** Splits an already-sorted list into one group per calendar date, keeping order. */
export const groupMealsByDate = (sorted: readonly Meal[]): MealDayGroup[] => {
  const groups: MealDayGroup[] = [];
  for (const meal of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === meal.date) last.items.push(meal);
    else groups.push({ key: meal.date, date: meal.date, items: [meal] });
  }
  return groups;
};

export const countMealsByDate = (meals: readonly Meal[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const meal of meals) counts[meal.date] = (counts[meal.date] ?? 0) + 1;
  return counts;
};

export interface MacroCoverage {
  /** Sum of the meals that have a value, rounded to 1 decimal. null when none have one. */
  total: number | null;
  /** How many meals have a value. */
  logged: number;
  /** How many meals the day has. */
  of: number;
  /** Every meal has a value, so `total` is the real day total. */
  complete: boolean;
}

export interface MealDayTotals {
  count: number;
  calories: number;
  protein: MacroCoverage;
  carbs: MacroCoverage;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const coverage = (meals: readonly Meal[], pick: (meal: Meal) => number | null | undefined): MacroCoverage => {
  const known = meals.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return {
    total: known.length > 0 ? round1(known.reduce((sum, v) => sum + v, 0)) : null,
    logged: known.length,
    of: meals.length,
    complete: meals.length > 0 && known.length === meals.length,
  };
};

export const summarizeMealDay = (meals: readonly Meal[]): MealDayTotals => ({
  count: meals.length,
  calories: meals.reduce((sum, m) => sum + (Number.isFinite(m.calories) ? m.calories : 0), 0),
  protein: coverage(meals, (m) => m.protein),
  carbs: coverage(meals, (m) => m.carbs),
});

export type MealDayContext =
  | { kind: 'totals'; totals: MealDayTotals }
  | { kind: 'filtered'; shown: number; ofDay: number };

/** Whole-day totals when the day is shown in full, otherwise honest "N of M shown" context. */
export const describeMealDay = (shown: readonly Meal[], mealsOnDay: number, filtersActive: boolean): MealDayContext =>
  filtersActive
    ? { kind: 'filtered', shown: shown.length, ofDay: mealsOnDay }
    : { kind: 'totals', totals: summarizeMealDay(shown) };

/** Meals the "Calories" sort orders, highest or lowest first. Flat: not grouped by day. */
export const sortMealsByCalories = (meals: readonly Meal[], order: 'asc' | 'desc'): Meal[] =>
  [...meals].sort((a, b) => (order === 'asc' ? a.calories - b.calories : b.calories - a.calories));

/** "1,840" */
export const formatCount = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** "142 g protein", "142 g protein (3 of 4 meals)", or null when no meal has the value. */
export const describeMacroTotal = (label: 'protein' | 'carbs', macro: MacroCoverage): string | null => {
  if (macro.total === null) return null;
  const base = `${formatCount(macro.total)} g ${label}`;
  return macro.complete ? base : `${base} (${macro.logged} of ${macro.of} meals)`;
};
