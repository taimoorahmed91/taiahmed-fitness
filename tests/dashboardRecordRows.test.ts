import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChartDataset } from '../src/lib/chartViewerData';
import { selectableChartPoints } from '../src/lib/chartSelection';
import { compareCandidate } from '../src/lib/chartComparePicks';
import { dashboardSleepRows, dashboardWaistRows, dashboardWeightRows } from '../src/lib/dashboardRecordRows';
import { planRecordPlot, recordChartRows, sleepChartRows } from '../src/lib/recordTrend';

// Dashboard Weight / Sleep rows carry exact record ids, by the same plan as the Weight and Sleep pages.
// Mounted behaviour: tests/mounted/dashboardCompare.dom.tsx.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const weights = [
  { id: 'w-3b', date: '2026-10-29', weight: 81.2 },
  { id: 'w-0', date: '2026-11-01', weight: 80 },
  { id: 'w-3a', date: '2026-10-29', weight: 80.9 },
  { id: 'w-zero', date: '2026-10-20', weight: 0 },
  { id: 'w-20', date: '2026-10-20', weight: 82 },
  { id: 'w-10', date: '2026-10-10', weight: 83 },
];

describe('Dashboard weight rows: one exact weigh-in per day', () => {
  test('a day with two weigh-ins carries the LOWEST id, whatever order the rows arrived in', () => {
    for (const order of [weights, [...weights].reverse(), [weights[2], weights[0], weights[3], weights[1], weights[5], weights[4]]]) {
      const rows = dashboardWeightRows(order);
      const day = rows.find((r) => r.date === '2026-10-29')!;
      assert.equal(day.recordId, 'w-3a', 'never w-3b, never "the day"');
      assert.equal(day.weight, 80.9);
      assert.equal(day.entryCount, 2);
    }
  });

  test('exactly one row per date, newest first, each carrying recordId, weight and entryCount; a 0 kg record never hides a real one', () => {
    const rows = dashboardWeightRows(weights);
    assert.deepEqual(rows.map((r) => [r.date, r.recordId, r.weight, r.entryCount]), [
      ['2026-11-01', 'w-0', 80, 1],
      ['2026-10-29', 'w-3a', 80.9, 2],
      ['2026-10-20', 'w-20', 82, 1],
      ['2026-10-10', 'w-10', 83, 1],
    ]);
  });

  test('it is the Weight page plan: same function, same "drawable" rule (weight > 0)', () => {
    const page = recordChartRows(planRecordPlot(weights, (entry) => entry.weight > 0), 'weight', (entry) => entry.weight);
    assert.deepEqual(dashboardWeightRows(weights), page);
  });

  test('empty in, empty out; every row is a Compare-eligible weight record', () => {
    assert.deepEqual(dashboardWeightRows([]), []);
    const rows = dashboardWeightRows(weights);
    const dataset = createChartDataset({
      name: 'Weight Trend', period: 'p', rows,
      columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }],
      selection: { metric: 'weight', valueKeys: ['weight'], recordId: (r) => r.recordId as string, compare: { valueKey: 'weight', noun: 'weight entry', unit: 'kg' } },
    });
    for (const point of selectableChartPoints(dataset)) {
      const result = compareCandidate(dataset, point);
      assert.equal(result?.ok, true);
      assert.equal(result?.ok && result.pick.recordId, rows.find((r) => r.date === point.day.isoDate)!.recordId);
    }
  });
});

const sleeps = [
  { id: 's-1', date: '2026-10-31', hours: 7.5 }, // manual + WHOOP
  { id: 's-4x', date: '2026-10-28', hours: 5.1 }, // two manual nights
  { id: 's-4', date: '2026-10-28', hours: 6.2 },
  { id: 's-0', date: '2026-10-27', hours: 0 }, // not drawable
];
const whoop = [
  { date: '2026-10-31', total_in_bed_hours: 8.1 },
  { date: '2026-10-30', total_in_bed_hours: 7.7 }, // WHOOP only
  { date: '2026-10-29', total_in_bed_hours: null }, // nothing
  { date: '2026-10-27', total_in_bed_hours: 6.5 }, // WHOOP only (the manual 0 is not a night)
];

