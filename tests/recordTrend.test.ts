import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChartDataset } from '../src/lib/chartViewerData';
import { resolveChartSelection, selectableChartPoints } from '../src/lib/chartSelection';
import { groupByMonth, sortNewestFirst } from '../src/lib/bodyHistory';
import { pageOfItem } from '../src/lib/historyPaging';
import { planRecordPlot, recordChartRows, revealStatus, sleepChartRows, smallestRangeIncluding } from '../src/lib/recordTrend';

// Record-backed trend charts (Weight, Waist, Sleep): which exact record a chart point is, and how a record is found in the
// history list. Pure rules only; mounted behaviour (point <-> row, focus, filters, accounts) is in tests/mounted/recordTrendLinks.dom.tsx.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const w = (id: string, date: string, weight: number) => ({ id, date, weight });

describe('planRecordPlot: one exact record per day', () => {
  test('one record per day is plotted as itself', () => {
    const plan = planRecordPlot([w('b', '2026-10-30', 80), w('a', '2026-10-29', 81)]);
    assert.deepEqual(plan.plotted.map((e) => e.id), ['b', 'a']); // newest day first
    assert.equal(plan.statusOf('a'), 'plotted');
    assert.equal(plan.ambiguousDays, 0);
  });

  test('two records on one day: the lowest id is plotted, whatever order they arrive in', () => {
    const rows = [w('r-9', '2026-10-30', 80.4), w('r-2', '2026-10-30', 79.8), w('r-5', '2026-10-30', 80.1)];
    for (const order of [rows, [...rows].reverse(), [rows[1], rows[2], rows[0]]]) {
      const plan = planRecordPlot(order);
      assert.deepEqual(plan.plotted.map((e) => e.id), ['r-2']);
      assert.equal(plan.statusOf('r-2'), 'plotted');
      assert.equal(plan.statusOf('r-9'), 'same-day');
      assert.equal(plan.statusOf('r-5'), 'same-day');
      assert.equal(plan.countOnDay('2026-10-30'), 3);
      assert.equal(plan.ambiguousDays, 1);
    }
  });

  test('a record with nothing to draw never hides a real one and is not-plotted', () => {
    const plan = planRecordPlot([w('a', '2026-10-30', 0), w('b', '2026-10-30', 80)], (e) => e.weight > 0);
    assert.deepEqual(plan.plotted.map((e) => e.id), ['b']);
    assert.equal(plan.statusOf('a'), 'not-plotted');
    assert.equal(plan.statusOf('b'), 'plotted');
    assert.equal(plan.countOnDay('2026-10-30'), 1);
    assert.equal(plan.statusOf('nope'), 'not-plotted');
  });

  test('does not change its input', () => {
    const rows = [w('b', '2026-10-30', 80), w('a', '2026-10-30', 81)];
    const copy = structuredClone(rows);
    planRecordPlot(rows);
    assert.deepEqual(rows, copy);
  });
});

describe('chart rows carry the exact record id and the shared selection resolves to it', () => {
  const entries = [w('id-b', '2026-10-30', 80.4), w('id-a', '2026-10-30', 79.8), w('id-c', '2026-10-29', 81)];
  const rows = recordChartRows(planRecordPlot(entries), 'weight', (e) => e.weight).reverse(); // the chart runs oldest -> newest

  test('rows: one per day, with record id, value and how many entries the day has', () => {
    assert.deepEqual(rows, [
      { date: '2026-10-29', recordId: 'id-c', entryCount: 1, weight: 81 },
      { date: '2026-10-30', recordId: 'id-a', entryCount: 2, weight: 79.8 },
    ]);
  });

  test('a dataset built like RecordTrendChart makes the point a `record` origin with that exact id', () => {
    const dataset = createChartDataset({
      name: 'Weight Trend', period: 'Last 30 days', rows,
      columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }],
      selection: { metric: 'weight', valueKeys: ['weight'], recordId: (row) => (typeof row.recordId === 'string' && typeof row.weight === 'number' ? row.recordId : undefined) },
    });
    const points = selectableChartPoints(dataset);
    assert.deepEqual(points.map((p) => [p.day.isoDate, p.day.origin?.kind, p.day.origin?.recordId]), [
      ['2026-10-29', 'record', 'id-c'],
      ['2026-10-30', 'record', 'id-a'],
    ]);
    // The selection is keyed by the row id (the date) and always resolves to the same exact record, never to the sibling.
    const picked = resolveChartSelection(points, dataset.rowId(rows[1], 1));
    assert.equal(picked?.day.origin?.recordId, 'id-a');
  });

  test('a same-day duplicate in the chart rows would still be two distinct record selections (not collapsed into one day)', () => {
    const dataset = createChartDataset({
      name: 'x', period: 'x',
      rows: [{ date: '2026-10-30', weight: 80, recordId: 'one' }, { date: '2026-10-30', weight: 81, recordId: 'two' }],
      columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight' }],
      selection: { metric: 'weight', valueKeys: ['weight'], recordId: (row) => String(row.recordId) },
    });
    assert.deepEqual(selectableChartPoints(dataset).map((p) => p.day.origin?.recordId), ['one', 'two']);
  });
});

