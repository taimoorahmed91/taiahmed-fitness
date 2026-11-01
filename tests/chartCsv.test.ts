import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CSV_BOM, CSV_EOL, buildCsv, canExportCsv, csvField, csvFilename, csvSafeText } from '../src/lib/chartCsv';
import { createChartDataset, defaultRowId, describeAsOf, describeTableOrder, isUnknown, orderedRows, roundCell, tableCellText } from '../src/lib/chartViewerData';

// The data side of the full-screen viewer: the dataset contract, the table order and the CSV file.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const lines = (csv: string) => csv.slice(CSV_BOM.length).split(CSV_EOL);
const weightColumns = [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }];
const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const ds = (rows: Record<string, unknown>[], extra: Partial<Parameters<typeof createChartDataset>[0]> = {}) =>
  createChartDataset({ name: 'Weight Trend', period: 'Last 30 days', rows, columns: weightColumns, ...extra });

describe('CSV format', () => {
  test('BOM, header with units, CRLF after every line including the last', () => {
    const csv = buildCsv(ds([{ date: '2026-01-01', weight: 91 }, { date: '2026-01-02', weight: 92.5 }]))!;
    assert.equal(csv, `\uFEFFDate,Weight (kg)\r\n2026-01-01,91\r\n2026-01-02,92.5\r\n`);
    assert.equal(CSV_BOM, '\uFEFF');
    assert.equal(CSV_EOL, '\r\n');
    assert.equal(csv.includes('\n') && csv.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')), true, 'no bare LF');
  });
  test('RFC 4180 quoting: commas, quotes and newlines are wrapped and quotes doubled', () => {
    assert.equal(csvField('plain'), 'plain');
    assert.equal(csvField('a,b'), '"a,b"');
    assert.equal(csvField('say "hi"'), '"say ""hi"""');
    assert.equal(csvField('line1\nline2'), '"line1\nline2"');
    assert.equal(csvField('cr\rlf'), '"cr\rlf"');
    const csv = buildCsv(ds([{ date: '2026-01-01', weight: 1 }], { columns: [{ key: 'date', label: 'Date, UTC' }, { key: 'weight', label: 'Weight "net"', unit: 'kg' }] }))!;
    assert.equal(lines(csv)[0], '"Date, UTC","Weight ""net"" (kg)"');
    const text = buildCsv(createChartDataset({ name: 'T', period: 'p', rows: [{ name: 'Lunch, "big"\nmeal', n: 2 }], columns: [{ key: 'name', label: 'Name' }, { key: 'n', label: 'N' }] }))!;
    assert.equal(text.slice(CSV_BOM.length), 'Name,N\r\n"Lunch, ""big""\nmeal",2\r\n');
  });
  test('spreadsheet formula injection: text starting = + - @ (or tab / CR) gets a leading apostrophe', () => {
    for (const bad of ['=SUM(A1:A9)', '+1+1', '-2+3', '@cmd', '\t=1', '\r=1', '=HYPERLINK("http://x","y")']) {
      assert.equal(csvSafeText(bad), `'${bad}`, bad);
    }
    for (const ok of ['Morning', '2026-01-01', '10/30', 'a=b', 'x-y', '']) assert.equal(csvSafeText(ok), ok, ok);
    const csv = buildCsv(createChartDataset({ name: 'T', period: 'p', rows: [{ name: '=1+1', v: 1 }, { name: '@x', v: 2 }], columns: [{ key: 'name', label: '-Name' }, { key: 'v', label: 'V' }] }))!;
    assert.deepEqual(lines(csv).slice(0, 3), ["'-Name,V", "'=1+1,1", "'@x,2"]);
  });
  test('numbers are never altered by the formula guard: -300 stays -300', () => {
    const csv = buildCsv(ds([{ date: '2026-01-01', weight: -300 }, { date: '2026-01-02', weight: -0.5 }]))!;
    assert.deepEqual(lines(csv).slice(1, 3), ['2026-01-01,-300', '2026-01-02,-0.5']);
  });
  test('quoted text that also needs the guard keeps both: "=a,b" becomes "\'=a,b"', () => {
    const csv = buildCsv(createChartDataset({ name: 'T', period: 'p', rows: [{ name: '=a,b', v: 1 }], columns: [{ key: 'name', label: 'N' }, { key: 'v', label: 'V' }] }))!;
    assert.equal(lines(csv)[1], `"'=a,b",1`);
  });
});

describe('values: zero is not unknown, rounding is deterministic', () => {
  test('0 is a value; null, undefined, empty text, NaN and Infinity are blank', () => {
    const rows = [{ date: 'a', weight: 0 }, { date: 'b', weight: null }, { date: 'c', weight: undefined }, { date: 'd', weight: '' }, { date: 'e', weight: Number.NaN }, { date: 'f', weight: Number.POSITIVE_INFINITY }, { date: 'g', weight: false }];
    assert.deepEqual(lines(buildCsv(ds(rows))!).slice(1, 8), ['a,0', 'b,', 'c,', 'd,', 'e,', 'f,', 'g,false']);
    assert.equal(isUnknown(0), false);
    assert.equal(isUnknown(false), false);
    for (const u of [null, undefined, '', Number.NaN, Infinity]) assert.equal(isUnknown(u), true);
  });
  test('rounding: column digits (default 2), no -0, no exponent, no thousands separators', () => {
    assert.equal(roundCell(1.005 * 1000, 2), 1005);
    assert.equal(roundCell(-0.001, 2), 0);
    const csv = buildCsv(createChartDataset({ name: 'T', period: 'p', rows: [{ k: 'a', v: 1234.5678, w: 1234.5678, x: 0.0000001, y: -0.001 }], columns: [{ key: 'k', label: 'K' }, { key: 'v', label: 'V' }, { key: 'w', label: 'W', digits: 0 }, { key: 'x', label: 'X', digits: 9 }, { key: 'y', label: 'Y' }] }))!;
    assert.equal(lines(csv)[1], 'a,1234.57,1235,0.0000001,0');
  });
  test('table text groups numbers, shows zero, and leaves unknown to the table (null)', () => {
    const c = { key: 'v', label: 'V', digits: 0 };
    assert.equal(tableCellText(1250, c), '1,250');
    assert.equal(tableCellText(0, c), '0');
    assert.equal(tableCellText(91.456, { key: 'v', label: 'V' }), '91.46');
    assert.equal(tableCellText(null, c), null);
    assert.equal(tableCellText('Morning', c), 'Morning');
  });
});

describe('complete, deterministic, never truncated', () => {
  test('150 rows export as 150 rows (the old 100-row screen-reader cap does not apply)', () => {
    const rows = days(150).map((date, i) => ({ date, weight: 80 + i / 10 }));
    const csv = buildCsv(ds(rows))!;
    const l = lines(csv);
    assert.equal(l.length, 150 + 2, 'header + 150 rows + the empty piece after the final CRLF');
    assert.equal(l[1], '2026-01-01,80');
    assert.equal(l[150], `${rows[149].date},94.9`);
  });
  test('identical input gives identical output; rows stay in plot order (oldest first), whatever the table order is', () => {
    const rows = days(5).map((date, i) => ({ date, weight: 90 + i }));
    const dataset = ds(rows);
    assert.equal(buildCsv(dataset), buildCsv(dataset));
    assert.deepEqual(lines(buildCsv(dataset)!).slice(1, 6).map((x) => x.split(',')[0]), days(5));
    assert.deepEqual(orderedRows(dataset, 'newest-first').map((r) => r.id), [...days(5)].reverse());
    assert.deepEqual(orderedRows(dataset, 'oldest-first').map((r) => r.id), days(5));
  });
  test('only exactly the rows given are exported (a range change is just a different dataset)', () => {
    const all = days(40).map((date) => ({ date, weight: 91 }));
    assert.equal(lines(buildCsv(ds(all.slice(-30)))!).length, 30 + 2);
    assert.equal(lines(buildCsv(ds(all.slice(-7)))!).length, 7 + 2);
  });
});

describe('stale, unavailable and empty', () => {
  const rows = days(3).map((date) => ({ date, weight: 91 }));
  test('filename carries the exact span, the row count and "_stale" only when flagged', () => {
    assert.equal(csvFilename(ds(rows)), 'weight-trend_2026-01-01_to_2026-01-03_3-rows.csv');
    assert.equal(csvFilename(ds(rows, { status: { stale: { reason: 'Last refresh failed.' } } })), 'weight-trend_2026-01-01_to_2026-01-03_3-rows_stale.csv');
    assert.equal(csvFilename(ds(rows.slice(0, 1))), 'weight-trend_2026-01-01_1-row.csv');
  });
  test('the stale flag never changes the CSV text, and no freshness time is invented', () => {
    const fresh = buildCsv(ds(rows));
    const stale = buildCsv(ds(rows, { status: { stale: { reason: 'x' } } }));
    assert.equal(stale, fresh);
    assert.equal(describeAsOf(undefined), null);
    assert.equal(describeAsOf(null), null);
    assert.equal(describeAsOf(Date.UTC(2026, 0, 2, 3, 4)), '2026-01-02 03:04 UTC');
    assert.equal(describeAsOf('yesterday evening'), 'yesterday evening');
  });
  test('unavailable data and empty ranges export nothing', () => {
    const unavailable = ds(rows, { status: { unavailable: { reason: 'The server could not be reached.' } } });
    assert.equal(canExportCsv(unavailable), false);
    assert.equal(buildCsv(unavailable), null);
    assert.equal(unavailable.capabilities.csv, false);
    assert.equal(buildCsv(ds([])), null);
    assert.equal(ds([]).capabilities.csv, false);
    assert.equal(ds(rows).capabilities.csv, true);
  });
  test('non time-series datasets (time of day) are named by period and keep their listed order', () => {
    const d = createChartDataset({ name: 'Calories by Time of Day', period: 'Last 30 days', chronological: false, rowId: (r) => String(r.name), rows: [{ name: 'Morning', calories: 5 }, { name: 'Evening', calories: 0 }], columns: [{ key: 'name', label: 'Period' }, { key: 'calories', label: 'Calories', unit: 'cal' }] });
    assert.equal(csvFilename(d), 'calories-by-time-of-day_last-30-days_2-rows.csv');
    assert.deepEqual(orderedRows(d, 'newest-first').map((r) => r.id), ['Morning', 'Evening']);
    assert.equal(describeTableOrder(d, 'newest-first'), 'Listed in chart order');
    assert.deepEqual(lines(buildCsv(d)!).slice(1, 3), ['Morning,5', 'Evening,0']);
  });
});

describe('dataset contract', () => {
  test('row identity is stable, unique and defaults to the date / name', () => {
    assert.equal(defaultRowId({ date: '2026-01-01' }, 3), '2026-01-01');
    assert.equal(defaultRowId({ fullDate: 'x' }, 3), 'x');
    assert.equal(defaultRowId({ isoDate: 'y' }, 3), 'y');
    assert.equal(defaultRowId({ name: 'Morning' }, 3), 'Morning');
    assert.equal(defaultRowId({}, 3), '3');
    const d = ds([{ date: '10/30', weight: 1 }, { date: '10/30', weight: 2 }, { date: '10/31', weight: 3 }]);
    assert.deepEqual(d.rows.map((r, i) => d.rowId(r, i)), ['10/30', '10/30#2', '10/31']);
    assert.equal(d.capabilities.rowIdentity, true);
    assert.deepEqual(d.rows.map((r, i) => d.rowId(r, i)), ['10/30', '10/30#2', '10/31'], 'same on every call');
  });
  test('order is a plain reverse of the plot order, never a text sort ("10/9" stays before "10/10")', () => {
    const d = ds([{ date: '10/9', weight: 1 }, { date: '10/10', weight: 2 }, { date: '10/11', weight: 3 }]);
    assert.deepEqual(orderedRows(d, 'newest-first').map((r) => r.id), ['10/11', '10/10', '10/9']);
    assert.equal(describeTableOrder(d, 'newest-first'), 'Newest first');
    assert.equal(describeTableOrder(d, 'oldest-first'), 'Oldest first');
  });
  test('capabilities: table is always offered when a dataset exists; csv needs rows and available data', () => {
    assert.deepEqual(ds(days(2).map((date) => ({ date, weight: 1 }))).capabilities, { table: true, csv: true, rowIdentity: true, daySelection: false });
    assert.deepEqual(ds([]).capabilities, { table: true, csv: false, rowIdentity: true, daySelection: false });
  });
  test('the dataset does not come from the capped screen-reader table (source)', () => {
    assert.equal(/MAX_TABLE_ROWS|slice\(-100/.test(read('src/lib/chartViewerData.ts') + read('src/lib/chartCsv.ts') + read('src/components/charts/ChartDataTable.tsx')), false);
  });
});
