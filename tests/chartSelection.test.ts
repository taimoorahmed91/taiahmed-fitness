import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChartDataset } from '../src/lib/chartViewerData';
import { chartPointValues, pointForPlotClick, resolveChartSelection, selectableChartPoints, stepChartSelection } from '../src/lib/chartSelection';
import { buildCalendarHref, selectedDayKey } from '../src/lib/selectedDay';

// Chart day selection: the pure identity, eligibility, stepping and reset rules (src/lib/chartSelection.ts), the
// dataset contract that carries them, and the explicit opt-outs. Mounted behaviour: tests/mounted/chartDaySelection.dom.tsx.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const weight = [
  { date: '2026-10-28', weight: 80.4 },
  { date: '2026-10-29', weight: null },
  { date: '2026-10-30', weight: 80.1 },
  { date: '2026-10-31', weight: 0 },
];
const make = (rows: Record<string, unknown>[], selection: Parameters<typeof createChartDataset>[0]['selection'] = { metric: 'weight', valueKeys: ['weight'] }) =>
  createChartDataset({
    name: 'Weight Trend', period: 'Last 30 days', rows,
    columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }],
    selection,
  });

describe('which rows are selectable days', () => {
  test('a row needs a real ISO date and a real number; null rows are skipped, a real 0 is a value', () => {
    const points = selectableChartPoints(make(weight));
    assert.deepEqual(points.map((p) => p.day.isoDate), ['2026-10-28', '2026-10-30', '2026-10-31']);
  });

  test('daily rows are daily aggregates with the metric; no series key, label or index in the identity', () => {
    const [first] = selectableChartPoints(make(weight));
    assert.deepEqual(first.day, { isoDate: '2026-10-28', origin: { kind: 'daily-aggregate', metric: 'weight' } });
    assert.equal(first.rowId, '2026-10-28');
    assert.equal(selectedDayKey(first.day), JSON.stringify(['2026-10-28', 'daily-aggregate', 'weight', null, null]));
  });

  test('an exact record id turns the origin into a record; a blank id stays a daily aggregate', () => {
    const rows = [{ date: '2026-10-28', weight: 80, id: 'w-1' }, { date: '2026-10-30', weight: 81, id: '' }];
    const points = selectableChartPoints(make(rows, { metric: 'weight', valueKeys: ['weight'], recordId: (r) => r.id as string }));
    assert.deepEqual(points[0].day.origin, { kind: 'record', metric: 'weight', recordId: 'w-1' });
    assert.equal(points[1].day.origin?.kind, 'daily-aggregate');
  });

  test('impossible, non-ISO and label dates are never selectable (so there is never an Open day link for them)', () => {
    const rows = ['10/30', '2026-02-30', '2025-02-29', '2026-13-01', 'Oct 30', '', '2026-10-30T10:00:00Z'].map((date) => ({ date, weight: 80 }));
    assert.deepEqual(selectableChartPoints(make(rows)), []);
  });

  test('target columns are not value keys: a row that only has a target is not a day', () => {
    const rows = [{ date: '2026-10-28', actual: 1500, min: 1800 }, { date: '2026-10-29', actual: null, min: 1800 }];
    const dataset = createChartDataset({
      name: 'Calories', period: 'Last 7 days', rows,
      columns: [{ key: 'date', label: 'Date' }, { key: 'actual', label: 'Actual' }, { key: 'min', label: 'Min target' }],
      selection: { metric: 'calories', valueKeys: ['actual'] },
    });
    assert.deepEqual(selectableChartPoints(dataset).map((p) => p.day.isoDate), ['2026-10-28']);
    assert.equal(pointForPlotClick(dataset, selectableChartPoints(dataset), '2026-10-28', 'min'), null, 'clicking the target series does nothing');
    assert.equal(pointForPlotClick(dataset, selectableChartPoints(dataset), '2026-10-29', 'actual'), null, 'a null point does nothing');
  });

  test('a repeated date is one daily aggregate, not two selections', () => {
    const points = selectableChartPoints(make([{ date: '2026-10-28', weight: 80 }, { date: '2026-10-28', weight: 81 }]));
    assert.equal(points.length, 1);
    assert.equal(points[0].rowId, '2026-10-28', 'the first row keeps the plain id');
  });

  test('NaN and Infinity are not values', () => {
    assert.deepEqual(selectableChartPoints(make([{ date: '2026-10-28', weight: Number.NaN }, { date: '2026-10-29', weight: Infinity }])), []);
  });
});

