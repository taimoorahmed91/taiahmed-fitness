import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChartDataset, joinUnit } from '../src/lib/chartViewerData';
import { chartPointValues } from '../src/lib/chartSelection';
import { formatPickValue, formatSignedDelta } from '../src/lib/chartComparePicks';
import { EMPTY_PICKS, reconcilePicks, swapPicks, togglePick } from '../src/lib/chartComparePicks';
import {
  comparePointPicks, comparePoints, describeComparison, describePointDropped, describePointOutcome, describePointPick, describeSeriesDelta, describeTiming,
  exactCompareLink, pointInlineValue, pointOptions, pointSeries,
} from '../src/lib/chartPointCompare';

// In-viewer A / B comparison of two points: daily aggregates, multi-series (macro actual / min / max, Sleep manual / WHOOP), categorical
// (time of day), unknown values (never 0), reset when a point leaves, B - A order, and which points may ever open Compare.
// Mounted behaviour: tests/mounted/dashboardCompare.dom.tsx.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
type Row = Record<string, unknown>;

const calories = (rows: Row[]) => createChartDataset({
  name: 'Calories: Actual vs Target', period: 'Last 30 days', rows,
  columns: [{ key: 'date', label: 'Date' }, { key: 'actual', label: 'Actual', unit: 'cal', digits: 0 }, { key: 'min', label: 'Min target', unit: 'cal', digits: 0 }, { key: 'max', label: 'Max target', unit: 'cal', digits: 0 }],
  selection: { metric: 'calories', valueKeys: ['actual'], isObserved: (r) => r.intake === undefined || r.intake === 'observed' },
  pointCompare: { kind: 'date', seriesKeys: ['actual', 'min', 'max'], pickKeys: ['actual'], noun: 'day', nounPlural: 'days' },
});
const macroRows: Row[] = [
  { date: '2026-10-01', actual: 1800, intake: 'observed', min: 1700, max: 2000 },
  { date: '2026-10-02', actual: null, intake: 'none', min: 1700, max: 2000 }, // nothing logged: blank, not 0
  { date: '2026-10-03', actual: 0, intake: 'observed', min: 1700, max: null }, // an explicit 0 IS observed
  { date: '2026-10-04', actual: 900, intake: 'partial', min: 1700, max: 2000 }, // some meals only: unobserved
  { date: '2026-10-05', actual: 2100, intake: 'observed', min: 1700, max: 2000 },
];

const sleep = () => createChartDataset({
  name: 'Sleep', period: 'Last 30 days',
  rows: [
    { date: '2026-10-01', hours: 7.5, whoopHours: 8.1, recordId: 's-1' },
    { date: '2026-10-02', hours: null, whoopHours: 6.9 }, // WHOOP only: a daily aggregate
    { date: '2026-10-03', hours: 6, whoopHours: null, recordId: 's-3' },
    { date: '2026-10-04', hours: null, whoopHours: null },
  ] as Row[],
  columns: [{ key: 'date', label: 'Date' }, { key: 'hours', label: 'Manual Sleep', unit: 'hrs' }, { key: 'whoopHours', label: 'WHOOP Sleep', unit: 'hrs' }],
  selection: {
    metric: 'sleep', valueKeys: ['hours', 'whoopHours'],
    recordId: (r) => (typeof r.hours === 'number' && r.recordId ? (r.recordId as string) : undefined),
    compare: { valueKey: 'hours', noun: 'manual sleep entry', unit: 'hrs' },
  },
  pointCompare: { kind: 'date', seriesKeys: ['hours', 'whoopHours'], noun: 'day', nounPlural: 'days' },
});

