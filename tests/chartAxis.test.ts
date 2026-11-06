import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { DEFAULT_HEADROOM, EMPTY_AXIS, ZOOMED_BAR_CHARTS, axisBaseFor, barAxisNote, barsStartAtZero, computeYAxis, emptyTopFor, niceStep } from '../src/lib/chartAxis';
import { CHART_MARGIN, chartDotStroke } from '../src/lib/chartTheme';

// The one Y-axis rule for every chart. Everything below is a documented, deterministic outcome.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const NICE = [1, 2, 2.5, 5];
const isNiceStep = (step: number) => {
  const exp = Math.floor(Math.log10(step));
  const m = Math.round((step / 10 ** exp) * 1000) / 1000;
  return NICE.includes(m) || m === 10;
};
const stepOf = (ticks: number[]) => Math.round((ticks[1] - ticks[0]) * 1e9) / 1e9;

describe('nice steps', () => {
  test('only 1, 2, 2.5 or 5 times a power of ten', () => {
    for (const raw of [0.07, 0.3, 1.2, 1.9, 2.3, 4.4, 7, 23, 480, 1234]) expect(isNiceStep(niceStep(raw))).toBe(true);
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(480)).toBe(500);
    expect(niceStep(2.2)).toBe(2.5);
  });
  test('bad input never gives NaN or 0', () => {
    for (const raw of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(niceStep(raw)).toBe(1);
  });
});

describe('quantities start at 0 and get 12% headroom, rounded up to a nice step', () => {
  test('headroom: the top is at least the highest value + 12%, and never more than one nice step above that', () => {
    expect(DEFAULT_HEADROOM).toBe(0.12);
    for (const max of [2300, 164, 286, 59, 7.4, 1.8]) {
      const a = computeYAxis([max / 2, max]);
      expect(a.floor).toBe(0);
      expect(a.top).toBeGreaterThanOrEqual(max * 1.12 - 1e-9);
      expect(a.top).toBeLessThan(max * 1.12 + stepOf(a.ticks) + 1e-9);
      expect(isNiceStep(stepOf(a.ticks))).toBe(true);
    }
  });
  test('known axes', () => {
    expect(computeYAxis([1500, 1950]).domain).toEqual([0, 2500]);
    expect(computeYAxis([60, 234]).domain).toEqual([0, 300]);
    expect(computeYAxis([20, 45, 60]).domain).toEqual([0, 80]);
  });
  test('Min / Max target lines count: the top covers the highest target even when intake is low', () => {
    const rows = [{ actual: 800, min: 2000, max: 2200 }, { actual: 1500, min: 2000, max: 2200 }];
    const a = computeYAxis(rows.flatMap((r) => [r.actual, r.min, r.max]));
    expect(a.top).toBeGreaterThanOrEqual(2200 * 1.12);
    expect(a.top).toBe(2500);
  });
  test('4 to 6 tick labels for ordinary data, quantities and zoomed measures alike', () => {
    for (const v of [[1500, 2300], [60, 234], [20, 60], [5, 9], [1, 2.4], [81.7, 81.9], [81, 83.4], [88.2, 94], [34, 88], [-594, 2991]]) {
      for (const opts of [{}, { base: 'zoom' as const }]) {
        const n = computeYAxis(v, opts).ticks.length;
        expect(n).toBeGreaterThanOrEqual(4);
        expect(n).toBeLessThanOrEqual(6);
      }
    }
  });
  test('ticks are strictly increasing, start at the floor and end at the top', () => {
    for (const v of [[0, 3], [1500, 2300], [-594, 2991], [0.2, 0.9], [81.4, 82.2]]) {
      for (const opts of [{}, { base: 'zoom' as const }, { bar: true }]) {
        const a = computeYAxis(v, opts);
        expect(a.ticks[0]).toBe(a.domain[0]);
        expect(a.ticks.at(-1)).toBe(a.domain[1]);
        expect(a.ticks.every((t, i) => i === 0 || t > a.ticks[i - 1])).toBe(true);
      }
    }
  });
});

describe('switching the range recomputes from the data on screen', () => {
  const all = [{ v: 2800 }, { v: 1200 }, { v: 1900 }, { v: 2000 }, { v: 1600 }, { v: 1700 }, { v: 1800 }];
  test('a high value outside the 3 latest days moves the axis when the range grows', () => {
    const short = computeYAxis(all.slice(-3).map((r) => r.v));
    const long = computeYAxis(all.map((r) => r.v));
    expect(short.top).toBeLessThan(long.top);
    expect(long.top).toBeGreaterThanOrEqual(2800 * 1.12);
    // the same data gives the same axis (pure, so memoizing on the rows is safe)
    expect(computeYAxis(all.map((r) => r.v))).toEqual(long);
  });
});