describe('sleepChartRows: manual record vs WHOOP aggregate', () => {
  const sleep = [{ id: 's2', date: '2026-10-30', hours: 7 }, { id: 's1', date: '2026-10-30', hours: 6 }, { id: 's0', date: '2026-10-28', hours: 8 }];
  const whoop = [
    { date: '2026-10-30', total_in_bed_hours: 7.5 },
    { date: '2026-10-29', total_in_bed_hours: 8.1 },
    { date: '2026-10-27', total_in_bed_hours: null },
    { date: '2026-10-26', total_in_bed_hours: 0 },
  ];
  const rows = sleepChartRows(planRecordPlot(sleep, (e) => e.hours > 0), whoop);

  test('a manual day carries its exact record id; a WHOOP-only day has none', () => {
    assert.deepEqual(rows, [
      { date: '2026-10-30', hours: 6, whoopHours: 7.5, recordId: 's1', entryCount: 2 },
      { date: '2026-10-29', hours: 0, whoopHours: 8.1, entryCount: 0 },
      { date: '2026-10-28', hours: 8, whoopHours: 0, recordId: 's0', entryCount: 1 },
    ]);
    assert.equal(rows[1].recordId, undefined);
  });

  test('WHOOP rows with no in-bed hours are not days of their own', () => {
    assert.equal(rows.some((r) => r.date === '2026-10-27' || r.date === '2026-10-26'), false);
  });

  test('selection: the manual day is a record, the WHOOP-only day stays a daily aggregate (no jump)', () => {
    const chartRows = rows.map((r) => ({ ...r, hours: r.hours || null, whoopHours: r.whoopHours || null })).reverse();
    const dataset = createChartDataset({
      name: 'Sleep', period: 'x', rows: chartRows,
      columns: [{ key: 'date', label: 'Date' }, { key: 'hours', label: 'Manual' }, { key: 'whoopHours', label: 'WHOOP' }],
      selection: { metric: 'sleep', valueKeys: ['hours', 'whoopHours'], recordId: (row) => (typeof row.recordId === 'string' && typeof row.hours === 'number' ? row.recordId : undefined) },
    });
    assert.deepEqual(selectableChartPoints(dataset).map((p) => [p.day.isoDate, p.day.origin?.kind, p.day.origin?.recordId]), [
      ['2026-10-28', 'record', 's0'],
      ['2026-10-29', 'daily-aggregate', undefined],
      ['2026-10-30', 'record', 's1'],
    ]);
  });
});

describe('revealStatus: can the list show this exact record?', () => {
  const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  test('visible, hidden by filters, or gone', () => {
    assert.equal(revealStatus('a', all, [{ id: 'a' }]), 'visible');
    assert.equal(revealStatus('b', all, [{ id: 'a' }]), 'filtered-out');
    assert.equal(revealStatus('b', all, []), 'filtered-out');
    assert.equal(revealStatus('zzz', all, all), 'missing');
  });
});

