// The Y-axis range shared by every chart that has a line / bar switch (TrendChart and MacroTargetChart).
// Pure and React free, so the rule is unit tested.
//
// ONE domain per chart and per visible data: Line and Bar draw on exactly the same axis. Bar mode no longer
// forces zero just because it is a bar chart (that hid a 91 -> 92 kg change under a bar that looked flat).
//
// The rule
//  1. Look at every finite number among the values of every rendered series (null, undefined, NaN and text are ignored).
//  2. Pad the observed min..max by 10% of the span, but never by less than `minPad` (default 0.5). A constant
//     series (all values equal, span 0) is padded by 2% of its size instead, so it never collapses to a hairline.
//  3. Non-negative data never gets a negative floor. If the padded floor is at or below 25% of the padded top
//     (the data already reaches down near zero, so zero costs little height), the floor snaps to 0. Otherwise
//     the axis is zoomed: that is what makes small changes such as 91 -> 92 kg readable. Data with negative
//     values keeps its negative floor, and zero is inside the range anyway.
//  4. Both ends snap outward to a "nice" step (1, 2, 2.5, 5 x 10^n; about five intervals), and the ticks are
//     those steps, so the baseline is always a clean, labelled number on the axis.
//  5. An optional hard `cap` (e.g. 100 for a percentage) limits the top, but never below the largest value.

export interface ChartDomainOptions {
  /** Hard upper limit of the axis (for example 100 for a percentage). Never cuts off a larger visible value. */
  cap?: number;
  /** Smallest padding on each side, in the unit of the data. Default 0.5. */
  minPad?: number;
}

export interface ChartDomain {
  domain: [number, number];
  /** Evenly spaced tick values from the floor to the top (the floor is always the first tick). */
  ticks: number[];
  /** The value the axis starts at: bars start here. */
  floor: number;
}

/** Floor snaps to zero when it is at or below this share of the top. */
export const ZERO_SNAP_RATIO = 0.25;
/** Constant series are padded by this share of their value. */
export const CONSTANT_PAD_RATIO = 0.02;
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
  for (let i = 0; ; i++) {
    const t = clean(lo + i * step);
    if (t > hi + step * 1e-6) break;
    ticks.push(t);
    if (i > 50) break;
  }
  // A cap that is not on a step (hi between two steps) still gets its own label when there is room.
  if (hi - ticks[ticks.length - 1] >= step * 0.5) ticks.push(clean(hi));
  return ticks;
};

export const computeChartDomain = (values: ReadonlyArray<unknown>, options: ChartDomainOptions = {}): ChartDomain => {
  const minPad = options.minPad ?? 0.5;
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (finite.length === 0) return { domain: [0, 1], ticks: buildTicks(0, 1, 0.25), floor: 0 };

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const pad = span === 0 ? Math.max(minPad, Math.abs(max) * CONSTANT_PAD_RATIO) : Math.max(minPad, span * 0.1);

  let rawLo = min - pad;
  const rawHi = max + pad;
  const nonNegative = min >= 0;
  if (nonNegative) {
    rawLo = Math.max(0, rawLo);
    if (rawLo <= ZERO_SNAP_RATIO * rawHi) rawLo = 0;
  }

  const step = niceStep((rawHi - rawLo) / TARGET_INTERVALS);
  let lo = clean(Math.floor(rawLo / step) * step);
  let hi = clean(Math.ceil(rawHi / step) * step);
  if (nonNegative) lo = Math.max(0, lo);
  if (options.cap != null) hi = Math.max(Math.min(hi, options.cap), max);
  if (hi - lo < step) hi = clean(lo + step);

  return { domain: [lo, hi], ticks: buildTicks(lo, hi, step), floor: lo };
};

/**
 * What a bar chart must say when its bars do not start at zero ("Axis starts at 90 kg"), so a short bar is never
 * mistaken for a small value. Null when the axis starts at zero (or below), where nothing needs saying.
 */
export const barAxisNote = (floor: number, unit: string): string | null => {
  if (!(floor > 0)) return null;
  const n = floor.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `Axis starts at ${unit === '%' ? `${n}%` : unit ? `${n} ${unit}` : n}`;
};
