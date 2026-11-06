// The Y-axis rule shared by EVERY chart (Dashboard, Reports, Weight, Waist, Sleep, Recovery, the exercise history).
// Pure and React free, so the rule is unit tested. It replaces the older src/lib/chartDomain.ts.
//
// Input: every value that is drawn for the range on screen, from ALL series (actual lines, Min / Max target lines,
// the second axis' own series). Null, undefined, NaN, Infinity and text are ignored. Charts call it inside useMemo with the
// rows of the active range, so switching 7D / 14D / 30D / 90D / All recomputes the axis from what is really on screen.
//
// Two kinds of axis (`base`)
//  - 'zero'  (default): a quantity (calories, protein, carbs, workout minutes, counts). The axis starts at 0 and
//    the top is the highest value + 12% headroom, rounded up to a nice step.
//  - 'zoom': a measure that never really sits near 0 (weight, waist, sleep hours as a line, recovery %). The axis is
//    padded 12% of the visible span on both sides (never less than `minPad`) so day-to-day movement stays visible.
//    If the padded floor would already be within 25% of the top, it snaps to 0 (zero then costs little height).
//
// Always, whatever `base` says
//  - Bars start at 0 (`bar: true`): a bar's length is its value, so a zoomed bar axis would mislead.
//    The one exception is weight and waist (ZOOMED_BAR_CHARTS): their bars use the SAME zoomed axis as their line, because 81 -> 83 kg
//    from zero looks like no change at all. Those charts must say so: `barAxisNote` gives the "Axis starts at ..." caption.
//  - Negative data (calorie balance, weight change) includes 0 and pads BOTH sides; ticks land on 0 and on both sides.
//  - `floor` / `ceiling` are hard limits of the metric (recovery % is 0..100). The ceiling never cuts a visible value.
//  - Ends snap to a "nice" step (1, 2, 2.5 or 5 x 10^n) chosen so there are 3 to 5 intervals (4 to 6 tick labels).
//  - No data, all zeros or a flat series always give a real range (never NaN, never 0..0, never zero height).

export interface YAxisOptions {
  /** 'zero' (default) for quantities, 'zoom' for measures. */
  base?: 'zero' | 'zoom';
  /** The chart is drawing bars: the axis starts at 0 (or lower, for negative data) whatever `base` says. */
  bar?: boolean;
  /** Lowest value the metric can take. Default: 0 when no value is negative. */
  floor?: number;
  /** The axis when there is nothing to scale: 0..emptyTop. Default 4 (a metric with a natural scale, like workout minutes, passes 60). */
  emptyTop?: number;
  /** Highest value the metric can take (100 for a percentage). Never cuts a larger visible value. */
  ceiling?: number;
  /** Extra room above the highest value, as a share of the span. Default 0.12. */
  headroom?: number;
  /** 'zoom' only: the smallest padding on each side, in the unit of the data. Default 0.5. */
  minPad?: number;
}

export interface YAxis {
  domain: [number, number];
  /** Evenly spaced tick values from the bottom to the top of the domain. */
  ticks: number[];
  /** The value the axis starts at. */
  floor: number;
  /** The value the axis ends at. */
  top: number;
}

export const DEFAULT_HEADROOM = 0.12;
/** 'zoom': the floor snaps to 0 when it is at or below this share of the top. */
export const ZERO_SNAP_RATIO = 0.25;
/** 'zoom': a flat series is padded by this share of its value. */
export const FLAT_PAD_RATIO = 0.02;
/** The axis when there is nothing to scale (no data, or only zeros): 0..4, ticks 0, 1, 2, 3, 4. */
export const EMPTY_AXIS: YAxis = { domain: [0, 4], ticks: [0, 1, 2, 3, 4], floor: 0, top: 4 };
const TARGET_INTERVALS = 5;
const clean = (n: number) => Math.round(n * 1e9) / 1e9;

/** Smallest "nice" step (1, 2, 2.5 or 5 x 10^n) that is at least `raw`. */
export const niceStep = (raw: number): number => {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return clean(m * base);
};

const buildTicks = (lo: number, hi: number, step: number): number[] => {
  const ticks: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = clean(lo + i * step);
    if (t > hi + step * 1e-6) break;
    ticks.push(t);
  }
  // A ceiling that is not on a step (hi between two steps) still gets its own label when there is room.
  if (hi - ticks[ticks.length - 1] >= step * 0.5) ticks.push(clean(hi));
  return ticks;
};