const mealTimes = (rows: Row[]) => createChartDataset({
  name: 'Calories by Time of Day', period: 'Last 30 days', chronological: false, rowId: (r) => String(r.name), selection: false, rows,
  columns: [{ key: 'name', label: 'Period' }, { key: 'calories', label: 'Calories', unit: 'cal', digits: 0 }, { key: 'count', label: 'Meals', digits: 0 }, { key: 'pct', label: 'Share', unit: '%', digits: 0 }],
  pointCompare: { kind: 'category', seriesKeys: ['calories', 'count', 'pct'], pickKeys: ['calories'], isObserved: (r) => Number(r.count) > 0, noun: 'time of day', nounPlural: 'times of day' },
});
const periods: Row[] = [
  { name: 'Overnight', calories: 0, count: 0, pct: 0 },
  { name: 'Morning', calories: 1200, count: 4, pct: 40 },
  { name: 'Midday', calories: 600, count: 2, pct: 20 },
  { name: 'Evening', calories: 1200, count: 3, pct: 40 },
];

const at = (points: ReturnType<typeof comparePoints>, key: string) => points.find((p) => p.rowId === key || p.label === key)!;

describe('daily aggregates compare two DATES', () => {
  test('only observed days are pickable: blank, partly logged and target-only days never are, an explicit 0 is', () => {
    const points = comparePoints(calories(macroRows));
    assert.deepEqual(points.map((p) => p.isoDate), ['2026-10-01', '2026-10-03', '2026-10-05']);
    assert.equal(points.find((p) => p.isoDate === '2026-10-03')!.values!.actual, 0, 'a real 0 stays 0');
  });

  test('a point keeps only the series it observed (a missing target is absent, never 0)', () => {
    const zero = comparePoints(calories(macroRows)).find((p) => p.isoDate === '2026-10-03')!;
    assert.deepEqual(zero.values, { actual: 0, min: 1700 });
    assert.equal('max' in zero.values!, false);
  });

  test('a non-ISO or invalid date is not a pickable day', () => {
    const dataset = calories([{ date: '10/01', actual: 5, min: 1, max: 9 }, { date: '2026-02-30', actual: 5, min: 1, max: 9 }, { date: '2026-10-01', actual: 5, min: 1, max: 9 }]);
    assert.deepEqual(comparePoints(dataset).map((p) => p.isoDate), ['2026-10-01']);
  });

  test('a chart that did not opt in, or whose data is unavailable, offers nothing', () => {
    const plain = createChartDataset({ name: 'x', period: 'p', rows: macroRows, columns: [{ key: 'date', label: 'Date' }, { key: 'actual', label: 'Actual' }] });
    assert.deepEqual(comparePoints(plain), []);
    const unavailable = createChartDataset({ name: 'x', period: 'p', rows: macroRows, columns: [{ key: 'date', label: 'Date' }, { key: 'actual', label: 'Actual' }], status: { unavailable: { reason: 'down' } }, pointCompare: { kind: 'date', seriesKeys: ['actual'], noun: 'day', nounPlural: 'days' } });
    assert.deepEqual(comparePoints(unavailable), []);
  });

  test('days are listed newest first for the pickers (the plot order is oldest first)', () => {
    const dataset = calories(macroRows);
    assert.deepEqual(pointOptions(dataset, comparePoints(dataset)).map((p) => p.isoDate), ['2026-10-05', '2026-10-03', '2026-10-01']);
  });
});

