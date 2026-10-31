import { describe, it as test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { useChartRange, useChartView } from '../src/components/ChartViewControls';

// Clicking a range on one dashboard chart must change that chart only.
// Every chart stores its range under its own key; there is no page-wide range.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// --- tiny in-memory localStorage -------------------------------------------------
const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

// --- minimal hook runner (useState + useEffect only, which is all the range hooks use) ---
const internals = (React as unknown as { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } } })
  .__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

/** One mounted chart: re-runs its hook after every state change, like a component would. */
function mount<T>(hook: () => T) {
  const slots: unknown[] = [];
  const deps: (unknown[] | undefined)[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  const result = { current: undefined as T };

  const render = () => {
    cursor = 0;
    effects = [];
    const dispatcher = {
      useState: (init: unknown) => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof init === 'function' ? (init as () => unknown)() : init;
        const set = (next: unknown) => {
          const value = typeof next === 'function' ? (next as (p: unknown) => unknown)(slots[i]) : next;
          if (Object.is(value, slots[i])) return;
          slots[i] = value;
          render();
        };
        return [slots[i], set];
      },
      useEffect: (fn: () => void, d?: unknown[]) => {
        const i = cursor++;
        const prev = deps[i];
        const changed = !prev || !d || d.some((x, j) => !Object.is(x, prev[j]));
        if (changed) { deps[i] = d; effects.push(fn); }
      },
    };
    const previous = internals.ReactCurrentDispatcher.current;
    internals.ReactCurrentDispatcher.current = dispatcher;
    try { result.current = hook(); } finally { internals.ReactCurrentDispatcher.current = previous; }
    // Effects run after render, like React's passive effects.
    const pending = effects;
    effects = [];
    pending.forEach((fn) => fn());
  };
  render();
  return result;
}

beforeEach(() => store.clear());

describe('each chart keeps its own range', () => {
  test('clicking 30D on one chart leaves every other chart alone', () => {
    const weight = mount(() => useChartView('weight'));
    const sleep = mount(() => useChartView('sleep'));
    const calories = mount(() => useChartView('macro_Calories: Actual vs Target'));
    const mealTime = mount(() => useChartRange('meal_time'));
    for (const c of [weight, sleep, calories, mealTime]) assert.equal(c.current.range, '7');

    weight.current.setRange('30');
    assert.equal(weight.current.range, '30');
    assert.equal(sleep.current.range, '7');
    assert.equal(calories.current.range, '7');
    assert.equal(mealTime.current.range, '7');

    sleep.current.setRange('90');
    assert.equal(weight.current.range, '30');
    assert.equal(sleep.current.range, '90');
    assert.equal(calories.current.range, '7');
  });

  test('going back to 7D on a chart only changes that chart', () => {
    const a = mount(() => useChartView('weight'));
    const b = mount(() => useChartView('waist'));
    a.current.setRange('30');
    b.current.setRange('30');
    a.current.setRange('7');
    assert.equal(a.current.range, '7');
    assert.equal(b.current.range, '30');
  });

  test('each choice is saved under that chart\'s own key and survives a reload', () => {
    const weight = mount(() => useChartView('weight'));
    const sleep = mount(() => useChartView('sleep'));
    weight.current.setRange('90');
    assert.equal(store.get('fittrack_chart_weight_range'), '90');
    assert.equal(store.get('fittrack_chart_sleep_range'), '7');
    assert.equal(store.has('fittrack_chart_shared_dashboard_range'), false);

    const weightAgain = mount(() => useChartView('weight'));
    const sleepAgain = mount(() => useChartView('sleep'));
    assert.equal(weightAgain.current.range, '90');
    assert.equal(sleepAgain.current.range, '7');
    assert.equal(sleep.current.range, '7');
  });

  test('a stored "shared dashboard" value from the old design is ignored', () => {
    store.set('fittrack_chart_shared_dashboard_range', '90');
    const weight = mount(() => useChartView('weight'));
    assert.equal(weight.current.range, '7');
  });

  test('line/bar choice is per chart too', () => {
    const a = mount(() => useChartView('weight', 'line'));
    const b = mount(() => useChartView('sleep', 'bar'));
    a.current.setStyle('bar');
    assert.equal(a.current.style, 'bar');
    assert.equal(b.current.style, 'bar');
    b.current.setStyle('line');
    assert.equal(a.current.style, 'bar');
    assert.equal(b.current.style, 'line');
  });

  test('a chart without "All" shows its widest range; a chart with it keeps All; neither affects the other', () => {
    store.set('fittrack_chart_weight_range', 'all');
    store.set('fittrack_chart_sleep_range', 'all');
    const weight = mount(() => useChartView('weight', 'line', { allowed: ['7', '14', '30', '90', 'all'] }));
    const sleep = mount(() => useChartView('sleep'));
    assert.equal(weight.current.range, 'all');
    assert.equal(sleep.current.range, '90');
    sleep.current.setRange('14');
    assert.equal(weight.current.range, 'all');
  });

  test('legacy saved ranges are still read once for a chart that has none yet', () => {
    store.set('fittrack_macro_chart_Protein_range', '30');
    const protein = mount(() => useChartView('macro_Protein', 'line', { legacyPrefix: 'fittrack_macro_chart_Protein' }));
    const carbs = mount(() => useChartView('macro_Carbs', 'line', { legacyPrefix: 'fittrack_macro_chart_Carbs' }));
    assert.equal(protein.current.range, '30');
    assert.equal(carbs.current.range, '7');
  });
});