describe('pageOfItem: the history page and group holding an exact record', () => {
  // 7 months, 3 months per page (the list's MONTHS_PER_PAGE), entries 1 per month except October with 2 on the same day.
  const entries = [
    { id: 'o2', date: '2026-10-30' }, { id: 'o1', date: '2026-10-30' },
    { id: 'sep', date: '2026-09-12' }, { id: 'aug', date: '2026-08-12' }, { id: 'jul', date: '2026-07-12' },
    { id: 'jun', date: '2026-06-12' }, { id: 'may', date: '2026-05-12' }, { id: 'apr', date: '2026-04-12' },
  ];
  const groups = groupByMonth(sortNewestFirst(entries));
  const paging = { maxGroups: 3, targetItems: 40 };
  const find = (id: string) => pageOfItem(groups, paging, (item) => (item as { id: string }).id === id);

  test('finds the page for records in the first, middle and last group', () => {
    assert.equal(find('o1'), 1);
    assert.equal(find('o2'), 1);
    assert.equal(find('jul'), 2);
    assert.equal(find('apr'), 3);
  });
  test('a record that is not in the list has no page', () => {
    assert.equal(find('nope'), null);
    assert.equal(pageOfItem([], paging, () => true), null);
  });
  test('a flat (value sorted) list pages by its own size', () => {
    const flat = entries.map((e) => ({ key: e.id, items: [e] }));
    assert.equal(pageOfItem(flat, { maxGroups: 3, targetItems: 3 }, (item) => (item as { id: string }).id === 'jul'), 2);
    assert.equal(pageOfItem(flat, { maxGroups: 3, targetItems: 3 }, (item) => (item as { id: string }).id === 'apr'), 3);
  });
});

describe('smallestRangeIncluding: widening a range to show a record', () => {
  const today = '2026-10-31';
  const all = ['7', '14', '30', '90', 'all'] as const;
  const std = ['7', '14', '30', '90'] as const;
  test('picks the smallest window that contains the date', () => {
    assert.equal(smallestRangeIncluding('2026-10-31', all, today), '7');
    assert.equal(smallestRangeIncluding('2026-10-25', all, today), '7');
    assert.equal(smallestRangeIncluding('2026-10-24', all, today), '14');
    assert.equal(smallestRangeIncluding('2026-10-02', all, today), '30');
    assert.equal(smallestRangeIncluding('2026-10-01', all, today), '90'); // the 30 day window starts 2026-10-02
    assert.equal(smallestRangeIncluding('2026-08-15', all, today), '90');
    assert.equal(smallestRangeIncluding('2025-01-01', all, today), 'all');
  });
  test('null when no offered range goes back that far (Sleep has no "All")', () => {
    assert.equal(smallestRangeIncluding('2025-01-01', std, today), null);
    assert.equal(smallestRangeIncluding('2026-11-05', std, today), null);
    assert.equal(smallestRangeIncluding('2026-11-05', all, today), 'all');
  });
});

describe('wiring guards (source)', () => {
  test('each page links its chart to the history list with the same chart id as the Dashboard', () => {
    for (const [page, chart, id] of [['Weight', 'WeightChart', 'weight'], ['Waist', 'WaistChart', 'waist'], ['Sleep', 'SleepChart', 'sleep']]) {
      const src = read(`src/pages/${page}.tsx`);
      assert.match(src, new RegExp(`<${chart}[^>]*recordLink=\\{trend\\.chartLink\\}`), page);
      assert.match(src, /chartLink=\{trend\.listLink\}/, page);
      assert.match(src, /reveal=\{trend\.reveal\}/, page);
      assert.match(src, /<TrendSection/, page);
      // The chart is drawn only when the entries loaded and exist (never on a first-load error or an empty list).
      assert.match(src, /view === 'ready' && entries\.length > 0/, page);
      assert.match(read(`src/components/${chart}.tsx`), new RegExp(`<RecordTrendChart[^>]*id="${id}"`), chart);
      assert.match(read(`src/components/${chart}.tsx`), new RegExp(`<TrendChart[^>]*id="${id}"`), chart);
    }
  });
  test('the log form stays first: the trend section comes after the "Log and overview" section and before the history', () => {
    for (const page of ['Weight', 'Waist', 'Sleep']) {
      const src = read(`src/pages/${page}.tsx`);
      const log = src.indexOf('Log and overview');
      const trend = src.indexOf('<TrendSection');
      const history = src.indexOf(`${page} history"`);
      assert.ok(log > 0 && log < trend && trend < history, page);
    }
  });
  test('the Sleep page reads the shared WHOOP rows through the existing hook (no second fetch path)', () => {
    const src = read('src/pages/Sleep.tsx');
    assert.match(src, /useWhoopData\(\)/);
    assert.doesNotMatch(src, /supabase|fetch\(/);
  });
});
