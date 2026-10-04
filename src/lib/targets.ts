import type { PersonalData } from '@/hooks/usePersonalData';

export interface Range {
  min: number;
  max: number;
}

/** Calorie min/max for a day based on gym/rest targets, falling back to the manual daily goal. Extras are added to both. */
export const resolveCalorieRange = (
  pd: PersonalData,
  fallback: number,
  workedOut: boolean,
  extras: number
): Range & { auto: boolean } => {
  const gym = pd.gym_day_calorie_target != null
    ? { min: pd.gym_day_calorie_target, max: pd.gym_day_calorie_target_max ?? pd.gym_day_calorie_target }
    : null;
  const rest = pd.rest_day_calorie_target != null
    ? { min: pd.rest_day_calorie_target, max: pd.rest_day_calorie_target_max ?? pd.rest_day_calorie_target }
    : null;
  const auto = gym != null || rest != null;
  let r: Range = { min: fallback, max: fallback };
  if (auto) r = (workedOut ? gym ?? rest : rest ?? gym)!;
  return { min: r.min + extras, max: Math.max(r.min, r.max) + extras, auto };
};

/** Macro min/max grams from min/max multipliers and body weight. */
export const macroRange = (
  minMult: number | null,
  maxMult: number | null,
  weight: number | null
): Range | null => {
  if (!minMult || !weight) return null;
  const max = maxMult && maxMult >= minMult ? maxMult : minMult;
  return { min: minMult * weight, max: max * weight };
};

export const rangeStatus = (value: number, r: Range): 'under' | 'within' | 'over' =>
  value < r.min ? 'under' : value > r.max ? 'over' : 'within';

export const formatRange = (r: Range) =>
  Math.round(r.min) === Math.round(r.max)
    ? `${Math.round(r.min)}`
    : `${Math.round(r.min)}–${Math.round(r.max)}`;