describe('dashboard wiring', () => {
  test('the shared-range provider and context are gone, and nothing imports them', () => {
    assert.equal(existsSync(new URL('../src/components/charts/ChartRangeProvider.tsx', import.meta.url)), false);
    assert.equal(existsSync(new URL('../src/components/charts/chartRangeContext.ts', import.meta.url)), false);
    const files = ['src/pages/Dashboard.tsx', 'src/components/ChartViewControls.tsx', ...readdirSync(new URL('../src/components', import.meta.url)).filter((f) => f.endsWith('.tsx')).map((f) => `src/components/${f}`)];
    for (const f of files) assert.equal(/ChartRangeProvider|chartRangeContext|useSharedChartRange/.test(read(f)), false, f);
  });

  test('the dashboard has no page-level range control', () => {
    const src = read('src/pages/Dashboard.tsx');
    assert.equal(/ChartRangeControls|Range for every chart|All dashboard charts/.test(src), false);
  });

  test('every trend chart on the dashboard has its own storage key', () => {
    const ids = ['WeightChart', 'WaistChart', 'SleepChart', 'WorkoutDurationChart', 'CalorieBalanceChart', 'RecoveryChart']
      .map((f) => /<TrendChart[^>]*\bid="([^"]+)"/.exec(read(`src/components/${f}.tsx`))?.[1]);
    assert.ok(ids.every(Boolean), String(ids));
    assert.equal(new Set(ids).size, ids.length, `duplicate chart ids: ${ids}`);
    // The three macro charts key off their (different) titles.
    const dash = read('src/pages/Dashboard.tsx');
    const titles = [...dash.matchAll(/<MacroTargetChart[^>]*title="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(titles.length, 3);
    assert.equal(new Set(titles).size, 3);
    assert.match(read('src/components/MacroTargetChart.tsx'), /const id = `macro_\$\{storageKey \?\? title\}`/);
  });

  test('categorical charts stay range-only (no line/bar switch)', () => {
    for (const f of ['MealTimeChart', 'BodyRecompositionCard']) {
      const src = read(`src/components/${f}.tsx`);
      assert.match(src, /\buseChartRange\b/, f);
      assert.equal(/\buseChartView\b/.test(src), false, f);
      assert.match(src, /<ChartHeader/, f);
      // useChartRange has no style, so the header cannot draw a line/bar switch for these.
    }
  });
});

describe('chart controls never widen the page', () => {
  const src = read('src/components/ChartViewControls.tsx');
  test('wrappers can shrink and wrap inside the card', () => {
    assert.equal(/shrink-0/.test(src), false);
    assert.match(src, /<div className="min-w-0 max-w-full" data-html2canvas-ignore="true">/);
    assert.match(src, /className="flex min-w-0 max-w-full flex-wrap items-center gap-2"/);
    assert.match(src, /className="max-w-full flex-wrap \[&>button\]:px-2"/);
  });
  test('touch targets are still 44px (the shared control keeps its coarse-pointer sizes)', () => {
    const control = read('src/components/ui/segmented-control.tsx');
    assert.match(control, /\[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:min-w-11/);
  });
  test('range buttons keep their accessible names', () => {
    assert.match(src, /ariaLabel=\{label \? `\$\{label\} range` : 'Chart range'\}/);
    assert.match(src, /ariaLabel: RANGE_LABELS\[r\]/);
  });
});