describe('opt-out and capabilities', () => {
  test('no selection config, or `selection: false`, means nothing is selectable and the capability is off', () => {
    const columns = [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }];
    for (const selection of [undefined, false] as const) {
      const dataset = createChartDataset({ name: 'Weight Trend', period: 'Last 30 days', rows: weight, columns, selection });
      assert.equal(dataset.capabilities.daySelection, false);
      assert.equal(dataset.selection, undefined);
      assert.deepEqual(selectableChartPoints(dataset), []);
      assert.equal(stepChartSelection(selectableChartPoints(dataset), null, 1), null);
    }
  });

  test('a configured dataset advertises it, and the Table / CSV rows are untouched', () => {
    const dataset = make(weight);
    assert.equal(dataset.capabilities.daySelection, true);
    assert.equal(dataset.rows.length, 4, 'the table and CSV still list every row, including the null one');
    assert.equal(dataset.capabilities.csv, true);
  });

  test('categorical and period-derived charts opt out explicitly, and say why', () => {
    const meal = read('src/components/MealTimeChart.tsx');
    assert.match(meal, /selection: false/);
    assert.match(meal, /Explicit opt-out of day selection: a row is a time-of-day band/);
    const body = read('src/components/BodyRecompositionCard.tsx');
    assert.match(body, /selection: false/);
    assert.match(body, /Explicit opt-out of day selection: the index is derived over the whole period/);
    for (const src of [meal, body]) assert.doesNotMatch(src, /useChartDaySelection|ChartDayReadout|selectableDot/);
  });

  test('only TrendChart and MacroTargetChart turn day selection on; weekly, delta and report charts stay off', () => {
    for (const file of ['src/components/TrendChart.tsx', 'src/components/MacroTargetChart.tsx']) assert.match(read(file), /useAccountChartSelection\(dataset\)/);
    for (const file of ['src/components/charts/WeeklyBarChart.tsx', 'src/components/charts/DeltaChart.tsx', 'src/components/ReportCharts.tsx']) {
      const src = read(file);
      assert.doesNotMatch(src, /selection:\s*\{/, file);
      assert.doesNotMatch(src, /useChartDaySelection/, file);
    }
  });

  test('the macro chart selects by actual intake only (targets are limits, never the selection)', () => {
    assert.match(read('src/components/MacroTargetChart.tsx'), /valueKeys: \['actual'\]/);
  });

  test('every selectable line gives its hover dot pointer-events: none, so a press reaches the hit area under it', () => {
    // Recharts draws the hover dot above the dots layer; the min / max target lines have one too (found in a real browser).
    const macro = read('src/components/MacroTargetChart.tsx');
    assert.equal((macro.match(/activeDot=\{selectable \? selectableActiveDot\(\d\) : /g) ?? []).length, 3, 'actual, min and max lines');
    assert.match(read('src/components/TrendChart.tsx'), /activeDot=\{selectable \? selectableActiveDot\(5\)/);
    assert.match(read('src/components/charts/ChartSelectionMarks.tsx'), /pointerEvents: 'none'/);
  });
});

describe('selection identity and visible-range reset', () => {
  const dataset = make([
    { date: '2026-10-24', weight: 81 }, { date: '2026-10-25', weight: 80.8 }, { date: '2026-10-26', weight: 80.6 },
    { date: '2026-10-27', weight: 80.5 }, { date: '2026-10-28', weight: 80.4 },
  ]);
  const all = selectableChartPoints(dataset);

  test('a selection resolves by id and survives re-deriving the points (a line/bar switch keeps the same rows)', () => {
    const again = selectableChartPoints(make(dataset.rows as Record<string, unknown>[]));
    assert.equal(resolveChartSelection(again, '2026-10-26')?.day.isoDate, '2026-10-26');
    assert.deepEqual(resolveChartSelection(all, '2026-10-26'), resolveChartSelection(again, '2026-10-26'));
  });

  test('when the selected row leaves the visible range it resolves to null (the component then clears it)', () => {
    const last3 = selectableChartPoints(make((dataset.rows as Record<string, unknown>[]).slice(-3)));
    assert.equal(resolveChartSelection(last3, '2026-10-24'), null);
    assert.equal(resolveChartSelection(last3, '2026-10-27')?.rowId, '2026-10-27');
  });

  test('an index or a label is never an id: only the dataset row id resolves', () => {
    assert.equal(resolveChartSelection(all, '0'), null);
    assert.equal(resolveChartSelection(all, 'Oct 26'), null);
    assert.equal(resolveChartSelection(all, null), null);
    assert.equal(resolveChartSelection(all, undefined), null);
  });

  test('a plot click uses only the ISO date string; unknown dates, wrong types and non-value series do nothing', () => {
    assert.equal(pointForPlotClick(dataset, all, '2026-10-25', 'weight')?.rowId, '2026-10-25');
    assert.equal(pointForPlotClick(dataset, all, '2026-11-25', 'weight'), null);
    assert.equal(pointForPlotClick(dataset, all, 3, 'weight'), null);
    assert.equal(pointForPlotClick(dataset, all, { date: '2026-10-25' }, 'weight'), null);
    assert.equal(pointForPlotClick(dataset, all, '2026-10-25', 'height'), null);
  });
});

describe('Previous / Next date stepping', () => {
  const points = selectableChartPoints(make(weight));
  const ids = points.map((p) => p.rowId);

  test('steps through selectable days only, skipping the null day', () => {
    assert.equal(stepChartSelection(points, ids[0], 1)?.rowId, '2026-10-30');
    assert.equal(stepChartSelection(points, ids[1], -1)?.rowId, '2026-10-28');
  });

  test('stops at both ends (null), so a disabled button knows it has nowhere to go', () => {
    assert.equal(stepChartSelection(points, ids[0], -1), null);
    assert.equal(stepChartSelection(points, ids[ids.length - 1], 1), null);
  });

  test('with nothing selected, Previous starts at the newest day and Next at the oldest', () => {
    assert.equal(stepChartSelection(points, null, -1)?.rowId, '2026-10-31');
    assert.equal(stepChartSelection(points, null, 1)?.rowId, '2026-10-28');
    assert.equal(stepChartSelection(points, 'gone', -1)?.rowId, '2026-10-31', 'a stale id behaves like no selection');
  });

  test('no points: nowhere to step', () => {
    assert.equal(stepChartSelection([], null, 1), null);
  });
});

describe('readout values', () => {
  test('values use the table rounding and the unit; unknown values are left out, a real 0 stays', () => {
    const dataset = make(weight);
    assert.deepEqual(chartPointValues(dataset, '2026-10-28'), [{ key: 'weight', label: 'Weight', text: '80.4 kg' }]);
    assert.deepEqual(chartPointValues(dataset, '2026-10-29'), []);
    assert.deepEqual(chartPointValues(dataset, '2026-10-31'), [{ key: 'weight', label: 'Weight', text: '0 kg' }]);
    assert.deepEqual(chartPointValues(dataset, 'nope'), []);
  });
});

describe('Calendar link', () => {
  test('Open day is the Calendar address for the ISO day, and keeps unrelated parameters when asked', () => {
    assert.equal(buildCalendarHref('2026-10-30'), '/calendar?date=2026-10-30');
    assert.equal(buildCalendarHref('2026-10-30', 'view=compact&date=1999-01-01'), '/calendar?view=compact&date=2026-10-30');
  });

  test('an invalid date never produces a dated link (and no chart row with one is ever selectable)', () => {
    assert.equal(buildCalendarHref('10/30'), '/calendar');
    assert.deepEqual(selectableChartPoints(make([{ date: '10/30', weight: 80 }])), []);
  });

  test('the card readout links through buildCalendarHref and is guarded by isValidIsoDate', () => {
    const ui = read('src/components/charts/ChartDaySelectionUi.tsx');
    assert.match(ui, /buildCalendarHref\(iso\)/);
    assert.match(ui, /isValidIsoDate\(iso\)/);
  });
});

describe('insight evidence dates', () => {
  test('Dashboard and Reports pass the Calendar adapter to their insight cards', () => {
    const dashboard = read('src/pages/Dashboard.tsx');
    assert.match(dashboard, /const openCalendarDay = useOpenCalendarDay\(\)/);
    assert.match(dashboard, /<CrossMetricSummaryCard onSelectDate=\{openCalendarDay\} \/>/);
    const reports = read('src/pages/Reports.tsx');
    assert.match(reports, /const openCalendarDay = useOpenCalendarDay\(\)/);
    assert.match(reports, /<InsightCard key=\{i\} insight=\{insight\} onSelectDate=\{openCalendarDay\} \/>/);
  });

  test('the adapter only navigates for real ISO dates, with a normal push to the shared Calendar address', () => {
    const hook = read('src/components/charts/useOpenCalendarDay.ts');
    assert.match(hook, /isValidIsoDate\(isoDate\)/);
    assert.match(hook, /navigate\(buildCalendarHref\(isoDate\)\)/);
    assert.doesNotMatch(hook, /replace/);
  });

  test('evidence calculation and copy are untouched by this integration', () => {
    assert.match(read('src/components/insights/InsightEvidence.tsx'), /onSelectDate\?: \(isoDate: string\) => void/);
  });
});

describe('viewer wiring', () => {
  const dialog = read('src/components/charts/ChartFullscreenDialog.tsx');

  test('the day panel is an inline section of the viewer, not a nested dialog', () => {
    assert.match(dialog, /<ChartSelectedDayPanel day=\{selection\.selected\.day\} \/>/);
    const ui = read('src/components/charts/ChartDaySelectionUi.tsx');
    assert.doesNotMatch(ui, /<Dialog|DialogContent|Popover/);
    assert.match(ui, /ConnectedSelectedDayPanel/);
  });

  test('selection controls stay out of PDFs', () => {
    const ui = read('src/components/charts/ChartDaySelectionUi.tsx');
    assert.equal((ui.match(/data-html2canvas-ignore="true"/g) ?? []).length, 3);
  });

  test('stepper buttons use aria-disabled at the ends so keyboard focus is never dropped', () => {
    const ui = read('src/components/charts/ChartDaySelectionUi.tsx');
    assert.match(ui, /aria-disabled=\{canPrev \? undefined : true\}/);
    assert.match(ui, /aria-disabled=\{canNext \? undefined : true\}/);
  });
});
