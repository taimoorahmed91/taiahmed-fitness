import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// The viewer's Chart | Table mode and CSV download, in a real DOM:
//  - Chart is the default on every open; Table lists EVERY row of the chart's current range (150, not 100);
//  - the range / style controls are still the card's one state (Table mode does not copy or reset it);
//  - only one accessible table is exposed at a time; focus, Escape and the viewer PDF are unaffected;
//  - CSV is exactly the visible range, with units, escaping and a "stale" file name when flagged.
// Run via tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/chartViewerTable.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

const captured: Element[] = [];
mock.module('html2canvas', () => ({
  default: async (el: Element) => { captured.push(el); return { width: 100, height: 50, toDataURL: () => 'data:image/png;base64,' }; },
}));
mock.module('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFontSize() {} text() {} setTextColor() {} addImage() {} setFont() {} setDrawColor() {} line() {} addPage() {} save() {}
  },
}));
mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {}, info: () => {} } }));

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const days = (n: number) => Array.from({ length: n }, (_, i) => iso(n - 1 - i));
const rows150 = () => days(150).map((date, i) => ({ date, weight: 80 + (i % 20) / 10 }));

describe('mounted: viewer Chart | Table and CSV', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  const downloads: { filename: string; text: string }[] = [];
  const blobs = new Map<string, Blob>();

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    act = React.act;
    // Capture downloads: the Blob behind each object URL, and the anchor click that would start the file.
    let n = 0;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => { const u = `blob:test/${++n}`; blobs.set(u, b); return u; };
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    env.window.HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      const blob = blobs.get(this.href);
      downloads.push({ filename: this.download, text: '' });
      const entry = downloads[downloads.length - 1];
      // Decode keeping the byte-order mark (Blob.text() would strip it).
      void blob?.arrayBuffer().then((b) => { entry.text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(b); });
    };
  });
  after(() => env?.window.close());
  beforeEach(() => {
    downloads.length = 0;
    captured.length = 0;
    env.window.localStorage.clear();
    env.window.localStorage.setItem('fittrack_chart_weight_range', 'all');
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'line');
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });

  const doc = () => env.window.document as Document;
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountNode = async (node: any) => {
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, node)));
    return host;
  };
  const mountWeight = async (data = rows150()) => {
    const { WeightChart } = await import('../../src/components/WeightChart');
    return mountNode(React.createElement(WeightChart, { data }));
  };
  const dialog = () => doc().querySelector('[role="dialog"]') as HTMLElement | null;
  const open = async (host: ParentNode, title: string) => {
    await act(async () => click(env.window, host.querySelector(`button[aria-label="Open ${title} in full screen"]`)!));
    await flush(20);
    return dialog()!;
  };
  const radio = (root: ParentNode, group: string, label: string) => root.querySelector(`[aria-label="${group}"] [role="radio"][aria-label="${label}"], [aria-label="${group}"] [role="radio"]:not([aria-label])`) as HTMLElement;
  const pickByText = async (root: ParentNode, group: string, text: string) => {
    const el = [...root.querySelectorAll(`[aria-label="${group}"] [role="radio"]`)].find((e) => e.textContent === text) as HTMLElement;
    assert.ok(el, `${group} / ${text}`);
    await act(async () => click(env.window, el));
  };
  const pick = async (root: ParentNode, group: string, label: string) => {
    await act(async () => click(env.window, radio(root, group, label)));
  };
  const checkedText = (root: ParentNode, group: string) => root.querySelector(`[aria-label="${group}"] [role="radio"][aria-checked="true"]`)?.textContent;
  const tableRows = (root: ParentNode) => [...root.querySelectorAll('[data-chart-table] tbody tr')] as HTMLElement[];
  const exposedTables = (root: ParentNode) => [...root.querySelectorAll('table')].filter((t) => !t.closest('[aria-hidden="true"]') && !t.closest('[inert]'));
  const csvButton = (root: ParentNode) => root.querySelector('[data-chart-csv]') as HTMLButtonElement;
  const lastDownload = async () => { await flush(20); return downloads[downloads.length - 1]; };

  test('opens on Chart every time; Table lists all 150 rows, newest first, with units and stable row ids', async () => {
    const host = await mountWeight();
    let d = await open(host, 'Weight Trend');
    assert.equal(checkedText(d, 'Weight Trend view'), 'Chart');
    assert.equal(d.querySelector('[data-chart-table]'), null);
    await pickByText(d, 'Weight Trend view', 'Table');
    assert.equal(checkedText(d, 'Weight Trend view'), 'Table');
    const rows = tableRows(d);
    assert.equal(rows.length, 150, 'every row, not the 100-row screen-reader cap');
    assert.equal(rows[0].getAttribute('data-row-id'), iso(0), 'newest first');
    assert.equal(rows[149].getAttribute('data-row-id'), iso(149));
    assert.equal(new Set(rows.map((r) => r.getAttribute('data-row-id'))).size, 150, 'identity is unique');
    assert.match(d.querySelector('[data-chart-table] caption')!.textContent!, /Weight Trend · All time · 150 rows · Newest first/);
    assert.equal(d.querySelector('[data-chart-table] thead')!.textContent, 'DateWeight (kg)');
    // Sort direction is stated and deterministic.
    await act(async () => click(env.window, d.querySelector('[data-chart-sort]')!));
    assert.equal(tableRows(d)[0].getAttribute('data-row-id'), iso(149));
    assert.match(d.querySelector('[data-chart-table] caption')!.textContent!, /Oldest first/);
    // Closing and reopening always starts on Chart again.
    await act(async () => click(env.window, d.querySelector('[aria-label="Close full screen view"]')!));
    await flush(30);
    d = await open(host, 'Weight Trend');
    assert.equal(checkedText(d, 'Weight Trend view'), 'Chart');
    assert.equal(d.querySelector('[data-chart-table]'), null);
  });

  test('range and style stay the chart\'s one state: a range change updates the table, a style change leaves the mode alone', async () => {
    const host = await mountWeight();
    const d = await open(host, 'Weight Trend');
    await pickByText(d, 'Weight Trend view', 'Table');
    await pick(d, 'Weight Trend range', 'Last 30 days');
    assert.equal(env.window.localStorage.getItem('fittrack_chart_weight_range'), '30');
    assert.equal(tableRows(d).length, 30, 'the table follows the range');
    assert.match(d.querySelector('[data-chart-table] caption')!.textContent!, /Last 30 days · 30 rows/);
    await pick(d, 'Weight Trend chart type', 'Bar chart');
    assert.equal(env.window.localStorage.getItem('fittrack_chart_weight_style'), 'bar', 'style is its own shared state');
    assert.equal(checkedText(d, 'Weight Trend view'), 'Table', 'switching Line/Bar does not change Chart/Table');
    assert.equal(tableRows(d).length, 30, 'and does not change the rows');
    assert.equal(checkedText(host, 'Weight Trend range'), '30D', 'the card behind has the same range');
    assert.equal(host.querySelector('[aria-label="Weight Trend chart type"] [aria-checked="true"]')!.getAttribute('aria-label'), 'Bar chart');
  });

  test('only one accessible table is exposed: the visible one in Table mode, the chart\'s own in Chart mode', async () => {
    const host = await mountWeight();
    const d = await open(host, 'Weight Trend');
    assert.equal(exposedTables(d).length, 1, 'Chart mode: the chart\'s screen-reader table');
    assert.equal(d.querySelectorAll('[data-chart-table]').length, 0);
    await pickByText(d, 'Weight Trend view', 'Table');
    const exposed = exposedTables(d);
    assert.equal(exposed.length, 1, 'Table mode: just the visible table');
    assert.ok(exposed[0].closest('[data-chart-table]'));
    const hidden = d.querySelector('[data-chart-viewer-capture]')!;
    assert.equal(hidden.getAttribute('aria-hidden'), 'true');
    assert.ok(hidden.hasAttribute('inert'), 'the off-screen chart cannot take focus');
    assert.equal(d.querySelector('[data-chart-table]')!.getAttribute('role'), 'region');
    assert.equal(d.querySelector('[data-chart-table]')!.getAttribute('tabindex'), '0', 'scrollable by keyboard');
    await pickByText(d, 'Weight Trend view', 'Chart');
    assert.equal(exposedTables(d).length, 1);
    assert.equal(hidden.hasAttribute('inert'), false);
    assert.equal(hidden.getAttribute('aria-hidden'), null);
  });

  test('CSV downloads exactly the visible range (150 rows, then 30 after a range change), with units and a name that matches', async () => {
    const host = await mountWeight();
    const d = await open(host, 'Weight Trend');
    assert.match(csvButton(d).getAttribute('aria-label')!, /Download Weight Trend as CSV, 150 rows/);
    await act(async () => click(env.window, csvButton(d)));
    const all = await lastDownload();
    const l = all.text.slice(1).split('\r\n');
    assert.equal(all.text.charCodeAt(0), 0xfeff);
    assert.equal(l[0], 'Date,Weight (kg)');
    assert.equal(l.length, 150 + 2, 'all rows plus header (+ final CRLF), never truncated at 100');
    assert.equal(l[1].split(',')[0], iso(149), 'oldest first');
    assert.equal(all.filename, `weight-trend_${iso(149)}_to_${iso(0)}_150-rows.csv`);
    assert.match(d.querySelector('[data-chart-viewer-toolbar] [role="status"]')!.textContent!, /Downloaded 150 rows/);

    await pick(d, 'Weight Trend range', 'Last 30 days');
    await act(async () => click(env.window, csvButton(d)));
    const month = await lastDownload();
    assert.equal(month.text.slice(1).split('\r\n').length, 30 + 2);
    assert.equal(month.filename, `weight-trend_${iso(29)}_to_${iso(0)}_30-rows.csv`);
  });

  test('unknown shows a dash (read as "No value"), a real 0 shows 0; CSV leaves unknown empty and keeps 0', async () => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    env.window.localStorage.setItem('fittrack_chart_sleep_range', '7');
    const data = days(4).map((date, i) => ({ date, hours: i === 1 ? 0 : 7, whoopHours: i === 2 ? null : 6.5 }));
    const host = await mountNode(React.createElement(TrendChart, { id: 'sleep', title: 'Sleep', icon: null, unit: 'hrs', empty: 'none', data, series: [{ key: 'hours', label: 'Manual Sleep', color: '#000' }, { key: 'whoopHours', label: 'WHOOP In Bed', color: '#111' }] }));
    const d = await open(host, 'Sleep');
    await pickByText(d, 'Sleep view', 'Table');
    // data index 2 (third oldest) is the second newest row: unknown WHOOP value.
    const unknownRow = tableRows(d)[1];
    assert.equal(unknownRow.children[2].querySelector('[aria-hidden="true"]')?.textContent, '\u2014');
    assert.equal(unknownRow.children[2].querySelector('.sr-only')?.textContent, 'No value');
    const zeroRow = tableRows(d)[2];
    assert.equal(zeroRow.children[1].textContent, '0', 'a real zero is shown as 0, not as a dash');
    await act(async () => click(env.window, csvButton(d)));
    const rows = (await lastDownload()).text.slice(1).split('\r\n');
    assert.equal(rows[0], 'Date,Manual Sleep (hrs),WHOOP In Bed (hrs)');
    assert.equal(rows[2], `${days(4)[1]},0,6.5`, 'zero stays 0');
    assert.equal(rows[3], `${days(4)[2]},7,`, 'unknown is an empty field');
  });

  test('range-only chart (Calories by Time of Day) keeps Chart/Table/CSV without gaining a line/bar switch; order is the chart order', async () => {
    const { MealTimeChart } = await import('../../src/components/MealTimeChart');
    const slice = [{ name: 'Overnight', calories: 0, count: 0 }, { name: 'Morning', calories: 500, count: 2 }, { name: 'Evening', calories: 900, count: 3 }];
    const host = await mountNode(React.createElement(MealTimeChart, { data7: slice, data14: slice, data30: slice, data90: slice }));
    const d = await open(host, 'Calories by Time of Day');
    assert.equal(d.querySelector('[aria-label$="chart type"]'), null);
    await pickByText(d, 'Calories by Time of Day view', 'Table');
    assert.deepEqual(tableRows(d).map((r) => r.getAttribute('data-row-id')), ['Overnight', 'Morning', 'Evening']);
    assert.equal(d.querySelector('[data-chart-sort]'), null, 'no sort for a non time series');
    assert.match(d.querySelector('[data-chart-table] caption')!.textContent!, /Listed in chart order/);
    assert.equal(tableRows(d)[0].children[1].textContent, '0', 'zero calories is 0');
    await act(async () => click(env.window, csvButton(d)));
    const csv = (await lastDownload()).text.slice(1).split('\r\n');
    assert.equal(csv[0], 'Period,Calories (cal),Meals,Share (%)');
    assert.deepEqual(csv.slice(1, 4), ['Overnight,0,0,0', 'Morning,500,2,36', 'Evening,900,3,64']);
  });

  test('fixed-window charts (Weekly, Delta, Report) also offer Chart | Table | CSV', async () => {
    const { WeeklyBarChart } = await import('../../src/components/charts/WeeklyBarChart');
    const { DeltaChart } = await import('../../src/components/charts/DeltaChart');
    const { ReportCharts } = await import('../../src/components/ReportCharts');
    const week = Array.from({ length: 7 }, (_, i) => ({ date: `D${i}`, fullDate: iso(6 - i), calories: 1000 + i }));
    const host = await mountNode(React.createElement('div', null,
      React.createElement(WeeklyBarChart, { title: 'Weekly Calories', icon: null, data: week, valueKey: 'calories', label: 'Calories', unit: 'cal', color: '#000' }),
      React.createElement(DeltaChart, { title: 'Weight Change', icon: null, unit: 'kg', entries: [{ date: iso(10), value: 81 }, { date: iso(3), value: 80 }], emptyText: 'x' }),
      React.createElement(ReportCharts, { data: days(5).map((date) => ({ date, calories: 2000, workout: 30, sleep: 7 })) })));
    for (const [title, count] of [['Weekly Calories', 7], ['Weight Change', 1], ['Calories & Workout Trend', 5], ['Sleep Trend', 5]] as const) {
      const d = await open(host, title);
      assert.equal(d.querySelector('[aria-label$="chart type"]'), null, `${title}: no style switch`);
      await pickByText(d, `${title} view`, 'Table');
      assert.equal(tableRows(d).length, count, title);
      assert.equal(csvButton(d).disabled, false, title);
      await act(async () => click(env.window, d.querySelector('[aria-label="Close full screen view"]')!));
      await flush(30);
    }
  });

  test('stale data is disclosed in the viewer and in the CSV file name; unavailable data has no export', async () => {
    const { ChartHeader } = await import('../../src/components/charts/ChartHeader');
    const { Card } = await import('../../src/components/ui/card');
    const { createChartDataset } = await import('../../src/lib/chartViewerData');
    const rows = days(3).map((date) => ({ date, weight: 91 }));
    const make = (status: Parameters<typeof createChartDataset>[0]['status']) => createChartDataset({ name: 'Weight Trend', period: 'Last 7 days', rows, columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight', unit: 'kg' }], status });
    const mountHeader = (dataset: ReturnType<typeof make>) => mountNode(React.createElement(Card, { titleSize: 'chart' }, React.createElement(ChartHeader, { title: 'Weight Trend', viewer: { render: () => React.createElement('p', null, 'chart'), dataset } })));

    let host = await mountHeader(make({ stale: { reason: 'The last refresh failed.' } }));
    let d = await open(host, 'Weight Trend');
    const notice = d.querySelector('[data-chart-data-notice]')!.textContent!;
    assert.match(notice, /may be out of date: The last refresh failed\./);
    assert.equal(/Last loaded/.test(notice), false, 'no invented freshness time');
    await act(async () => click(env.window, csvButton(d)));
    assert.match((await lastDownload()).filename, /_3-rows_stale\.csv$/);
    await act(async () => click(env.window, d.querySelector('[aria-label="Close full screen view"]')!));
    await flush(30);
    for (const r of roots) await act(async () => r.unmount());
    roots = []; doc().body.innerHTML = '';

    host = await mountHeader(make({ stale: { reason: 'Offline.', asOf: Date.UTC(2026, 0, 2, 3, 4) } }));
    d = await open(host, 'Weight Trend');
    assert.match(d.querySelector('[data-chart-data-notice]')!.textContent!, /Last loaded 2026-01-02 03:04 UTC/);
    for (const r of roots) await act(async () => r.unmount());
    roots = []; doc().body.innerHTML = '';

    const before = downloads.length;
    host = await mountHeader(make({ unavailable: { reason: 'The server could not be reached.' } }));
    d = await open(host, 'Weight Trend');
    assert.equal(csvButton(d).disabled, true);
    assert.match(csvButton(d).getAttribute('aria-label')!, /unavailable/);
    assert.match(d.querySelector('[data-chart-data-notice]')!.textContent!, /Data unavailable: The server could not be reached\. Nothing to export\./);
    await act(async () => click(env.window, csvButton(d)));
    assert.equal(downloads.length, before, 'no file');
    await pickByText(d, 'Weight Trend view', 'Table');
    assert.match(d.querySelector('[data-chart-table-empty]')!.textContent!, /unavailable: The server could not be reached/);
  });

  test('PDF, focus return and Escape are unaffected: viewer PDF captures the viewer chart even from Table mode; card PDF the card', async () => {
    const host = await mountWeight();
    const trigger = host.querySelector('button[aria-label="Open Weight Trend in full screen"]') as HTMLElement;
    trigger.focus();
    // The card's PDF lives in its "More chart actions" menu (opened here from the keyboard).
    const menuButton = host.querySelector('[aria-label="More chart actions for Weight Trend"]') as HTMLElement;
    menuButton.focus();
    await act(async () => { menuButton.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await flush(10);
    const pdfItem = [...doc().querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.trim() === 'Download PDF')!;
    await act(async () => click(env.window, pdfItem));
    await flush(60);
    assert.equal(captured.length, 1);
    assert.ok(captured[0].querySelector('[data-chart-header]'), 'card PDF captures the card');

    await act(async () => click(env.window, trigger));
    await flush(20);
    const d = dialog()!;
    await act(async () => click(env.window, d.querySelector('[data-chart-viewer-header] [aria-label="Download Weight Trend as PDF"]')!));
    await flush(60);
    assert.equal(captured.length, 2);
    assert.ok(captured[1].closest('[data-chart-viewer]') && captured[1].querySelector('figure[data-chart-expanded]'), 'Chart mode: the viewer chart');

    await pickByText(d, 'Weight Trend view', 'Table');
    await act(async () => click(env.window, d.querySelector('[data-chart-viewer-header] [aria-label="Download Weight Trend as PDF"]')!));
    await flush(60);
    assert.equal(captured.length, 3);
    assert.ok(captured[2].closest('[data-chart-viewer]') && captured[2].querySelector('figure[data-chart-expanded]'), 'Table mode: still the viewer chart, never the table');
    assert.equal(captured[2].querySelector('[data-chart-table]'), null);
    assert.equal(captured[2].querySelector('[data-chart-viewer-toolbar]'), null, 'toolbar is never captured');

    await act(async () => { doc().dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush(30);
    assert.equal(dialog(), null);
    assert.equal(doc().activeElement, trigger, 'focus returns to the pop-out button');
  });

  test('touch: rows and controls keep 44px on coarse pointers (source)', () => {
    const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
    assert.match(read('src/components/charts/ChartDataTable.tsx'), /h-9 border-b last:border-b-0 \[@media\(pointer:coarse\)\]:h-11/);
    assert.match(read('src/components/ui/button.tsx'), /sm: "h-9 rounded-md px-3 \[@media\(pointer:coarse\)\]:min-h-11"/);
    assert.match(read('src/components/ui/segmented-control.tsx'), /\[@media\(pointer:coarse\)\]:h-11/);
  });
});
