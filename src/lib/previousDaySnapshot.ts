// What the Previous Day Snapshot says, as plain data. No React, so it can be tested on its own.
//
// Rules (they come from how the app tracks days, not from this file):
//  - "No data" means there are NO meals for that day. It is decided from the meal COUNT, never from calories === 0:
//    a day can have meals that add up to 0 cal and that is still data.
//  - A finished calendar day does not mean everything was logged, so nothing here ever says a day is finished or fully recorded.
//  - The target range is the one the Dashboard already resolves for that exact day (gym day or rest day, plus extra
//    activity calories). Its base numbers are the CURRENT target settings: the app keeps no history of settings.

import { STATUS_META, describeTarget, formatTargetRange, type TargetStatus } from '@/lib/targetStatus';
import { UNIT_LABEL, formatNumber } from '@/lib/chartTheme';
import { formatLongDay } from '@/lib/dayLabels';

export type SnapshotDayType = 'gym' | 'rest';

export interface PreviousDaySnapshotInput {
  /** The UTC calendar day (YYYY-MM-DD) the numbers belong to. */
  date: string;
  /** How many meals are logged on that day (same `meal.date === date` rule as the calories). */
  mealCount: number;
  /** Total calories of those meals. */
  calories: number;
  goal: number;
  goalMax?: number;
  /** Only when the person uses separate gym / rest targets; leave out for a single daily goal. */
  dayType?: SnapshotDayType;
  /** Calories from extra activities that day. Already included in goal / goalMax. */
  extraCalories?: number;
}

export interface NoDataSnapshot {
  kind: 'no-data';
  dateLabel: string;
  /** Shown where the calories would be. */
  headline: string;
  detail: string;
}

export interface LoggedSnapshot {
  kind: 'logged';
  dateLabel: string;
  calories: number;
  caloriesText: string;
  unit: string;
  status: Exclude<TargetStatus, 'none'>;
  /** "On target", "Under min", "Over max": the status in words. */
  statusLabel: string;
  /** "180 cal under your minimum", "On target", "130 cal over your maximum". */
  statusText: string;
  glyph: string;
  /** "2,000–2,200" */
  rangeText: string;
  /** "Target 2,000–2,200 cal · Rest day" */
  targetLine: string;
  dayTypeLabel: string | null;
  mealsText: string;
  extraNote: string | null;
  basisNote: string;
}

export type PreviousDaySnapshot = NoDataSnapshot | LoggedSnapshot;

export const DAY_TYPE_LABEL: Record<SnapshotDayType, string> = { gym: 'Gym day', rest: 'Rest day' };

/** Said once, in the details: the base numbers are today's settings, not a record of what they were yesterday. */
export const BASIS_NOTE = "Based on your current target settings, with yesterday's gym or rest day and extra activity applied.";

export const buildPreviousDaySnapshot = (input: PreviousDaySnapshotInput): PreviousDaySnapshot => {
  const dateLabel = formatLongDay(input.date);
  if (!(input.mealCount > 0)) {
    return { kind: 'no-data', dateLabel, headline: 'No data', detail: 'No meals logged' };
  }

  const unit = UNIT_LABEL.calories;
  const range = { min: input.goal, max: Math.max(input.goal, input.goalMax ?? input.goal) };
  const { status, label, text } = describeTarget(input.calories, range, unit);
  const meta = STATUS_META[status];
  const rangeText = formatTargetRange(range);
  const dayTypeLabel = input.dayType ? DAY_TYPE_LABEL[input.dayType] : null;
  const extra = input.extraCalories && input.extraCalories > 0 ? Math.round(input.extraCalories) : 0;

  return {
    kind: 'logged',
    dateLabel,
    calories: input.calories,
    caloriesText: formatNumber(Math.round(input.calories), 0),
    unit,
    // describeTarget never returns 'none' here: it only does for a value-less day, which is the no-data case above.
    status: status as Exclude<TargetStatus, 'none'>,
    statusLabel: label,
    statusText: status === 'within' ? label : text,
    glyph: meta.glyph,
    rangeText,
    targetLine: `Target ${rangeText} ${unit}${dayTypeLabel ? ` \u00b7 ${dayTypeLabel}` : ''}`,
    dayTypeLabel,
    mealsText: `${input.mealCount} ${input.mealCount === 1 ? 'meal' : 'meals'} logged`,
    extraNote: extra > 0 ? `Includes +${formatNumber(extra, 0)} ${unit} for extra activity.` : null,
    basisNote: BASIS_NOTE,
  };
};
