import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Real charts with a source status: the full-screen viewer says "may be out of date" / "unavailable" honestly, the CSV
// name carries `_stale`, unavailable data can not be exported or selected, and the warning clears when the status clears
// (a successful refresh). Also CSV / PDF / Table keep null (blank, "--") apart from a real 0 for macro intake.
// Run via tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/chartSourceStatus.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

// ResponsiveContainer is replaced by a fixed-size one so Recharts really draws its SVG (hit areas) in jsdom.
const actualRecharts = await import('recharts');
mock.module('recharts', () => ({
  ...actualRecharts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResponsiveContainer: ({ children }: { children: any }) => (globalThis as any).__React.cloneElement(children, { width: 900, height: 400 }),
}));

const pdfTexts: string[] = [];
mock.module('html2canvas', () => ({ default: async () => ({ width: 100, height: 50, toDataURL: () => 'data:image/png;base64,' }) }));
mock.module('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFontSize() {} setTextColor() {} addImage() {} setFont() {} setDrawColor() {} line() {} addPage() {} save() {}
    text(t: unknown) { pdfTexts.push(String(t)); }
  },
}));
mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {}, info: () => {} } }));

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const days = (n: number) => Array.from({ length: n }, (_, i) => iso(n - 1 - i));

describe('mounted: chart source status', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any, rendered: ((node: any) => Promise<void>) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  const downloads: { filename: string; text: string }[] = [];
  const blobs = new Map<string, Blob>();

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    (globalThis as Record<string, unknown>).__React = React;
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    act = React.act;
    let n = 0;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => { const u = `blob:test/${++n}`; blobs.set(u, b); return u; };
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    env.window.HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      const blob = blobs.get(this.href);
      const entry = { filename: this.download, text: '' };
      downloads.push(entry);
      void blob?.arrayBuffer().then((b) => { entry.text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(b); });
    };
    env.window.matchMedia = (query: string) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
    Object.defineProperty(globalThis, 'matchMedia', { value: env.window.matchMedia, configurable: true, writable: true });
  });
  after(() => env?.window.close());
  beforeEach(() => {
    downloads.length = 0;
    pdfTexts.length = 0;
    env.window.localStorage.clear();
    env.window.localStorage.setItem('fittrack_chart_weight_range', '30');
    env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_range', '14');
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    rendered = null;
    env.window.document.body.innerHTML = '';
  });

  const doc = () => env.window.document as Document;
  const q = (sel: string, scope: ParentNode = doc()) => scope.querySelector<HTMLElement>(sel);
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const clickEl = async (el: Element | null | undefined) => { assert.ok(el, 'element to click'); await act(async () => click(env.window, el!)); };
  // Mounts once and keeps the root, so the same chart can be handed a NEW status (a refresh finishing) while the viewer is open.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountLive = async (make: (status: any) => any, status: any) => {
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draw = (s: any) => act(async () => root.render(React.createElement(Router.MemoryRouter, null, make(s))));
    await draw(status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rendered = draw as any;
    return host;
  };
  const viewer = () => q('[data-chart-viewer]')!;
  const csv = () => q('[data-chart-csv]', viewer()) as HTMLButtonElement;
  const notice = () => q('[data-chart-data-notice]', viewer());
  const lastDownload = async () => { await flush(20); return downloads[downloads.length - 1]; };
  const openViewer = async (title: string) => { await clickEl(q(`button[aria-label="Open ${title} in full screen"]`)); await flush(20); return viewer(); };
  const viewTab = async (label: 'Chart' | 'Table') => clickEl([...viewer().querySelectorAll('[role="radio"]')].find((r) => (r.getAttribute('aria-label') ?? r.textContent) === label || r.textContent === label) as HTMLElement);

  const weightRows = () => days(40).map((date, i) => ({ date, weight: 80 + (i % 5) / 10 }));
  const weightChart = async () => {
    const { WeightChart } = await import('../../src/components/WeightChart');
    return (status: unknown) => React.createElement(WeightChart, { data: weightRows(), status });
  };
  const STALE = { stale: { reason: 'The latest refresh of your weight failed, so this shows the last data that loaded.' } };
  const UNAVAILABLE = { unavailable: { reason: "Your weight didn't load." } };

  test('stale: the viewer says so (no invented time), the rows stay, CSV is marked _stale; a successful refresh clears all of it', async () => {
    const make = await weightChart();
    await mountLive(make, STALE);
    const v = await openViewer('Weight Trend');
    assert.match(text(notice()), /^This data may be out of date: The latest refresh of your weight failed, so this shows the last data that loaded\./);
    assert.ok(!/Last loaded/.test(text(notice())), 'no timestamp is invented');
    assert.equal(csv().disabled, false, 'cached rows can still be exported');
    await clickEl(csv());
    assert.match((await lastDownload()).filename, /_30-rows_stale\.csv$/);
    assert.equal(v.querySelectorAll('[data-chart-selection-bar]').length, 1, 'cached rows can still be selected');
    assert.ok(q('g[data-chart-point]') !== null, 'and have hit areas');
    // The refresh worked: the page derives no status any more.
    await rendered!(undefined);
    await flush(10);
    assert.ok(notice() === null, 'warning gone');
    await clickEl(csv());
    const name = (await lastDownload()).filename;
    assert.match(name, /_30-rows\.csv$/);
    assert.ok(!/stale/.test(name), 'CSV name no longer says stale');
    // And it can come back if a later refresh fails again.
    await rendered!(STALE);
    await flush(10);
    assert.ok(notice() !== null);
  });

  test('unavailable: the viewer says why, CSV is disabled and gives no file, the Table explains, nothing is selectable; recovery brings it all back', async () => {
    const make = await weightChart();
    await mountLive(make, UNAVAILABLE);
    const v = await openViewer('Weight Trend');
    assert.match(text(notice()), /^Data unavailable: Your weight didn't load\. Nothing to export\./);
    assert.equal(csv().disabled, true);
    assert.match(csv().getAttribute('aria-label')!, /unavailable/);
    const before = downloads.length;
    await clickEl(csv());
    assert.equal(downloads.length, before, 'no file');
    assert.ok(q('[data-chart-selection-bar]', v) === null, 'no stepper for unavailable data');
    assert.ok(q('.recharts-surface') !== null && q('g[data-chart-point]') === null, 'the chart is drawn but has no hit areas');
    await viewTab('Table');
    assert.match(text(q('[data-chart-table-empty]', v)), /unavailable: Your weight didn't load\./);
    await rendered!(undefined);
    await flush(10);
    assert.ok(notice() === null);
    assert.equal(csv().disabled, false);
    assert.ok(q('[data-chart-table]', viewer()) !== null, 'the Table is back');
    assert.equal(viewer().querySelectorAll('[data-chart-selection-bar]').length, 1);
  });

  test('no status: the viewer has no notice at all', async () => {
    const make = await weightChart();
    await mountLive(make, undefined);
    await openViewer('Weight Trend');
    assert.ok(notice() === null);
  });

  test('the same status reaches Macro, Meal time and Recomposition viewers too', async () => {
    const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
    await mountLive((s) => React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', metric: 'protein', status: s, data: days(10).map((date) => ({ date, actual: 100, intake: 'recorded', min: 90, max: 130 })) }), STALE);
    await openViewer('Protein: Actual vs Target');
    assert.match(text(notice()), /may be out of date/);
    await clickEl(csv());
    assert.match((await lastDownload()).filename, /_stale\.csv$/);
    for (const r of roots) await act(async () => r.unmount());
    roots = []; doc().body.innerHTML = '';

    const { MealTimeChart } = await import('../../src/components/MealTimeChart');
    const slice = [{ name: 'Morning', calories: 500, count: 2 }];
    await mountLive((s) => React.createElement(MealTimeChart, { data7: slice, data14: slice, data30: slice, data90: slice, status: s }), UNAVAILABLE);
    await openViewer('Calories by Time of Day');
    assert.match(text(notice()), /Data unavailable/);
    assert.equal(csv().disabled, true);
    for (const r of roots) await act(async () => r.unmount());
    roots = []; doc().body.innerHTML = '';

    const { BodyRecompositionCard } = await import('../../src/components/BodyRecompositionCard');
    env.window.localStorage.setItem('fittrack_chart_body_recomp_range', '30');
    const entries = days(10).map((date, i) => ({ date, value: 80 - i / 10 }));
    await mountLive((s) => React.createElement(BodyRecompositionCard, { weight: entries, waist: entries, status: s }), STALE);
    await openViewer('Body Recomposition Index');
    assert.match(text(notice()), /may be out of date/);
  });

  describe('macro intake: null stays blank, a real 0 stays 0 (Table, CSV, PDF)', () => {
    const FIXTURE = [{ actual: null, intake: 'no-meals' }, { actual: 0, intake: 'recorded' }, { actual: 120, intake: 'recorded' }, { actual: null, intake: 'partial' }, { actual: 110, intake: 'recorded' }];
    const mountMacro = async () => {
      const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
      const rows = days(FIXTURE.length).map((date, i) => ({ date, ...FIXTURE[i], min: 90, max: 150 }));
      await mountLive((s) => React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', metric: 'protein', status: s, data: rows }), undefined);
      return rows;
    };

    test('CSV: unobserved days are empty fields; the explicit zero is 0', async () => {
      const rows = await mountMacro();
      await openViewer('Protein: Actual vs Target');
      await clickEl(csv());
      const body = (await lastDownload()).text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
      assert.equal(body.length, FIXTURE.length + 1, 'every day is a row');
      const line = (i: number) => body[1 + i].split(',');
      assert.deepEqual(line(0), [rows[0].date, '', '90', '150'], 'no meals: blank, never 0');
      assert.deepEqual(line(1), [rows[1].date, '0', '90', '150'], 'explicit zero: 0');
      assert.deepEqual(line(2), [rows[2].date, '120', '90', '150']);
      assert.deepEqual(line(3), [rows[3].date, '', '90', '150'], 'partial day: blank');
    });

    test('PDF: unobserved days print "--", the explicit zero prints 0', async () => {
      const rows = await mountMacro();
      await clickEl(q('[aria-label="Download Protein: Actual vs Target as PDF"]'));
      await flush(80);
      const at = (i: number) => pdfTexts.indexOf(rows[i].date);
      assert.ok(at(0) >= 0, 'rows were written');
      // The cell after the date is the Actual column.
      assert.equal(pdfTexts[at(0) + 1], '--');
      assert.equal(pdfTexts[at(1) + 1], '0');
      assert.equal(pdfTexts[at(2) + 1], '120');
      assert.equal(pdfTexts[at(3) + 1], '--');
    });

    test('chart summary does not count unobserved days as values or zeros', async () => {
      await mountMacro();
      const summary = text(q('[data-chart-summary] p'));
      assert.match(summary, /Actual intake: 3 values/);
      assert.match(summary, /lowest 0 g/, 'the recorded zero is a real lowest');
    });
  });
});