describe('measures (weight, waist, sleep line, recovery) zoom, with padding on both sides', () => {
  test('91 -> 92 kg is zoomed around the data', () => {
    const a = computeYAxis([91, 92], { base: 'zoom' });
    expect(a.domain).toEqual([90.5, 92.5]);
    expect(a.ticks).toEqual([90.5, 91, 91.5, 92, 92.5]);
  });
  test('the lower bound is below the lowest value and the upper above the highest, by about 12% of the span (or minPad)', () => {
    const a = computeYAxis([80, 90, 85], { base: 'zoom' });
    expect(a.floor).toBeLessThanOrEqual(80 - 10 * 0.12 + 1e-9);
    expect(a.top).toBeGreaterThanOrEqual(90 + 10 * 0.12 - 1e-9);
    expect(a.floor).toBeGreaterThan(60);
  });
  test('the floor is never below the metric floor (0) and snaps to 0 when zero costs little height', () => {
    expect(computeYAxis([0.2, 0.4], { base: 'zoom' }).floor).toBe(0);
    expect(computeYAxis([3, 9, 6], { base: 'zoom' }).floor).toBe(0);
    expect(computeYAxis([5, 9, 7], { base: 'zoom' }).floor).toBeGreaterThan(0);
    expect(computeYAxis([40, 60], { base: 'zoom', floor: 30 }).floor).toBeGreaterThanOrEqual(30);
  });
  test('a flat series gets a real range around the value', () => {
    const a = computeYAxis([91, 91, 91], { base: 'zoom' });
    expect(a.domain).toEqual([89, 93]);
    expect(a.domain[1] - a.domain[0]).toBeGreaterThanOrEqual(2);
  });
  test('percent: zoomed, top clamped to 100 (but never below a visible value), bottom never below 0', () => {
    const a = computeYAxis([40, 70, 95], { base: 'zoom', ceiling: 100, minPad: 1 });
    expect(a.top).toBe(100);
    expect(a.floor).toBeGreaterThanOrEqual(0);
    expect(a.floor).toBeLessThanOrEqual(40);
    const b = computeYAxis([100, 100], { base: 'zoom', ceiling: 100, minPad: 1 });
    expect(b.top).toBe(100);
    expect(computeYAxis([55, 60], { base: 'zoom', ceiling: 100, minPad: 1 }).top).toBeLessThan(100);
  });
});

describe('bars always start at 0', () => {
  test('a zoom metric in bar mode starts at 0 and shows the bars from there', () => {
    for (const v of [[91, 92], [5, 9], [88, 95]]) {
      const bar = computeYAxis(v, { base: 'zoom', bar: true });
      expect(bar.floor).toBe(0);
      expect(bar.top).toBeGreaterThanOrEqual(Math.max(...v) * 1.12 - 1e-9);
    }
  });
  test('line and bar of the same quantity share one axis', () => {
    const v = [1500, 1950, 2200];
    expect(computeYAxis(v, { bar: true })).toEqual(computeYAxis(v, {}));
  });
});

describe('negative values include 0 and pad both sides', () => {
  test('calorie balance -594..2991', () => {
    const a = computeYAxis([-594, 300, 2991]);
    expect(a.floor).toBeLessThanOrEqual(-594 * 1.12 + 1e-9);
    expect(a.top).toBeGreaterThanOrEqual(2991);
    expect(a.ticks).toContain(0);
    expect(a.ticks.some((t) => t < 0)).toBe(true);
    expect(a.ticks.some((t) => t > 0)).toBe(true);
    expect(isNiceStep(stepOf(a.ticks))).toBe(true);
  });
  test('all negative: 0 is still inside and there is room above the highest value', () => {
    const a = computeYAxis([-300, -100]);
    expect(a.floor).toBeLessThan(-300);
    expect(a.top).toBeGreaterThanOrEqual(0);
    expect(a.ticks).toContain(0);
    expect(a.top - -100).toBeGreaterThan(0);
  });
  test('weight change (bars up and down) includes 0 and never loses its tallest bar', () => {
    const a = computeYAxis([-1.4, 0.6, 0.9], { bar: true });
    expect(a.domain[0]).toBeLessThanOrEqual(-1.4);
    expect(a.domain[1]).toBeGreaterThanOrEqual(0.9);
    expect(a.ticks).toContain(0);
  });
  test('a zoomed measure with a real negative value is not forced to 0 only when it is not signed data', () => {
    // signed data always includes zero, even for a zoom metric
    expect(computeYAxis([-2, 3], { base: 'zoom' }).ticks).toContain(0);
  });
});

