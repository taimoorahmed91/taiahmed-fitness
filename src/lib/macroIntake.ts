// What a day of meals really tells us about one macro (calories, protein, carbs). Pure (tests/macroIntake.test.ts).
//
// The Dashboard used to add up a day's meals and write 0 when there were none, or when no meal had a protein / carb
// value. A chart then drew "0 g eaten" for a day nothing was logged, which is not the same fact as "ate 0 g".
//
//   kind          meaning                                                    value   selectable / plotted
//   no-meals      no meal logged that day                                    null    no
//   unrecorded    meals logged, but none has this macro written down         null    no
//   partial       some meals have it, some do not (a sum would understate)   null    no
//   recorded      every meal that day has it (an explicit 0 counts)          sum     yes
//
// "partial" follows the same rule as the cross-metric insights: a day counts only when EVERY meal has the value.
// Calories are required on a meal, so a day with meals is always `recorded` for calories. Never use `value > 0` to
// decide whether a day was observed: an explicit 0 is an observation, and a day with no meals is not.

export type IntakeKind = 'no-meals' | 'unrecorded' | 'partial' | 'recorded';
export type IntakeMacro = 'calories' | 'protein' | 'carbs';

export interface MealMacros {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
}

export interface DayIntake {
  /** The day's total, or null when the day was not fully observed. */
  value: number | null;
  kind: IntakeKind;
  mealCount: number;
}

const known = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const dayMacroIntake = (dayMeals: readonly MealMacros[], macro: IntakeMacro): DayIntake => {
  const mealCount = dayMeals.length;
  if (mealCount === 0) return { value: null, kind: 'no-meals', mealCount };
  const values = dayMeals.map((m) => m[macro]);
  const withValue = values.filter(known);
  if (withValue.length === 0) return { value: null, kind: 'unrecorded', mealCount };
  if (withValue.length < mealCount) return { value: null, kind: 'partial', mealCount };
  return { value: withValue.reduce((sum, v) => sum + v, 0), kind: 'recorded', mealCount };
};

/** True only for a day whose total is a real observation (including an explicit 0). */
export const isObservedIntake = (kind: IntakeKind | undefined): boolean => kind === 'recorded';