describe('multi-series B - A', () => {
  const dataset = calories(macroRows);
  const series = pointSeries(dataset);
  const points = comparePoints(dataset);

  test('B minus A per series, in the chart\'s order, with neutral words and the days between', () => {
    const result = comparePointPicks(at(points, '2026-10-01'), at(points, '2026-10-05'), series, 'date');
    assert.deepEqual(result.series.map((r) => [r.key, r.a, r.b, r.delta, r.direction]), [['actual', 1800, 2100, 300, 'higher'], ['min', 1700, 1700, 0, 'same'], ['max', 2000, 2000, 0, 'same']]);
    assert.equal(result.days, 4);
    assert.equal(describeSeriesDelta(result.series[0]), '+300 cal (higher)');
    assert.equal(describeSeriesDelta(result.series[1]), '0 cal (no change)');
  });

  test('order is the order the slots were set, never date order: B earlier than A is negative days and lower', () => {
    const result = comparePointPicks(at(points, '2026-10-05'), at(points, '2026-10-01'), series, 'date');
    assert.equal(result.days, -4);
    assert.equal(result.series[0].delta, -300);
    assert.equal(result.series[0].direction, 'lower');
    assert.equal(describeTiming(result.days), 'B is 4 days before A');
    assert.equal(describeTiming(4), 'B is 4 days after A');
    assert.equal(describeTiming(1), 'B is 1 day after A');
    assert.equal(describeTiming(0), 'Same day');
    assert.equal(describeTiming(null), null);
  });

  test('a series only one pick observed has no difference (the missing side is "no value", never 0)', () => {
    const result = comparePointPicks(at(points, '2026-10-01'), at(points, '2026-10-03'), series, 'date');
    const max = result.series.find((r) => r.key === 'max')!;
    assert.deepEqual([max.a, max.b, max.delta, max.direction, max.missing], [2000, null, null, null, 'b']);
    assert.equal(describeSeriesDelta(max), null);
    assert.equal(result.compared, 2, 'actual (1800 -> 0) and min');
    assert.equal(result.series[0].delta, -1800, 'the real 0 is a value, not a gap');
    assert.deepEqual(describeComparison(result)[2], 'Max target: no difference, B has no value');
  });

  test('a series neither pick observed is left out', () => {
    const noTargets = calories([{ date: '2026-10-01', actual: 5 }, { date: '2026-10-02', actual: 9 }]);
    const [a, b] = comparePoints(noTargets);
    assert.deepEqual(comparePointPicks(a, b, pointSeries(noTargets), 'date').series.map((r) => r.key), ['actual']);
  });

  test('Sleep: manual and WHOOP are separate series, each compared only where observed', () => {
    const dataset = sleep();
    const [d1, d2, d3] = comparePoints(dataset);
    assert.deepEqual(comparePoints(dataset).map((p) => p.isoDate), ['2026-10-01', '2026-10-02', '2026-10-03'], 'a day with neither value is not pickable');
    const both = comparePointPicks(d1, d3, pointSeries(dataset), 'date');
    assert.deepEqual(both.series.map((r) => [r.key, r.delta, r.missing]), [['hours', -1.5, null], ['whoopHours', null, 'b']]);
    const whoopOnly = comparePointPicks(d1, d2, pointSeries(dataset), 'date');
    assert.deepEqual(whoopOnly.series.map((r) => [r.key, r.delta, r.missing]), [['hours', null, 'b'], ['whoopHours', -1.2, null]]);
  });

  test('values are rounded like the table (no floating point noise)', () => {
    const dataset = createChartDataset({
      name: 'W', period: 'p', rows: [{ date: '2026-10-01', v: 0.1 }, { date: '2026-10-02', v: 0.3 }] as Row[], columns: [{ key: 'date', label: 'Date' }, { key: 'v', label: 'V', unit: 'kg' }],
      pointCompare: { kind: 'date', seriesKeys: ['v'], noun: 'day', nounPlural: 'days' },
    });
    const [a, b] = comparePoints(dataset);
    assert.equal(comparePointPicks(a, b, pointSeries(dataset), 'date').series[0].delta, 0.2);
  });
});

describe('categorical comparison never talks about dates', () => {
  const dataset = mealTimes(periods);
  const series = pointSeries(dataset);
  const points = comparePoints(dataset);

  test('a period with no meals is unobserved: not pickable, and not compared as zero', () => {
    assert.deepEqual(points.map((p) => p.label), ['Morning', 'Midday', 'Evening']);
    assert.ok(points.every((p) => p.isoDate === ''));
  });

  test('B minus A per series with no days, no timing and no date words anywhere', () => {
    const result = comparePointPicks(at(points, 'Morning'), at(points, 'Midday'), series, 'category');
    assert.equal(result.days, null);
    assert.deepEqual(result.series.map((r) => [r.key, r.delta, r.direction]), [['calories', -600, 'lower'], ['count', -2, 'lower'], ['pct', -20, 'lower']]);
    const words = [describeTiming(result.days) ?? '', ...describeComparison(result), describePointPick(points[0], series), describePointOutcome({ kind: 'set', slot: 'a', replaced: null }, points[0], series, 'times of day'), describePointDropped([{ slot: 'b', pick: points[1] }], series, 'category')].join(' ');
    assert.doesNotMatch(words, /\bdays?\b|\bbefore\b|\bafter\b|\belapsed\b|\bdate\b|\b20\d\d\b/i);
  });

  test('categories keep their listed order in the pickers and identity is the category name', () => {
    assert.deepEqual(pointOptions(dataset, points).map((p) => p.recordId), ['Morning', 'Midday', 'Evening']);
  });

  test('equal values read "no change"; the meal count (4 vs 3) is its own series with its own difference', () => {
    const result = comparePointPicks(at(points, 'Morning'), at(points, 'Evening'), series, 'category');
    assert.deepEqual(result.series.map((r) => r.direction), ['same', 'lower', 'same']);
    assert.equal(describeSeriesDelta(result.series[0]), '0 cal (no change)');
  });
});