describe('empty, null, single and flat series', () => {
  test('no values, only nulls or only junk: the fallback axis', () => {
    for (const v of [[], [null, undefined], [Number.NaN, Number.POSITIVE_INFINITY, 'x']]) {
      const a = computeYAxis(v);
      expect(a).toEqual(EMPTY_AXIS);
      expect(a.domain[1]).toBeGreaterThan(a.domain[0]);
    }
    expect(computeYAxis([], { base: 'zoom' }).domain).toEqual([0, 4]);
    expect(computeYAxis([], { ceiling: 3 }).top).toBe(3);
  });
  test('nulls inside real data are ignored', () => {
    expect(computeYAxis([null, 1500, undefined, 2200])).toEqual(computeYAxis([1500, 2200]));
  });
  test('all zeros (a week without workouts): a real range, not 0..0', () => {
    const a = computeYAxis([0, 0, 0, 0]);
    expect(a.domain).toEqual([0, 4]);
    expect(a.ticks.length).toBeGreaterThan(2);
  });
  test('a single positive point and a flat quantity have room above them', () => {
    for (const v of [[5], [1800, 1800, 1800]]) {
      const a = computeYAxis(v);
      expect(a.floor).toBe(0);
      expect(a.top).toBeGreaterThan(Math.max(...v));
    }
    const one = computeYAxis([81.8], { base: 'zoom' });
    expect(one.floor).toBeLessThan(81.8);
    expect(one.top).toBeGreaterThan(81.8);
  });
  test('no axis ever has NaN or a zero-height range', () => {
    const inputs: unknown[][] = [[], [0], [0, 0], [5], [5, 5], [-5], [-5, -5], [1e-7], [1e9], [0.001, 0.002], [100, 100]];
    for (const v of inputs) {
      for (const opts of [{}, { base: 'zoom' as const }, { bar: true }, { base: 'zoom' as const, ceiling: 100 }]) {
        const a = computeYAxis(v, opts);
        expect([...a.domain, ...a.ticks].every(Number.isFinite)).toBe(true);
        expect(a.domain[1]).toBeGreaterThan(a.domain[0]);
        expect(a.ticks.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('different metrics are never forced onto one domain', () => {
  test('weight and waist keep their own axes; calories and protein theirs', () => {
    expect(computeYAxis([81, 82], { base: 'zoom' }).domain).not.toEqual(computeYAxis([90, 91], { base: 'zoom' }).domain);
    expect(computeYAxis([2000, 2200]).domain).not.toEqual(computeYAxis([130, 164]).domain);
  });
  test('which charts zoom is one decided list', () => {
    for (const id of ['weight', 'waist', 'sleep', 'recovery']) expect(axisBaseFor(id)).toBe('zoom');
    for (const id of ['calorie_balance', 'workout_duration', 'macro_calories', 'anything-else']) expect(axisBaseFor(id)).toBe('zero');
  });
});

describe('no clipping', () => {
  test('the plot margin leaves room for the biggest mark (selected halo: dot 4 + ring 5 + stroke)', () => {
    expect(CHART_MARGIN.top).toBeGreaterThanOrEqual(14);
    expect(CHART_MARGIN.right).toBeGreaterThanOrEqual(12);
    expect(chartDotStroke).toBeTruthy();
  });
  test('the highest point is never on the top edge unless a hard ceiling says so', () => {
    for (const max of [10, 99, 164, 2200, 2991]) expect(computeYAxis([max]).top).toBeGreaterThan(max);
    expect(computeYAxis([40, 100], { base: 'zoom', ceiling: 100 }).top).toBe(100);
  });
  test('the lowest point of a zoomed axis is above the floor, so a dot is never cut at the bottom', () => {
    for (const v of [[81, 82], [5.5, 8.5], [88, 91]]) {
      const a = computeYAxis(v, { base: 'zoom' });
      expect(a.floor).toBeLessThan(Math.min(...v));
    }
  });
  test('no chart turns on data overflow or clips the plot', () => {
    for (const file of ['TrendChart', 'MacroTargetChart', 'history/RecordTrendChart', 'BodyRecompositionCard', 'ReportCharts', 'charts/WeeklyBarChart', 'charts/DeltaChart']) {
      expect(read(`src/components/${file}.tsx`)).not.toContain('allowDataOverflow');
    }
  });
});

describe('every chart takes its axis from the shared rule', () => {
  const files: Record<string, RegExp> = {
    'src/components/TrendChart.tsx': /computeYAxis\(shown\.flatMap\(row => series\.map\(s => row\[s\.key\]\)\), \{ base: axisBaseFor\(id\), bar: view\.style === 'bar'/,
    'src/components/history/RecordTrendChart.tsx': /computeYAxis\(shown\.flatMap\(row => series\.map\(s => row\[s\.key\]\)\), \{ base: axisBaseFor\(id\), bar: view\.style === 'bar'/,
    'src/components/MacroTargetChart.tsx': /computeYAxis\(shown\.flatMap\(\(d\) => \[d\.actual, d\.min, d\.max\]\), \{ base: 'zero', bar: style === 'bar' \}\)/,
    'src/components/BodyRecompositionCard.tsx': /computeYAxis\(data\.map\(d => d\.weight\), \{ base: 'zoom' \}\)/,
    'src/components/ReportCharts.tsx': /computeYAxis\(data\.map\(\(d\) => d\.sleep\), \{ base: 'zoom' \}\)/,
    'src/components/charts/WeeklyBarChart.tsx': /computeYAxis\(data\.map\(\(d\) => d\[valueKey\]\), \{ bar: true \}\)/,
    'src/components/charts/DeltaChart.tsx': /computeYAxis\(points\.map\(\(p\) => p\.delta\), \{ bar: true/,
    'src/components/ExerciseHistoryDialog.tsx': /computeYAxis\(history\.map\(\(h\) => h\.topWeight\), \{ base: 'zoom'/,
  };
  for (const [file, pattern] of Object.entries(files)) {
    test(file, () => {
      const src = read(file);
      expect(src).toMatch(pattern);
      expect(src).not.toMatch(/domain=\{\['auto'|domain=\{\[0, 12\]\}|chartDomain/);
    });
  }
  test('the old helper is gone, and the "Axis starts at" note is only built for charts whose bars can start above zero', () => {
    expect(() => read('src/lib/chartDomain.ts')).toThrow();
    for (const file of ['TrendChart', 'history/RecordTrendChart']) {
      const src = read(`src/components/${file}.tsx`);
      expect(src).toContain("const axisNote = view.style === 'bar' ? barAxisNote(floor, unit) : null;");
      expect(src).toMatch(/\$\{axisNote\}, not zero\./);
      expect(src).toMatch(/caption=\{`.*\$\{axisNote \? ` · \$\{axisNote\}` : ''\}/);
      expect(src).toContain("bar: view.style === 'bar' && barsStartAtZero(id)");
    }
    expect(read('src/components/MacroTargetChart.tsx')).not.toMatch(/axisNote|Axis starts/);
  });
});

describe('weight and waist bars keep the zoomed axis, and say so', () => {
  test('only weight and waist are exempt from zero-based bars', () => {
    expect([...ZOOMED_BAR_CHARTS].sort()).toEqual(['waist', 'weight']);
    for (const id of ['weight', 'waist']) expect(barsStartAtZero(id)).toBe(false);
    for (const id of ['sleep', 'recovery', 'workout_duration', 'calorie_balance']) expect(barsStartAtZero(id)).toBe(true);
  });
  test('a weight bar axis (the bar flag is off for weight) is exactly its line axis and starts above 0', () => {
    const v = [81.2, 82.6, 83];
    const lineAxis = computeYAxis(v, { base: 'zoom' });
    expect(computeYAxis(v, { base: 'zoom', bar: barsStartAtZero('weight') })).toEqual(lineAxis);
    expect(lineAxis.floor).toBeGreaterThan(0);
    expect(computeYAxis([91, 92], { base: 'zoom' }).domain).toEqual([90.5, 92.5]);
    // a quantity in bar mode still starts at 0
    expect(computeYAxis([5, 9], { base: 'zoom', bar: barsStartAtZero('sleep') }).floor).toBe(0);
  });
  test('"Axis starts at ..." only when bars start above zero, with the unit', () => {
    expect(barAxisNote(90.5, 'kg')).toBe('Axis starts at 90.5 kg');
    expect(barAxisNote(1000, 'cal')).toBe('Axis starts at 1,000 cal');
    expect(barAxisNote(50, '%')).toBe('Axis starts at 50%');
    expect(barAxisNote(4, '')).toBe('Axis starts at 4');
    expect(barAxisNote(0, 'kg')).toBeNull();
    expect(barAxisNote(-1000, 'cal')).toBeNull();
  });
});

describe('empty fallback', () => {
  test('workout minutes with nothing logged: 0..60, ticks 0, 20, 40, 60', () => {
    expect(emptyTopFor('workout_duration')).toBe(60);
    const a = computeYAxis([0, 0, 0], { bar: true, emptyTop: emptyTopFor('workout_duration') });
    expect(a.domain).toEqual([0, 60]);
    expect(a.ticks).toEqual([0, 20, 40, 60]);
    expect(computeYAxis([], { emptyTop: 60 }).domain).toEqual([0, 60]);
    // real data ignores the fallback
    expect(computeYAxis([30, 70], { emptyTop: 60 }).top).toBeGreaterThanOrEqual(70 * 1.12);
  });
  test('other charts keep 0..4, and a ceiling below the fallback wins', () => {
    expect(emptyTopFor('sleep')).toBeUndefined();
    expect(computeYAxis([0, 0]).domain).toEqual([0, 4]);
    expect(computeYAxis([], { emptyTop: 60, ceiling: 50 }).top).toBe(50);
  });
});
