import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Calories / Protein / Carbs actual-vs-target: the chart style applies to the WHOLE chart.
//   Line: Actual, Min target and Max target are three lines.  Bar: all three are bars grouped per date.
// ResponsiveContainer is replaced by a fixed-size one so Recharts really draws its SVG in jsdom; reduced motion
// is on, so bars are drawn at full size at once. Run via tests/laneBMountedRunner.test.ts (own process).
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
const DAYS = 10;
/** The oldest 3 days have no targets (null); the other 7 have both. */
const data = () => days(DAYS).map((date, i) => ({ date, actual: 1500 + i * 50, min: i < 3 ? null : 1800, max: i < 3 ? null : 2200 }));

describe('mounted: macro target chart style', () => {
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
    // Reduced motion: no draw-in animation.
    env.window.matchMedia = (query: string) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
    Object.defineProperty(globalThis, 'matchMedia', { value: env.window.matchMedia, configurable: true, writable: true });
  });
  after(() => env?.window.close());
  beforeEach(() => {
    env.window.localStorage.clear();
    env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_range', '14');
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });

  const doc = () => env.window.document as Document;
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  const stored = (k: string) => env.window.localStorage.getItem(k);
  const mount = async (title = 'Protein: Actual vs Target', unit = 'g') => {
    const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, React.createElement(MacroTargetChart, { title, unit, data: data() }))));
    return host;
  };
  const pick = async (root: ParentNode, group: string, label: string) => {
    await act(async () => click(env.window, root.querySelector(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`)!));
  };
  const dialog = () => doc().querySelector('[role="dialog"]') as HTMLElement | null;

  /** What the SVG really draws: how many bar rectangles / line paths per series colour token. */
  const drawn = (root: ParentNode) => {
    const svg = root.querySelector('svg.recharts-surface')!;
    // A day with a null target keeps an empty rectangle wrapper in Recharts: only a drawn <path> is a bar.
    const bars = [...svg.querySelectorAll('.recharts-bar')].map((g) => [...g.querySelectorAll('.recharts-bar-rectangle path.recharts-rectangle')]);
    const lines = [...svg.querySelectorAll('.recharts-line')].filter((g) => g.querySelector('path.recharts-line-curve'));
    return { barSeries: bars.length, barRects: bars.map((r) => r.length), lineSeries: lines.length, lineStrokes: lines.map((g) => g.querySelector('path.recharts-line-curve')!.getAttribute('stroke')) };
  };
  const legend = (root: ParentNode) => [...root.querySelectorAll('.recharts-legend-item-text')].map((e) => e.textContent);

  test('Line mode: exactly three lines (actual, min, max) and no bars; legend keeps truthful names', async () => {
    const host = await mount();
    const d = drawn(host);
    assert.equal(d.lineSeries, 3);
    assert.equal(d.barSeries, 0);
    assert.deepEqual(d.lineStrokes, ['hsl(var(--chart-actual))', 'hsl(var(--chart-min))', 'hsl(var(--chart-max))']);
    assert.deepEqual(legend(host), ['Actual intake', 'Min target', 'Max target']);
    // Actual is the thicker, solid line; targets keep their distinct dash patterns.
    const paths = [...host.querySelectorAll('.recharts-line-curve')];
    assert.equal(paths[0].getAttribute('stroke-width'), '3.5');
    assert.equal(paths[0].getAttribute('stroke-dasharray'), null);
    assert.equal(paths[1].getAttribute('stroke-dasharray'), '8 5');
    assert.equal(paths[2].getAttribute('stroke-dasharray'), '2 5');
  });

  test('Bar mode: exactly three bar series (actual, min, max), grouped, no lines; null targets draw nothing', async () => {
    env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_style', 'bar');
    const host = await mount();
    const d = drawn(host);
    assert.equal(d.barSeries, 3);
    assert.equal(d.lineSeries, 0);
    assert.equal(host.querySelectorAll('.recharts-line-curve').length, 0);
    // 10 days of actual; the 3 days with null targets have NO min / max bar (absent, not zero-height).
    assert.deepEqual(d.barRects, [DAYS, DAYS - 3, DAYS - 3]);
    const heights = [...host.querySelectorAll('.recharts-bar path.recharts-rectangle')].map((p) => Number(p.getAttribute('height')));
    assert.ok(heights.every((h) => h > 0), 'every drawn bar has real height: no zero-height claims');
    // Grouped, not stacked: at each date the three bars have different x.
    const xs = [...host.querySelectorAll('.recharts-bar')].map((g) => g.querySelector('path.recharts-rectangle')!.getAttribute('x')!);
    assert.equal(new Set(xs).size, 3);
    assert.deepEqual(legend(host), ['Actual intake', 'Min target', 'Max target']);
    // Semantic colours (never raw hues), plus a non-colour cue: targets are lighter and outlined, max dashed.
    const bars = [...host.querySelectorAll('.recharts-bar')];
    const fill = (g: Element) => g.querySelector('.recharts-bar-rectangle path')!;
    assert.equal(fill(bars[0]).getAttribute('fill'), 'hsl(var(--chart-actual))');
    assert.equal(fill(bars[1]).getAttribute('fill'), 'hsl(var(--chart-min))');
    assert.equal(fill(bars[2]).getAttribute('fill'), 'hsl(var(--chart-max))');
    assert.equal(fill(bars[1]).getAttribute('fill-opacity'), '0.4');
    assert.equal(fill(bars[2]).getAttribute('stroke-dasharray'), '4 3');
    assert.equal(fill(bars[0]).getAttribute('stroke-dasharray'), null);
  });

  test('Y axis: Bar mode starts at 0 and reaches above the largest of all three series; Line mode keeps its padded start', async () => {
    const ticks = (root: ParentNode) => [...root.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value')].map((t) => Number(t.textContent!.replace(/,/g, '')));
    const line = await mount();
    const lt = ticks(line);
    assert.ok(Math.min(...lt) > 0, `line starts above zero: ${lt}`);
    for (const root of roots) await act(async () => root.unmount());
    roots = []; doc().body.innerHTML = '';
    env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_style', 'bar');
    const bar = await mount();
    const bt = ticks(bar);
    assert.equal(Math.min(...bt), 0);
    assert.ok(Math.max(...bt) >= 2200, `includes the max target (2200): ${bt}`);
  });

  test('a persisted Bar choice opens the full-screen viewer with all three as bars; switching to Line there changes all three, and the card follows', async () => {
    env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_style', 'bar');
    const host = await mount();
    await act(async () => click(env.window, host.querySelector('button[aria-label="Open Protein: Actual vs Target in full screen"]')!));
    await flush(20);
    const d = dialog()!;
    assert.ok(d.querySelector('figure[data-chart-expanded]'));
    assert.deepEqual([drawn(d).barSeries, drawn(d).lineSeries], [3, 0], 'viewer: three bars');
    assert.deepEqual([drawn(host).barSeries, drawn(host).lineSeries], [3, 0], 'card: three bars');

    await pick(d, 'Protein: Actual vs Target chart type', 'Line chart');
    assert.equal(stored('fittrack_chart_macro_Protein: Actual vs Target_style'), 'line');
    assert.deepEqual([drawn(d).barSeries, drawn(d).lineSeries], [0, 3], 'viewer: three lines');
    assert.deepEqual([drawn(host).barSeries, drawn(host).lineSeries], [0, 3], 'card follows: one state');

    await pick(d, 'Protein: Actual vs Target chart type', 'Bar chart');
    assert.deepEqual([drawn(d).barSeries, drawn(d).lineSeries], [3, 0]);
    assert.equal(stored('fittrack_chart_macro_Protein: Actual vs Target_style'), 'bar');
  });

  test('state stays per chart: changing Protein to bar leaves Calories on lines', async () => {
    const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, React.createElement('div', null,
      React.createElement(MacroTargetChart, { title: 'Calories: Actual vs Target', unit: 'cal', data: data() }),
      React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', data: data() })))));
    const cards = [...host.querySelectorAll('[data-chart-header]')].map((h) => h.closest('.shadow-md')!);
    await pick(cards[1], 'Protein: Actual vs Target chart type', 'Bar chart');
    assert.deepEqual([drawn(cards[0]).barSeries, drawn(cards[0]).lineSeries], [0, 3]);
    assert.deepEqual([drawn(cards[1]).barSeries, drawn(cards[1]).lineSeries], [3, 0]);
    assert.equal(stored('fittrack_chart_macro_Calories: Actual vs Target_style'), 'line');
  });

  test('range-only truthfulness: PDF data, accessible summary and table are the same in both modes and keep nulls as "--"', async () => {
    const host = await mount();
    const table = () => [...host.querySelectorAll('table tbody tr')].map((r) => [...r.children].map((c) => c.textContent));
    const lineRows = table();
    assert.equal(lineRows.length, DAYS);
    assert.deepEqual(lineRows[0].slice(2), ['--', '--'], 'no target that day is "--", not 0');
    const summaryLine = host.querySelector('[data-chart-summary] p')!.textContent;
    await pick(host, 'Protein: Actual vs Target chart type', 'Bar chart');
    assert.deepEqual(table(), lineRows);
    assert.equal(host.querySelector('[data-chart-summary] p')!.textContent, summaryLine);
    assert.match(summaryLine!, /Min target/);
    assert.ok(host.querySelector('[aria-label="Download Protein: Actual vs Target as PDF"]'));
  });

  test('tooltip shows truthful labels, units and no row for a missing target', async () => {
    env.window.localStorage.setItem('fittrack_chart_macro_Protein: Actual vs Target_style', 'bar');
    const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', data: data() }))));
    const hover = async (index: number) => {
      const wrapper = host.querySelector('.recharts-wrapper') as HTMLElement;
      wrapper.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 400, width: 900, height: 400, toJSON() {} }) as DOMRect;
      Object.defineProperty(wrapper, 'offsetWidth', { value: 900, configurable: true });
      Object.defineProperty(wrapper, 'offsetHeight', { value: 400, configurable: true });
      const plotLeft = 44, plotW = 900 - 44 - 10;
      const x = plotLeft + (plotW / DAYS) * (index + 0.5);
      await act(async () => { wrapper.dispatchEvent(new env.window.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: 200 })); });
      await flush(80);
      return host.querySelector('.recharts-tooltip-wrapper')?.textContent ?? '';
    };
    const withTargets = await hover(8);
    assert.match(withTargets, /Actual intake/);
    assert.match(withTargets, /Min target/);
    assert.match(withTargets, /Max target/);
    assert.match(withTargets, /1,800 g/);
    const noTargets = await hover(0);
    assert.match(noTargets, /Actual intake/);
    assert.match(noTargets, /1,500 g/);
    assert.equal(/Min target|Max target/.test(noTargets), false, 'a day without a target shows no target row');
  });
});
