import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// The Y axis of the switchable charts (src/lib/chartAxis.ts). Weight and waist use ONE zoomed axis for Line and Bar (a 91 -> 92 kg
// change must be visible in Bar mode, with an "Axis starts at" note); quantities (calories, minutes, sleep hours) start at 0 in Bar mode.
// The full-screen viewer uses the identical axis and note as the card.
// ResponsiveContainer is replaced by a fixed-size one so Recharts draws real SVG in jsdom; reduced motion is on.
// Run via tests/laneBMountedRunner.test.ts (own process).
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

const actualRecharts = await import('recharts');
mock.module('recharts', () => ({
  ...actualRecharts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResponsiveContainer: ({ children }: { children: any }) => (globalThis as any).__React.cloneElement(children, { width: 900, height: 400 }),
}));

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const days = (n: number) => Array.from({ length: n }, (_, i) => iso(n - 1 - i));
/** Weight: five days at 91, five at 92. */
const weight = () => days(10).map((date, i) => ({ date, weight: i < 5 ? 91 : 92 }));
const flat = () => days(10).map((date) => ({ date, weight: 91 }));

describe('mounted: shared Y-axis domain for line and bar', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    (globalThis as Record<string, unknown>).__React = React;
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    act = React.act;
    env.window.matchMedia = (query: string) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
    Object.defineProperty(globalThis, 'matchMedia', { value: env.window.matchMedia, configurable: true, writable: true });
  });
  after(() => env?.window.close());
  beforeEach(() => {
    env.window.localStorage.clear();
    env.window.localStorage.setItem('fittrack_chart_weight_range', '14');
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });

  const doc = () => env.window.document as Document;
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  const stored = (k: string) => env.window.localStorage.getItem(k);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountNode = async (node: any) => {
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, node)));
    return host;
  };
  const mountWeight = async (data = weight()) => {
    const { WeightChart } = await import('../../src/components/WeightChart');
    return mountNode(React.createElement(WeightChart, { data }));
  };
  const pick = async (root: ParentNode, group: string, label: string) => {
    await act(async () => click(env.window, root.querySelector(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`)!));
  };
  const ticks = (root: ParentNode) => [...root.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value')].map((t) => t.textContent!);
  const caption = (root: ParentNode) => root.querySelector('figure > p')?.textContent ?? '';
  const summary = (root: ParentNode) => root.querySelector('[data-chart-summary] p')?.textContent ?? '';
  const barHeights = (root: ParentNode) => [...root.querySelectorAll('.recharts-bar path.recharts-rectangle')].map((p) => Number(p.getAttribute('height')));
  const dialog = () => doc().querySelector('[role="dialog"]') as HTMLElement | null;
  const openViewer = async (host: ParentNode, title: string) => {
    await act(async () => click(env.window, host.querySelector(`button[aria-label="Open ${title} in full screen"]`)!));
    await flush(20);
    return dialog()!;
  };

  test('Weight 91 -> 92 in Bar mode: zoomed axis with a labelled non-zero floor, and the 92 bar is clearly taller than the 91 bar', async () => {
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'bar');
    const host = await mountWeight();
    assert.deepEqual(ticks(host), ['90.5', '91', '91.5', '92', '92.5']);
    assert.match(caption(host), /Axis starts at 90\.5 kg/);
    assert.match(summary(host), /Axis starts at 90\.5 kg, not zero\./);
    const h = barHeights(host);
    assert.equal(h.length, 10);
    assert.ok(h[9] / h[0] > 2.5, `the 92 kg bar is ~3x the 91 kg bar (was ~1.01x from zero): ${h[0]} vs ${h[9]}`);
  });

  test('Line and Bar draw on exactly the same axis for the same data', async () => {
    const line = await mountWeight();
    const lineTicks = ticks(line);
    assert.equal(/Axis starts at/.test(caption(line)), false, 'Line mode needs no floor note');
    assert.equal(/not zero/.test(summary(line)), false);
    await pick(line, 'Weight Trend chart type', 'Bar chart');
    assert.deepEqual(ticks(line), lineTicks);
    assert.equal(stored('fittrack_chart_weight_style'), 'bar');
    assert.match(caption(line), /Axis starts at/);
  });

  test('constant weight (91 every day): a real range around it and visible bars', async () => {
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'bar');
    const host = await mountWeight(flat());
    assert.deepEqual(ticks(host), ['89', '90', '91', '92', '93']);
    assert.match(caption(host), /Axis starts at 89 kg/);
    assert.ok(barHeights(host).every((h) => h > 50), `bars have real height: ${barHeights(host)}`);
  });

  test('full-screen viewer: identical axis and note in Bar, switching to Line there changes the card too and keeps the axis', async () => {
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'bar');
    const host = await mountWeight();
    const cardTicks = ticks(host);
    const d = await openViewer(host, 'Weight Trend');
    assert.ok(d.querySelector('figure[data-chart-expanded]'));
    assert.deepEqual(ticks(d), cardTicks, 'viewer axis = card axis');
    assert.match(caption(d), /Axis starts at 90\.5 kg/);
    assert.match(summary(d), /not zero/);
    await pick(d, 'Weight Trend chart type', 'Line chart');
    assert.deepEqual(ticks(d), cardTicks, 'Line in the viewer: same axis');
    assert.deepEqual(ticks(host), cardTicks);
    assert.equal(/Axis starts at/.test(caption(d)), false);
    assert.equal(/Axis starts at/.test(caption(host)), false);
    assert.equal(stored('fittrack_chart_weight_style'), 'line');
  });

  test('tooltip values, PDF/table rows stay the real numbers (never deltas from the floor)', async () => {
    env.window.localStorage.setItem('fittrack_chart_weight_style', 'bar');
    const host = await mountWeight();
    const rows = [...host.querySelectorAll('table tbody tr')].map((r) => [...r.children].map((c) => c.textContent)[1]);
    assert.deepEqual(rows, ['91', '91', '91', '91', '91', '92', '92', '92', '92', '92']);
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/components/TrendChart.tsx', import.meta.url), 'utf8');
    assert.match(src, /pdf=\{\{ targetRef: cardRef, subtitle: `\$\{period\} · \$\{view\.style\} chart`, columns: pdfColumns, rows: shown \}\}/);
    assert.match(src, /value: formatChartValue\(Number\(p\.value\), unit\)/);
  });

  test('other TrendCharts: Duration and Sleep bars start at 0 (no note), Recovery stays within 0..100 with headroom, and the range switch recomputes', async () => {
    const { WorkoutDurationChart } = await import('../../src/components/WorkoutDurationChart');
    const { SleepChart } = await import('../../src/components/SleepChart');
    const { RecoveryChart } = await import('../../src/components/RecoveryChart');
    for (const id of ['workout_duration', 'sleep', 'recovery']) { env.window.localStorage.setItem(`fittrack_chart_${id}_style`, 'bar'); env.window.localStorage.setItem(`fittrack_chart_${id}_range`, '14'); }
    const host = await mountNode(React.createElement('div', null,
      React.createElement(WorkoutDurationChart, { data: days(10).map((date, i) => ({ date, duration: i === 0 ? 200 : 20 + i * 5 })) }),
      React.createElement(SleepChart, { data: days(10).map((date, i) => ({ date, hours: 5 + (i % 5) })) }),
      React.createElement(RecoveryChart, { data: days(10).map((date, i) => ({ date, recovery: 40 + i * 6 })) })));
    const cards = [...host.querySelectorAll('[data-chart-header]')].map((h) => h.closest('.shadow-md')!);
    const num = (t: string) => Number(t.replace(/,/g, ''));
    const [dur, sleep, rec] = cards.map((c) => ({ t: ticks(c).map(num), cap: caption(c) }));
    assert.equal(dur.t[0], 0); assert.ok(dur.t.at(-1)! >= 200 * 1.12);
    assert.equal(sleep.t[0], 0); assert.ok(sleep.t.at(-1)! >= 9 * 1.12); assert.equal(/Axis starts at/.test(sleep.cap), false);
    assert.equal(rec.t[0], 0); assert.equal(rec.t.at(-1), 100);
    // Switching the Duration range to 7 days drops the 200 min day (the oldest): the axis is recomputed from what is on screen.
    await pick(cards[0], 'Workout Duration range', 'Last 7 days');
    const after = ticks(cards[0]).map(num);
    assert.ok(after[0] === 0 && after.at(-1)! >= 65 * 1.12 && after.at(-1)! < dur.t.at(-1)!, `recomputed: ${dur.t} -> ${after}`);
  });

  test('state stays per chart: the Waist chart keeps its own style while Weight changes', async () => {
    const { WeightChart } = await import('../../src/components/WeightChart');
    const { WaistChart } = await import('../../src/components/WaistChart');
    const host = await mountNode(React.createElement('div', null,
      React.createElement(WeightChart, { data: weight() }),
      React.createElement(WaistChart, { data: days(10).map((date, i) => ({ date, waist: 90 + (i > 4 ? 1 : 0) })) })));
    const cards = [...host.querySelectorAll('[data-chart-header]')].map((h) => h.closest('.shadow-md')!);
    await pick(cards[0], 'Weight Trend chart type', 'Bar chart');
    assert.equal(stored('fittrack_chart_weight_style'), 'bar');
    assert.notEqual(stored('fittrack_chart_waist_style'), 'bar');
    assert.equal(/Axis starts at/.test(caption(cards[1])), false);
  });
});