describe('Dashboard sleep rows: manual record id only for manual hours', () => {
  const rows = dashboardSleepRows(sleeps, whoop);
  const on = (date: string) => rows.find((r) => r.date === date);

  test('manual + WHOOP keeps the manual record id; WHOOP-only days have NO record id', () => {
    assert.deepEqual(on('2026-10-31'), { date: '2026-10-31', hours: 7.5, whoopHours: 8.1, recordId: 's-1', entryCount: 1 });
    assert.equal(on('2026-10-30')!.recordId, undefined);
    assert.equal(on('2026-10-30')!.hours, 0, 'manual hours are 0 (the chart wrapper turns that into no value)');
    assert.equal(on('2026-10-30')!.whoopHours, 7.7);
    assert.equal(on('2026-10-27')!.recordId, undefined, 'a 0 hour manual entry is not a record to compare');
  });

  test('two manual nights on a day: only the lowest id is plotted, with the count', () => {
    assert.deepEqual(on('2026-10-28'), { date: '2026-10-28', hours: 6.2, whoopHours: 0, recordId: 's-4', entryCount: 2 });
    assert.deepEqual(dashboardSleepRows([...sleeps].reverse(), whoop), rows, 'arrival order never matters');
  });

  test('days with nothing drawable are absent; newest first; one row per date', () => {
    assert.deepEqual(rows.map((r) => r.date), ['2026-10-31', '2026-10-30', '2026-10-28', '2026-10-27']);
  });

  test('it is the Sleep page plan: same functions and rule', () => {
    assert.deepEqual(rows, sleepChartRows(planRecordPlot(sleeps, (entry) => entry.hours > 0), whoop));
  });

  test('Compare eligibility from these rows: manual yes; a WHOOP press refused; a WHOOP-only day refused', () => {
    const plotRows = rows.map((r) => ({ ...r, hours: r.hours || null, whoopHours: r.whoopHours || null }));
    const dataset = createChartDataset({
      name: 'Sleep', period: 'p', rows: plotRows,
      columns: [{ key: 'date', label: 'Date' }, { key: 'hours', label: 'Manual Sleep', unit: 'hrs' }, { key: 'whoopHours', label: 'WHOOP In Bed', unit: 'hrs' }],
      selection: {
        metric: 'sleep', valueKeys: ['hours', 'whoopHours'],
        recordId: (r) => (typeof r.recordId === 'string' && typeof r.hours === 'number' ? r.recordId : undefined),
        compare: { valueKey: 'hours', noun: 'manual sleep entry', unit: 'hrs' },
      },
    });
    const point = (date: string) => selectableChartPoints(dataset).find((p) => p.day.isoDate === date) ?? null;
    const manual = compareCandidate(dataset, point('2026-10-31'), null);
    assert.equal(manual?.ok && manual.pick.recordId, 's-1');
    assert.equal(compareCandidate(dataset, point('2026-10-31'), 'hours')?.ok, true);
    const whoopPress = compareCandidate(dataset, point('2026-10-31'), 'whoopHours');
    assert.equal(whoopPress?.ok === false && whoopPress.reason, 'not-manual-source');
    const whoopOnly = compareCandidate(dataset, point('2026-10-30'), null);
    assert.equal(whoopOnly?.ok === false && whoopOnly.reason, 'not-a-record');
  });
});

