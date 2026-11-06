// How lines are drawn between points, per chart. Pure and React free.
//
// Recharts offers many curve types. 'natural', 'basis' and 'cardinal' can overshoot (a smooth line dips below a real low
// or rises above a real high, so the picture shows values nobody logged). This app uses only three:
//  - 'monotone'  smooth, and NEVER leaves the range of the two points it joins (no overshoot). For slow, continuous
//                body measures where the day in between really was somewhere in between: weight, waist.
//  - 'linear'    straight segments. For daily totals and scores that jump from day to day (calories, protein, carbs,
//                sleep hours, workout minutes, recovery %, calorie balance): a curve would suggest a smooth change
//                that never happened.
//  - 'step'      for Min / Max target lines. Each day has its own target (a gym day and a rest day differ), so the
//                line holds one value per day and changes halfway between two days instead of sliding between them.
//
// Missing values (null) are gaps, not data: lines are NOT joined across them (connectNulls stays off), and a point that is
// left alone between two gaps still shows as a dot so it never disappears.

export type LineCurve = 'linear' | 'monotone' | 'step';

/** Chart id (the `id` TrendChart / RecordTrendChart get, or the name used below) to its curve. Unlisted ids use 'linear'. */
export const CHART_CURVE: Readonly<Record<string, LineCurve>> = {
  weight: 'monotone',
  waist: 'monotone',
  body_recomposition: 'monotone',
  sleep: 'linear',
  recovery: 'linear',
  workout_duration: 'linear',
  calorie_balance: 'linear',
  macro_actual: 'linear',
  report_sleep: 'linear',
};

export const TARGET_CURVE: LineCurve = 'step';

export const curveFor = (chartId: string): LineCurve => CHART_CURVE[chartId] ?? 'linear';

/** True when the series has a real value somewhere AND an empty one somewhere else: there is at least one gap. */
export const seriesHasGaps = (rows: ReadonlyArray<Record<string, unknown>>, key: string): boolean => {
  let hasValue = false;
  let hasGap = false;
  for (const row of rows) {
    const v = row[key];
    if (typeof v === 'number' && Number.isFinite(v)) hasValue = true;
    else hasGap = true;
  }
  return hasValue && hasGap;
};