const finish = (rawLo: number, rawHi: number, max: number, options: YAxisOptions, minimum: number | undefined): YAxis => {
  let step = niceStep((rawHi - rawLo) / TARGET_INTERVALS);
  // Rounding the ends outward can leave more than 5 intervals (7 labels is crowded): take the next nice step instead.
  while (Math.ceil(rawHi / step - 1e-9) - Math.floor(rawLo / step + 1e-9) > TARGET_INTERVALS) step = niceStep(step * 1.0001);
  let lo = clean(Math.floor(rawLo / step) * step);
  let hi = clean(Math.ceil(rawHi / step) * step);
  if (minimum != null) lo = Math.max(lo, minimum);
  if (options.ceiling != null) hi = Math.max(Math.min(hi, options.ceiling), max);
  if (hi - lo < step) hi = clean(lo + step);
  return { domain: [lo, hi], ticks: buildTicks(lo, hi, step), floor: lo, top: hi };
};

export const computeYAxis = (values: ReadonlyArray<unknown>, options: YAxisOptions = {}): YAxis => {
  const headroom = options.headroom ?? DEFAULT_HEADROOM;
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (finite.length === 0) return emptyFor(options);

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const signed = min < 0;
  const minimum = options.floor ?? (signed ? undefined : 0);

  if (options.bar || options.base !== 'zoom' || signed) {
    // Zero is part of the axis. Pad the side(s) that have data away from zero.
    const hi0 = Math.max(max, 0);
    const lo0 = Math.min(min, 0);
    const span = hi0 - lo0;
    if (span === 0) return emptyFor(options);
    const rawHi = hi0 > 0 ? hi0 + span * headroom : span * headroom;
    const rawLo = lo0 < 0 ? lo0 - span * headroom : 0;
    return finish(rawLo, rawHi, max, options, minimum);
  }

  // 'zoom': pad both sides of the visible span.
  const span = max - min;
  const pad = span === 0
    ? Math.max(options.minPad ?? 0.5, Math.abs(max) * FLAT_PAD_RATIO)
    : Math.max(options.minPad ?? 0.5, span * headroom);
  let rawLo = min - pad;
  const rawHi = max + pad;
  if (minimum != null) rawLo = Math.max(rawLo, minimum);
  if (minimum === 0 && rawLo <= ZERO_SNAP_RATIO * rawHi) rawLo = 0;
  return finish(rawLo, rawHi, max, options, minimum);
};

/** What an axis shows with nothing to scale (no data, or only zeros). A ceiling smaller than the top wins (a percentage never shows 120). */
const emptyFor = (options: YAxisOptions): YAxis => {
  const wanted = options.emptyTop != null && options.emptyTop > 0 ? options.emptyTop : EMPTY_AXIS.top;
  const hi = options.ceiling != null && options.ceiling < wanted ? options.ceiling : wanted;
  if (hi === EMPTY_AXIS.top) return { ...EMPTY_AXIS, domain: [...EMPTY_AXIS.domain], ticks: [...EMPTY_AXIS.ticks] };
  const step = hi === wanted ? niceStep(hi / TARGET_INTERVALS) : hi / 4;
  return { domain: [0, hi], ticks: buildTicks(0, hi, step), floor: 0, top: hi };
};

/**
 * Which metrics use a zoomed axis in Line view (by chart id). Everything else is a quantity and starts at 0.
 * Weight and waist hover far above zero, sleep hours and recovery % live in a band: zero would flatten them.
 * In Bar view every chart starts at 0 anyway (`bar: true`).
 */
export const ZOOMED_CHARTS: ReadonlySet<string> = new Set(['weight', 'waist', 'sleep', 'recovery']);
export const axisBaseFor = (chartId: string): 'zero' | 'zoom' => (ZOOMED_CHARTS.has(chartId) ? 'zoom' : 'zero');

/** Weight and waist keep a zoomed axis in Bar view too (see the header). Every other chart's bars start at 0. */
export const ZOOMED_BAR_CHARTS: ReadonlySet<string> = new Set(['weight', 'waist']);
export const barsStartAtZero = (chartId: string): boolean => !ZOOMED_BAR_CHARTS.has(chartId);

/**
 * What a bar chart must say when its bars do not start at zero ("Axis starts at 90 kg"), so a short bar is never
 * mistaken for a small value. Null when the axis starts at zero (or below), where nothing needs saying.
 */
export const barAxisNote = (floor: number, unit: string): string | null => {
  if (!(floor > 0)) return null;
  const n = floor.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `Axis starts at ${unit === '%' ? `${n}%` : unit ? `${n} ${unit}` : n}`;
};

/** Charts with a natural empty scale (workout minutes 0..60). Others use the default 0..4. */
export const emptyTopFor = (chartId: string): number | undefined => (chartId === 'workout_duration' ? 60 : undefined);