describe('A and B slots: toggle, replace, swap, duplicates, reconcile (shared with the exact-record picks)', () => {
  const dataset = calories(macroRows);
  const points = comparePoints(dataset);
  const p1 = points[0];
  const p3 = points[1];
  const p5 = points[2];

  test('the same slots and the same toggle / duplicate rules apply to points', () => {
    let state = togglePick(EMPTY_PICKS, 'a', p1);
    state = togglePick(state.picks, 'b', p5);
    assert.deepEqual([state.picks.a?.rowId, state.picks.b?.rowId], ['2026-10-01', '2026-10-05']);
    assert.equal(togglePick(state.picks, 'a', p5).outcome.kind, 'duplicate');
    assert.deepEqual(swapPicks(state.picks).a?.rowId, '2026-10-05');
    assert.equal(togglePick(state.picks, 'a', p1).outcome.kind, 'cleared');
    assert.equal(togglePick(state.picks, 'a', p3).outcome.kind, 'set');
  });

  test('announcements: single-series charts name the value, multi-series name the day, neutral and in the shared words', () => {
    const series = pointSeries(dataset);
    assert.equal(describePointPick(p1, series), '2026-10-01'.replace('2026-10-01', 'Oct 1, 2026'));
    const weight = createChartDataset({ name: 'W', period: 'p', rows: [{ date: '2026-10-01', weight: 80.9 }] as Row[], columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }], pointCompare: { kind: 'date', seriesKeys: ['weight'], noun: 'day', nounPlural: 'days' } });
    const wp = comparePoints(weight)[0];
    assert.equal(describePointPick(wp, pointSeries(weight)), 'Oct 1, 2026, 80.9 kg');
    assert.equal(pointInlineValue(wp, pointSeries(weight)), '80.9 kg');
    assert.equal(pointInlineValue(p1, series), null);
    const outcome = togglePick(EMPTY_PICKS, 'a', wp).outcome;
    assert.equal(describePointOutcome(outcome, wp, pointSeries(weight), 'days'), 'A set to Oct 1, 2026, 80.9 kg.');
    const dup = togglePick(togglePick(EMPTY_PICKS, 'a', wp).picks, 'b', wp).outcome;
    assert.match(describePointOutcome(dup, wp, pointSeries(weight), 'days'), /^That is already A\. Compare needs two different days/);
  });

  test('a point that left the chart (range narrowed) is dropped and named; the others refresh; widening later does not bring it back', () => {
    const picks = { a: p1, b: p5 };
    const narrowed = calories(macroRows.slice(2)); // 2026-10-01 is gone
    const available = new Map(comparePoints(narrowed).map((p) => [p.recordId, p] as const));
    const result = reconcilePicks(picks, available);
    assert.equal(result.picks.a, null);
    assert.equal(result.picks.b?.rowId, '2026-10-05');
    assert.equal(describePointDropped(result.dropped, pointSeries(dataset), 'date'), 'A (Oct 1, 2026) is no longer on this chart (outside the date range, or the entry was removed), so it was cleared.');
    const widened = new Map(comparePoints(dataset).map((p) => [p.recordId, p] as const));
    assert.equal(reconcilePicks(result.picks, widened).picks.a, null, 'the dropped pick stays dropped');
  });

  test('a day that stops being observed (a meal edit makes it partial) is dropped; an edited value refreshes in place', () => {
    const picks = { a: p1, b: p5 };
    const edited = macroRows.map((r) => (r.date === '2026-10-01' ? { ...r, actual: 1850 } : r.date === '2026-10-05' ? { ...r, intake: 'partial' } : r));
    const result = reconcilePicks(picks, new Map(comparePoints(calories(edited)).map((p) => [p.recordId, p] as const)));
    assert.equal(result.picks.a?.values?.actual, 1850);
    assert.equal(result.picks.b, null);
    assert.equal(result.dropped.length, 1);
  });

  test('categories: a period that loses its meals in a narrower range is dropped, the other is refreshed to the new range\'s numbers', () => {
    const wide = comparePoints(mealTimes(periods));
    const narrowRows = periods.map((r) => (r.name === 'Evening' ? { ...r, calories: 0, count: 0, pct: 0 } : r.name === 'Morning' ? { ...r, calories: 300, count: 1, pct: 100 } : r));
    const result = reconcilePicks({ a: at(wide, 'Morning'), b: at(wide, 'Evening') }, new Map(comparePoints(mealTimes(narrowRows)).map((p) => [p.recordId, p] as const)));
    assert.equal(result.picks.a?.values?.calories, 300);
    assert.equal(result.picks.b, null);
    assert.match(describePointDropped(result.dropped, pointSeries(mealTimes(periods)), 'category'), /^B \(Evening\) is no longer on this chart \(nothing is recorded for it in this range\)/);
  });
});

