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

export type DayStatus = 'under' | 'within' | 'over' | null;

const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Adherence over the last `windowDays` UTC dates ending today (oldest first).
 * Days without a status are unlogged and break the streak. Today counts toward
 * the streak only once it is within range, since it is still in progress.
 */
export const adherenceSummary = (statusByDate: Record<string, DayStatus>, today: string, windowDays = 30) => {
  const cells = Array.from({ length: windowDays }, (_, i) => {
    const date = shiftDate(today, i - windowDays + 1);
    return { date, status: statusByDate[date] ?? null };
  });
  let streak = 0;
  let cursor = statusByDate[today] === 'within' ? today : shiftDate(today, -1);
  while (statusByDate[cursor] === 'within') { streak++; cursor = shiftDate(cursor, -1); }
  const rate = (n: number) => {
    const slice = cells.slice(-n).filter((c) => c.status);
    const hit = slice.filter((c) => c.status === 'within').length;
    return { hit, logged: slice.length, pct: slice.length ? Math.round((hit / slice.length) * 100) : null };
  };
  return { cells, streak, week: rate(7), month: rate(windowDays) };
};
