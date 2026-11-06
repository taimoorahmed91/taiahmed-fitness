// How lines are drawn between points, per chart. Pure and React free.
//
// Every line chart is drawn as a smooth curve. The curve type is 'monotone' on purpose: Recharts' other smooth types
// ('natural', 'basis', 'cardinal') can overshoot (a smooth line dips below a real low or rises above a real high, so the
// picture shows values nobody logged). 'monotone' stays smooth but NEVER leaves the range of the two points it joins,
// so every recorded value is still drawn exactly where it was logged. This applies to actual values and to the
// Min / Max target lines alike.
//
// Missing values (null) are gaps, not data: lines are NOT joined across them (connectNulls stays off), and a point that is
// left alone between two gaps still shows as a dot so it never disappears.

export type LineCurve = 'monotone';

/** The one curve used by every line chart. */
export const SMOOTH_CURVE: LineCurve = 'monotone';

/** Chart id (the `id` TrendChart / RecordTrendChart get, or the name used below) to its curve. Unlisted ids are smooth too. */
export const CHART_CURVE: Readonly<Record<string, LineCurve>> = {
  weight: SMOOTH_CURVE,
  waist: SMOOTH_CURVE,
  body_recomposition: SMOOTH_CURVE,
  sleep: SMOOTH_CURVE,
  recovery: SMOOTH_CURVE,
  workout_duration: SMOOTH_CURVE,
  calorie_balance: SMOOTH_CURVE,
  macro_actual: SMOOTH_CURVE,
  report_sleep: SMOOTH_CURVE,
  exercise_history: SMOOTH_CURVE,
};

export const TARGET_CURVE: LineCurve = SMOOTH_CURVE;

export const curveFor = (chartId: string): LineCurve => CHART_CURVE[chartId] ?? SMOOTH_CURVE;

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
