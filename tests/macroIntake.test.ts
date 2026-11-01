import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayMacroIntake, isObservedIntake } from '../src/lib/macroIntake';
import { createChartDataset } from '../src/lib/chartViewerData';
import { pointForPlotClick, selectableChartPoints, stepChartSelection } from '../src/lib/chartSelection';

// Observed intake: what a day of meals really says about calories / protein / carbs, and which days a Macro chart may select.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('dayMacroIntake: the five cases', () => {
  test('no meals logged: unknown, not zero', () => {
    assert.deepEqual(dayMacroIntake([], 'protein'), { value: null, kind: 'no-meals', mealCount: 0 });
    assert.equal(dayMacroIntake([], 'calories').value, null);
  });

  test('meals logged but none has the macro written down: unknown, not zero', () => {
    const meals = [{ calories: 500, protein: null }, { calories: 300 }];
    assert.deepEqual(dayMacroIntake(meals, 'protein'), { value: null, kind: 'unrecorded', mealCount: 2 });
    assert.equal(dayMacroIntake(meals, 'carbs').kind, 'unrecorded');
  });

  test('only some meals have it: partial, and a partial sum is never presented as the day', () => {
    const meals = [{ calories: 500, carbs: 60 }, { calories: 300, carbs: null }];
    assert.deepEqual(dayMacroIntake(meals, 'carbs'), { value: null, kind: 'partial', mealCount: 2 });
  });

  test('an explicitly recorded zero is an observation and stays 0', () => {
    const meals = [{ calories: 120, carbs: 0 }, { calories: 80, carbs: 0 }];
    assert.deepEqual(dayMacroIntake(meals, 'carbs'), { value: 0, kind: 'recorded', mealCount: 2 });
  });

  test('every meal has it: the real total', () => {
    assert.deepEqual(dayMacroIntake([{ calories: 500, protein: 30 }, { calories: 300, protein: 12.5 }], 'protein'), { value: 42.5, kind: 'recorded', mealCount: 2 });
  });

  test('calories are required on a meal, so any day with meals is recorded for calories (a 0-calorie meal included)', () => {
    assert.deepEqual(dayMacroIntake([{ calories: 0 }], 'calories'), { value: 0, kind: 'recorded', mealCount: 1 });
  });

  test('NaN / Infinity are not recorded values', () => {
    assert.equal(dayMacroIntake([{ calories: 1, protein: Number.NaN }], 'protein').kind, 'unrecorded');
  });

  test('only "recorded" counts as observed; observation never depends on value > 0', () => {
    assert.equal(isObservedIntake('recorded'), true);
    for (const kind of ['no-meals', 'unrecorded', 'partial', undefined] as const) assert.equal(isObservedIntake(kind), false, String(kind));
    assert.doesNotMatch(read('src/lib/macroIntake.ts').replace(/^\/\/.*$/gm, ''), />\s*0/);
  });
});

describe('Macro chart eligibility', () => {
  const day = (date: string, actual: number | null, intake: ReturnType<typeof dayMacroIntake>['kind'] | undefined, target = true) =>
    ({ date, actual, intake, min: target ? 100 : null, max: target ? 160 : null });
  const rows = [
    day('2026-10-24', null, 'no-meals'),        // target only
    day('2026-10-25', null, 'unrecorded'),
    day('2026-10-26', null, 'partial'),
    day('2026-10-27', 0, 'recorded'),           // explicit zero
    day('2026-10-28', 120, 'recorded'),         // positive
    day('2026-10-29', null, 'no-meals', false), // nothing at all
    day('2026-10-30', 130, undefined),          // legacy row without intake: a number is an observation
  ];
  const dataset = createChartDataset({
    name: 'Protein: Actual vs Target', period: 'Last 7 days', rows,
    columns: [{ key: 'date', label: 'Date' }, { key: 'actual', label: 'Actual' }, { key: 'min', label: 'Min target' }, { key: 'max', label: 'Max target' }],
    selection: { metric: 'protein', valueKeys: ['actual'], isObserved: (row) => row.intake === undefined || isObservedIntake(row.intake as never) },
  });

  test('only observed actuals are selectable days: an explicit 0 yes; no meals, unrecorded, partial and target-only rows no', () => {
    assert.deepEqual(selectableChartPoints(dataset).map((p) => p.day.isoDate), ['2026-10-27', '2026-10-28', '2026-10-30']);
  });

  test('a filled-in number that is NOT an observation is refused even though it is a number', () => {
    const filled = createChartDataset({
      name: 'x', period: 'p', rows: [{ date: '2026-10-25', actual: 0, intake: 'no-meals' }, { date: '2026-10-26', actual: 0, intake: 'recorded' }],
      columns: [{ key: 'date', label: 'Date' }, { key: 'actual', label: 'Actual' }],
      selection: { metric: 'protein', valueKeys: ['actual'], isObserved: (row) => isObservedIntake(row.intake as never) },
    });
    assert.deepEqual(selectableChartPoints(filled).map((p) => p.day.isoDate), ['2026-10-26']);
  });

  test('plot clicks and stepping follow the same rule (targets and unobserved days do nothing)', () => {
    const points = selectableChartPoints(dataset);
    assert.equal(pointForPlotClick(dataset, points, '2026-10-26', 'actual'), null);
    assert.equal(pointForPlotClick(dataset, points, '2026-10-28', 'min'), null);
    assert.equal(pointForPlotClick(dataset, points, '2026-10-27', 'actual')?.rowId, '2026-10-27');
    assert.equal(stepChartSelection(points, '2026-10-27', 1)?.rowId, '2026-10-28');
    assert.equal(stepChartSelection(points, '2026-10-28', 1)?.rowId, '2026-10-30');
    assert.equal(stepChartSelection(points, null, -1)?.rowId, '2026-10-30');
  });

  test('the Table and CSV still list every row (null stays blank, 0 stays 0)', () => {
    assert.equal(dataset.rows.length, 7);
    assert.equal(dataset.rows[3].actual, 0);
    assert.equal(dataset.rows[0].actual, null);
  });
});

describe('Dashboard aggregation', () => {
  const page = read('src/pages/Dashboard.tsx');
  test('macro rows come from dayMacroIntake: no zero-filling, no `|| 0`, no reduce-to-0 for actual', () => {
    const block = page.slice(page.indexOf('const macroComparisonData'), page.indexOf('// Refresh every 30 minutes'));
    assert.match(block, /dayMacroIntake\(dayMeals, 'calories'\)/);
    assert.match(block, /dayMacroIntake\(dayMeals, 'protein'\)/);
    assert.match(block, /dayMacroIntake\(dayMeals, 'carbs'\)/);
    assert.doesNotMatch(block, /m\.protein \|\| 0|m\.carbs \|\| 0|reduce\(\(s, m\) => s \+ m\.calories, 0\)/);
    assert.match(block, /actual: cal\.value, intake: cal\.kind/);
  });

  test('the chart plots null as a gap: the actual line does not connect across unlogged days', () => {
    const chart = read('src/components/MacroTargetChart.tsx');
    assert.match(chart, /dataKey="actual"[^>]*name="actual" \/>/);
    assert.doesNotMatch(chart.match(/<Line[^>]*dataKey="actual"[^>]*>/)![0], /connectNulls/);
    assert.match(chart, /isObserved: \(row\) => row\.intake === undefined \|\| isObservedIntake\(row\.intake\)/);
  });
});
