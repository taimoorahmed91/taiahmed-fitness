// Pure helpers for the full-screen chart viewer. No React and no recharts imports on purpose,
// so the tests can load this file directly.
//
// The viewer shows the SAME chart a card shows (same data, same range, same line/bar choice).
// Only how much room it has changes, so the only things that may differ here are layout numbers:
// how tall the plot is and how generously the x-axis spaces its labels. Data never changes.

import { chartXAxisProps } from './chartTheme';

/** Smallest plot height (px) in the viewer. Cards use 190 to 260; the viewer grows from here to the free height. */
export const EXPANDED_CHART_MIN_HEIGHT = 360;

export interface XAxisTickPlan {
  interval: 'preserveEnd' | 'preserveStartEnd';
  minTickGap: number;
  tickMargin: number;
}

/**
 * How the x-axis spaces its labels.
 *  - Card: exactly what charts always did (Recharts default `preserveEnd`, 16px minimum gap).
 *  - Viewer: always label the first and the last day, and leave more room between labels the more
 *    days there are, so a 90 day axis reads as a handful of clear dates instead of a squeezed row.
 */
export const xAxisTickPlan = (count: number, expanded: boolean): XAxisTickPlan => {
  if (!expanded) return { interval: 'preserveEnd', minTickGap: 16, tickMargin: 2 };
  return { interval: 'preserveStartEnd', minTickGap: count > 60 ? 28 : count > 30 ? 22 : 16, tickMargin: 6 };
};

/** Shared x-axis props for a chart with `count` points, in the card or in the viewer. */
export const chartXAxisFor = (count: number, expanded: boolean) => ({ ...chartXAxisProps, ...xAxisTickPlan(count, expanded) });

/** Dot radius on line charts: the viewer shrinks dots on very dense series so they never merge into a blob. */
export const chartDotRadius = (base: number, count: number, expanded: boolean) => (expanded && count > 45 ? Math.max(2, base - 1) : base);

/**
 * Recharts draws lines, bars and slices in with a sweep. People who asked their device for reduced motion get the
 * finished chart straight away. Spread onto every <Line>, <Bar> and <Pie>.
 */
export const chartMotionProps = () => ({
  isAnimationActive: !(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
});
