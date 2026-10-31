// Pure builder for the dashboard "Calorie Balance" rows. No React, no Date.now(): `today` is passed in so tests are exact.
import { isIsoDate, shiftIsoDate } from './chartRange.ts';

export interface BalanceWhoopEntry {
  /** UTC calendar date of the WHOOP cycle's end (YYYY-MM-DD). The real cycle date. */
  date: string;
  /** When the row was written. Batched imports and the demo seed share one value, so it is never a calendar date for the cycle. */
  created_at?: string;
  cycle_end_timestamp?: string | null;
  kilojoule: number | null;
}

export interface BalanceMeal { date: string; calories: number }
export interface CalorieBalanceRow { date: string; consumed: number; burned: number; balance: number }

export const KJ_PER_KCAL = 4.184;
/** How many calendar days (including today) the dashboard keeps. */
export const BALANCE_WINDOW_DAYS = 90;

/**
 * The day a WHOOP cycle's burn belongs to. A cycle that ends on UTC date D is the day that was just lived,
 * D - 1, so its burn is compared with the meals eaten on D - 1. (CalorieHistory states the same rule:
 * "WHOOP burn for a day comes from the cycle recorded the following day".) Pure string/UTC maths, no local time.
 */
export const balanceDateForCycle = (cycleDate: string): string => shiftIsoDate(cycleDate, -1);

/** Later cycle wins when one calendar date has more than one WHOOP row. */
const recency = (e: BalanceWhoopEntry) => e.cycle_end_timestamp ?? e.created_at ?? '';

/**
 * One row per day that has both a WHOOP burn and logged meals, oldest first.
 * Dates come from each entry's own `date`; `created_at` is never read, so rows written in one batch
 * still land on their own distinct days. Only genuinely identical cycle dates are merged.
 */
export const buildCalorieBalanceRows = (
  whoopEntries: BalanceWhoopEntry[],
  meals: BalanceMeal[],
  today: string,
): CalorieBalanceRow[] => {
  const windowStart = shiftIsoDate(today, -(BALANCE_WINDOW_DAYS - 1));

  const consumedByDate = new Map<string, number>();
  for (const meal of meals) {
    if (meal.date >= windowStart && meal.date <= today) consumedByDate.set(meal.date, (consumedByDate.get(meal.date) ?? 0) + meal.calories);
  }

  const latestPerCycleDate = new Map<string, BalanceWhoopEntry>();
  for (const entry of whoopEntries) {
    if (entry.kilojoule == null || !isIsoDate(entry.date)) continue;
    const current = latestPerCycleDate.get(entry.date);
    if (!current || recency(entry) >= recency(current)) latestPerCycleDate.set(entry.date, entry);
  }

  const rows: CalorieBalanceRow[] = [];
  for (const entry of latestPerCycleDate.values()) {
    const date = balanceDateForCycle(entry.date);
    if (date < windowStart || date > today || !consumedByDate.has(date)) continue;
    const consumed = consumedByDate.get(date) ?? 0;
    const burned = Math.round(Number(entry.kilojoule) / KJ_PER_KCAL);
    rows.push({ date, consumed, burned, balance: burned - consumed });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
};