describe('Open in Compare is for exact saved records only', () => {
  const dataset = sleep();
  const [d1, d2, d3] = comparePoints(dataset);

  test('a manual sleep day carries its exact record; a WHOOP-only day does not; manual-with-WHOOP keeps the manual record id', () => {
    assert.deepEqual(d1.exact, { recordId: 's-1', category: 'sleep' });
    assert.equal(d1.recordId, 's-1', 'identity is the exact record');
    assert.equal(d2.exact, undefined);
    assert.equal(d2.recordId, '2026-10-02', 'a WHOOP-only day is identified by its date');
    assert.deepEqual(d3.exact, { recordId: 's-3', category: 'sleep' });
  });

  test('two exact manual days: a link in A, B order by record id (never by date); anything else is a note, not a link', () => {
    assert.equal(exactCompareLink(d3, d1, 'manual sleep entry').href, '/compare?category=sleep&a=s-3&b=s-1');
    const whoop = exactCompareLink(d1, d2, 'manual sleep entry');
    assert.equal(whoop.href, null);
    assert.match(whoop.note ?? '', /needs a saved manual sleep entry on both days\. B has none/);
    assert.match(exactCompareLink(d2, d2, 'manual sleep entry').note ?? '', /A and B have none/);
  });

  test('fewer than two picks, or a chart that can never open Compare, have neither link nor note', () => {
    assert.deepEqual(exactCompareLink(d1, null, 'manual sleep entry'), { href: null, note: null });
    assert.deepEqual(exactCompareLink(d1, d3, null), { href: null, note: null });
  });

  test('aggregates and categories never get an exact record, even with a compare config on a chart without record ids', () => {
    for (const point of [...comparePoints(calories(macroRows)), ...comparePoints(mealTimes(periods))]) assert.equal(point.exact, undefined);
    const noRecordIds = createChartDataset({
      name: 'W', period: 'p', rows: [{ date: '2026-10-01', weight: 80 }] as Row[], columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }],
      selection: { metric: 'weight', valueKeys: ['weight'], compare: { valueKey: 'weight', noun: 'weight entry', unit: 'kg' } },
      pointCompare: { kind: 'date', seriesKeys: ['weight'], noun: 'day', nounPlural: 'days' },
    });
    assert.equal(comparePoints(noRecordIds)[0].exact, undefined);
  });
});