describe('who opts in (source contract)', () => {
  test('Compare is off by default: TrendChart enables it only from daySelection.compare WITH a recordId', () => {
    const trend = read('src/components/TrendChart.tsx');
    assert.match(trend, /compare: daySelection\?\.recordId \? daySelection\.compare : undefined/);
  });

  test('WeightChart and SleepChart pass compare config only when the Dashboard asks (compare prop)', () => {
    const weight = read('src/components/WeightChart.tsx');
    const sleep = read('src/components/SleepChart.tsx');
    assert.match(weight, /daySelection=\{compare \? compareSelection : undefined\}/);
    assert.match(sleep, /daySelection=\{compare \? compareSelection : undefined\}/);
    assert.match(weight, /valueKey: 'weight', noun: 'weight entry'/);
    assert.match(sleep, /valueKey: 'hours', noun: 'manual sleep entry'/);
  });

  test('the Dashboard gives exact-record Open in Compare to Weight and Sleep only; Waist and every other chart get no compare prop (they still compare in the viewer)', () => {
    const dash = read('src/pages/Dashboard.tsx');
    assert.match(dash, /<WeightChart compare data=\{weightChartData\}/);
    assert.match(dash, /<SleepChart compare data=\{sleepChartData\}/);
    assert.match(dash, /<WaistChart data=\{waistChartData\}/);
    assert.equal((dash.match(/\bcompare\b(?= data=)/g) ?? []).length, 2);
    // No exact-record config and no `compare` prop outside Weight and Sleep. (MacroTargetChart, MealTimeChart and BodyRecompositionCard own
    // the in-viewer comparison hook; that never produces a link: tests/chartPointCompare.test.ts "who gets what".)
    assert.doesNotMatch(read('src/components/WaistChart.tsx'), /compare: \{ valueKey|compare\?: boolean|\bcompare\b\s*[=?]/);
    for (const file of ['RecoveryChart', 'WorkoutDurationChart', 'CalorieBalanceChart']) {
      assert.doesNotMatch(read(`src/components/${file}.tsx`), /compare\s*[:=]|useChartComparePicks|compare: \{ valueKey/);
    }
    for (const file of ['MacroTargetChart', 'MealTimeChart', 'BodyRecompositionCard']) {
      assert.doesNotMatch(read(`src/components/${file}.tsx`), /compare: \{ valueKey|compare\?: boolean/);
    }
  });

  test('Dashboard rows come from the shared helper (identity rule in one place)', () => {
    const dash = read('src/pages/Dashboard.tsx');
    assert.match(dash, /dashboardWeightRows\(weightEntries\)/);
    assert.match(dash, /dashboardSleepRows\(sleepEntries, whoopEntries\)/);
  });
});

describe('Dashboard Waist: one deterministic measurement per UTC date', () => {
  const waist = [
    { id: 'x-1', date: '2026-10-29', waist: 90 },
    { id: 'x-0', date: '2026-10-29', waist: 89.5 },
    { id: 'x-2', date: '2026-10-22', waist: 91 },
    { id: 'x-9', date: '2026-10-15', waist: 0 }, // nothing drawable: never plotted, never hides a good record
    { id: 'x-8', date: '2026-10-15', waist: 92 },
  ];

  test('the lowest id of a day wins and the result does not depend on the order the rows arrived in', () => {
    const forward = dashboardWaistRows(waist);
    assert.deepEqual(forward, dashboardWaistRows([...waist].reverse()));
    assert.deepEqual(forward, dashboardWaistRows([waist[2], waist[4], waist[0], waist[3], waist[1]]));
    assert.deepEqual(forward.map((r) => [r.date, r.recordId, r.waist, r.entryCount]), [['2026-10-29', 'x-0', 89.5, 2], ['2026-10-22', 'x-2', 91, 1], ['2026-10-15', 'x-8', 92, 1]]);
  });

  test('the same plan as the Waist page, and the input is never changed', () => {
    const copy = JSON.stringify(waist);
    assert.deepEqual(dashboardWaistRows(waist), recordChartRows(planRecordPlot(waist, (e) => e.waist > 0), 'waist', (e) => e.waist));
    assert.equal(JSON.stringify(waist), copy);
  });

  test('the Dashboard uses it and the chart gets no exact-record config (in-viewer comparison only)', () => {
    assert.match(read('src/pages/Dashboard.tsx'), /dashboardWaistRows\(waistEntries\)/);
    assert.match(read('src/pages/Dashboard.tsx'), /<WaistChart data=\{waistChartData\}/);
    assert.doesNotMatch(read('src/components/WaistChart.tsx'), /compare: \{ valueKey|compare\?: boolean/);
  });
});