describe('who gets what (source contract)', () => {
  test('every Dashboard graph opts into point compare through the shared datasets, and none builds links by hand', () => {
    assert.match(read('src/components/TrendChart.tsx'), /pointCompare: daySelection === false \? undefined : \{ kind: 'date'/);
    assert.match(read('src/components/MacroTargetChart.tsx'), /pointCompare: \{ kind: 'date', seriesKeys: \['actual', 'min', 'max'\]/);
    assert.match(read('src/components/MealTimeChart.tsx'), /pointCompare: \{ kind: 'category'/);
    assert.match(read('src/components/BodyRecompositionCard.tsx'), /pointCompare: \{ kind: 'date', seriesKeys: \['weight', 'waist'\]/);
    for (const file of ['TrendChart', 'MacroTargetChart', 'MealTimeChart', 'BodyRecompositionCard', 'WaistChart', 'RecoveryChart', 'WorkoutDurationChart', 'CalorieBalanceChart']) {
      assert.doesNotMatch(read(`src/components/${file}.tsx`), /buildCompareHref|\/compare\?|compareHrefFor/, `${file} never assembles a Compare link`);
    }
  });

  test('only Weight and manual Sleep can ever carry an exact record (the exact config lives in those two chart files)', () => {
    for (const file of ['WeightChart', 'SleepChart']) assert.match(read(`src/components/${file}.tsx`), /compare: \{ valueKey: /);
    for (const file of ['WaistChart', 'RecoveryChart', 'WorkoutDurationChart', 'CalorieBalanceChart', 'MacroTargetChart', 'MealTimeChart', 'BodyRecompositionCard']) {
      assert.doesNotMatch(read(`src/components/${file}.tsx`), /compare: \{ valueKey/, `${file} has no exact-record compare config`);
    }
  });

  test('the point comparison words are neutral: no better / worse / good / bad / improved anywhere in its rules or UI', () => {
    for (const file of ['src/lib/chartPointCompare.ts', 'src/components/charts/ChartCompareUi.tsx']) {
      assert.doesNotMatch(read(file).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /\b(better|worse|improv|declin|gain|loss|good|bad(?!ge))\w*\b/i, file);
    }
  });
});

describe('units and layout shared rules', () => {
  test('a percent sign is attached to its number everywhere the viewer, readouts and Compare show a value; other units keep their space', () => {
    assert.equal(joinUnit('41', '%'), '41%');
    assert.equal(joinUnit('80', 'kg'), '80 kg');
    assert.equal(joinUnit('80', ''), '80');
    assert.equal(formatPickValue(41, '%'), '41%');
    assert.equal(formatPickValue(80.2, 'kg'), '80.2 kg');
    assert.equal(formatSignedDelta(-4, '%'), '\u22124%');
    assert.equal(formatSignedDelta(4, '%'), '+4%');
    assert.equal(formatSignedDelta(0, '%'), '0%');
    const dataset = createChartDataset({ name: 'R', period: 'p', rows: [{ date: '2026-10-01', recovery: 70, w: 80 }] as Row[], columns: [{ key: 'date', label: 'Date' }, { key: 'recovery', label: 'Recovery', unit: '%' }, { key: 'w', label: 'W', unit: 'kg' }], selection: { metric: 'recovery', valueKeys: ['recovery'] } });
    assert.deepEqual(chartPointValues(dataset, '2026-10-01').map((v) => v.text), ['70%', '80 kg']);
  });

  test('the Time of Day legend wraps by available width (auto-fit columns), never a fixed two columns that clips names at 320px', () => {
    const src = read('src/components/MealTimeChart.tsx');
    assert.match(src, /grid-cols-\[repeat\(auto-fit,minmax\(10rem,1fr\)\)\]/);
    assert.doesNotMatch(src, /grid-cols-2/);
  });

  test('a pending reset message keeps the compare section alive, and starting still needs two points (source contract)', () => {
    const hook = read('src/components/charts/useChartComparePicks.ts');
    assert.match(hook, /hasPicks\(picks\) \|\| \(sameScope && stored\.notice !== ''\)/);
    assert.match(hook, /points\.length < 2 && !hasPicks\(picks\)/);
  });
});
