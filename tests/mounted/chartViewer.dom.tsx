import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Mounted (real DOM) behaviour of the full-screen chart viewer:
//  - it opens with the card's own range and line/bar choice, and changing them inside the viewer changes that
//    chart's saved state (and only that chart's);
//  - range-only charts stay range-only; the viewer chart is the expanded (tall) variant;
//  - Escape and the close button close it and focus goes back to the pop-out button;
//  - card and viewer never share an element id; PDF from the viewer captures the viewer, from the card the card.
// Run through tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/chartViewer.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

// PDF export is stubbed so the test can see WHICH element each PDF button captures.
const captured: Element[] = [];
const saved: string[] = [];
mock.module('html2canvas', () => ({
  default: async (el: Element) => { captured.push(el); return { width: 100, height: 50, toDataURL: () => 'data:image/png;base64,' }; },
}));
mock.module('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFontSize() {} text() {} setTextColor() {} addImage() {} setFont() {} setDrawColor() {} line() {} addPage() {}
    save(name: string) { saved.push(name); }
  },
}));
mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {}, info: () => {} } }));

const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const days = (n: number) => Array.from({ length: n }, (_, i) => iso(n - 1 - i));

describe('mounted: full-screen chart viewer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    act = React.act;
  });
  beforeEach(() => {
    env.window.localStorage.clear();
    captured.length = 0;
    saved.length = 0;
    const set = (k: string, v: string) => env.window.localStorage.setItem(k, v);
    set('fittrack_chart_weight_range', '30');
    set('fittrack_chart_weight_style', 'bar');
    set('fittrack_chart_sleep_range', '7');
    set('fittrack_chart_sleep_style', 'bar');
    set('fittrack_chart_meal_time_range', '14');
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });
  after(() => env?.window.close());

  const doc = () => env.window.document as Document;
  const stored = (k: string) => env.window.localStorage.getItem(k);
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any) => {
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, node)));
    return host;
  };
  const dialog = () => doc().querySelector('[role="dialog"]') as HTMLElement | null;
  const expandButton = (title: string) => doc().querySelector(`button[aria-label="Open ${title} in full screen"]`) as HTMLButtonElement;
  const open = async (title: string) => { await act(async () => click(env.window, expandButton(title))); await flush(10); return dialog()!; };
  const checked = (root: ParentNode, group: string) => root.querySelector(`[aria-label="${group}"] [role="radio"][aria-checked="true"]`)?.getAttribute('aria-label') ?? null;
  const pick = async (root: ParentNode, group: string, label: string) => {
    const radio = root.querySelector(`[aria-label="${group}"] [role="radio"][aria-label="${label}"]`) as HTMLElement;
    assert.ok(radio, `${group} / ${label}`);
    await act(async () => click(env.window, radio));
  };
  const tableRows = (root: ParentNode) => root.querySelectorAll('table tbody tr').length;

  const weightData = () => days(90).map((date, i) => ({ date, weight: 80 + Math.sin(i / 5) }));
  const sleepData = () => days(90).map((date, i) => ({ date, hours: 6 + (i % 3) }));

  const charts = async () => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    const { MealTimeChart } = await import('../../src/components/MealTimeChart');
    const { MacroTargetChart } = await import('../../src/components/MacroTargetChart');
    const mealSlice = [{ name: 'Morning', calories: 500, count: 2 }, { name: 'Evening', calories: 900, count: 3 }];
    return mount(React.createElement('div', null,
      React.createElement(TrendChart, { id: 'weight', title: 'Weight Trend', icon: React.createElement('span'), data: weightData(), unit: 'kg', series: [{ key: 'weight', label: 'Weight', color: '#000' }], empty: 'none' }),
      React.createElement(TrendChart, { id: 'sleep', title: 'Sleep', icon: React.createElement('span'), data: sleepData(), unit: 'hrs', series: [{ key: 'hours', label: 'Sleep', color: '#000' }], empty: 'none', defaultStyle: 'bar' }),
      React.createElement(MealTimeChart, { data7: mealSlice, data14: mealSlice, data30: mealSlice, data90: mealSlice }),
      React.createElement(MacroTargetChart, { title: 'Protein: Actual vs Target', unit: 'g', data: days(90).map((date) => ({ date, actual: 100, min: 90, max: 130 })) }),
    ));
  };

  test('opens with the chart\'s own range and style; the card is not touched', async () => {
    await charts();
    assert.equal(dialog(), null, 'closed by default');
    const d = await open('Weight Trend');
    assert.ok(d, 'viewer opened');
    assert.equal(d.querySelector('h2')?.textContent, 'Weight Trend');
    assert.equal(checked(d, 'Weight Trend range'), 'Last 30 days');
    assert.equal(checked(d, 'Weight Trend chart type'), 'Bar chart');
    assert.ok(d.querySelector('[data-chart-summary]'), 'summary available on demand');
    assert.equal(tableRows(d), 30, 'screen reader table has the 30 days of the chosen range');
    // The card behind it keeps its own, identical state.
    assert.equal(stored('fittrack_chart_weight_range'), '30');
    assert.equal(stored('fittrack_chart_weight_style'), 'bar');
  });

  test('a different chart opens with ITS state (sleep: 7D bar), not weight\'s', async () => {
    await charts();
    const d = await open('Sleep');
    assert.equal(checked(d, 'Sleep range'), 'Last 7 days');
    assert.equal(checked(d, 'Sleep chart type'), 'Bar chart');
    assert.equal(tableRows(d), 7);
  });

  test('changing range and style inside the viewer updates that chart\'s saved state and the card, never another chart', async () => {
    const host = await charts();
    const d = await open('Weight Trend');
    await pick(d, 'Weight Trend range', 'Last 90 days');
    assert.equal(stored('fittrack_chart_weight_range'), '90');
    assert.equal(tableRows(d), 90, 'the viewer chart re-filtered');
    assert.equal(checked(host, 'Weight Trend range'), 'Last 90 days', 'the card behind follows: one state, not a copy');
    await pick(d, 'Weight Trend chart type', 'Line chart');
    assert.equal(stored('fittrack_chart_weight_style'), 'line');
    assert.equal(checked(host, 'Weight Trend chart type'), 'Line chart');
    // Everyone else untouched.
    assert.equal(stored('fittrack_chart_sleep_range'), '7');
    assert.equal(stored('fittrack_chart_sleep_style'), 'bar');
    assert.equal(stored('fittrack_chart_meal_time_range'), '14');
    assert.equal(checked(host, 'Sleep range'), 'Last 7 days');
    assert.equal(stored('fittrack_chart_macro_Protein: Actual vs Target_range'), '7', 'macro chart default, unchanged');
  });

  test('range-only chart stays range-only in the viewer (no line/bar switch) and keeps its range', async () => {
    await charts();
    const d = await open('Calories by Time of Day');
    assert.equal(checked(d, 'Calories by Time of Day range'), 'Last 14 days');
    assert.equal(d.querySelector('[aria-label$="chart type"]'), null);
    assert.ok(d.querySelector('ul[aria-label="Share of calories by time of day"]'), 'the legend list comes along');
    await pick(d, 'Calories by Time of Day range', 'Last 90 days');
    assert.equal(stored('fittrack_chart_meal_time_range'), '90');
    assert.equal(stored('fittrack_chart_meal_time_style'), null, 'no style is ever stored for it');
  });

  test('the viewer chart is the expanded variant: a tall plot box that grows, only one figure is expanded', async () => {
    await charts();
    const d = await open('Weight Trend');
    const plot = d.querySelector('[data-chart-plot]') as HTMLElement;
    assert.ok(plot, 'expanded plot box');
    assert.equal(plot.style.minHeight, '360px');
    assert.match(plot.className, /\bflex-1\b/);
    assert.equal(doc().querySelectorAll('figure[data-chart-expanded]').length, 1);
    assert.equal(doc().querySelectorAll('[data-chart-plot]').length, 1, 'cards keep their fixed height');
  });

  test('pop-out and PDF sit in one actions unit on the card; the viewer has PDF but no second pop-out; all excluded from PDF capture', async () => {
    const host = await charts();
    const actions = host.querySelector('[data-chart-header] [data-chart-actions]')!;
    assert.ok(actions.querySelector('[aria-label="Download Weight Trend as PDF"]'));
    assert.ok(actions.querySelector('[aria-label="Open Weight Trend in full screen"]'));
    assert.equal(actions.querySelector('[data-chart-expand]')?.getAttribute('data-html2canvas-ignore'), 'true');
    assert.equal(actions.closest('[data-chart-controls]')?.getAttribute('data-html2canvas-ignore'), 'true');
    const d = await open('Weight Trend');
    assert.ok(d.querySelector('[data-chart-controls] [data-chart-actions] [aria-label="Download Weight Trend as PDF"]'));
    assert.equal(d.querySelector('[data-chart-expand]'), null);
    assert.equal(d.querySelector('[data-chart-controls]')?.getAttribute('data-html2canvas-ignore'), 'true');
    assert.equal(d.querySelector('[aria-label="Close full screen view"]')?.getAttribute('data-html2canvas-ignore'), 'true');
  });

  test('Escape closes the viewer and focus returns to the pop-out button', async () => {
    await charts();
    const trigger = expandButton('Weight Trend');
    trigger.focus();
    await act(async () => click(env.window, trigger));
    await flush(10);
    assert.ok(dialog());
    assert.ok(dialog()!.contains(doc().activeElement), 'focus moved inside the dialog');
    await act(async () => { doc().dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flush(30);
    assert.equal(dialog(), null, 'closed by Escape');
    assert.equal(doc().activeElement, trigger, 'focus is back on the pop-out button');
  });

  test('the close button closes it and returns focus too; the dialog has a title and a description', async () => {
    await charts();
    const trigger = expandButton('Sleep');
    trigger.focus();
    const d = await open('Sleep');
    assert.ok(d.getAttribute('aria-labelledby') && doc().getElementById(d.getAttribute('aria-labelledby')!)?.textContent === 'Sleep');
    assert.ok(d.getAttribute('aria-describedby') && doc().getElementById(d.getAttribute('aria-describedby')!));
    await act(async () => click(env.window, d.querySelector('[aria-label="Close full screen view"]')!));
    await flush(30);
    assert.equal(dialog(), null);
    assert.equal(doc().activeElement, trigger);
  });

  test('no element id appears twice while card and viewer are both on screen, and every aria reference points at exactly one element', async () => {
    await charts();
    await open('Weight Trend');
    const ids = [...doc().querySelectorAll('[id]')].map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
    for (const el of doc().querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]')) {
      for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        for (const ref of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
          // aria-controls of a closed trigger may point at an unmounted dialog; the others must resolve.
          if (attr === 'aria-controls') continue;
          assert.equal(doc().querySelectorAll(`[id="${ref}"]`).length, 1, `${attr}="${ref}" on <${el.tagName.toLowerCase()}>`);
        }
      }
    }
    assert.equal(doc().querySelectorAll('figure[aria-describedby]').length, 5, 'four cards plus the viewer: every figure has its own summary id');
  });

  test('PDF from the viewer captures the viewer chart; PDF from the card still captures the card', async () => {
    const host = await charts();
    const cardPdf = host.querySelector('[aria-label="Download Weight Trend as PDF"]') as HTMLElement;
    await act(async () => click(env.window, cardPdf));
    await flush(80);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].closest('[data-chart-viewer]'), null, 'card PDF is not the viewer');
    assert.ok(captured[0].querySelector('[data-chart-header]'), 'card PDF captures the whole card');

    const d = await open('Weight Trend');
    await act(async () => click(env.window, d.querySelector('[aria-label="Download Weight Trend as PDF"]')!));
    await flush(80);
    assert.equal(captured.length, 2);
    assert.ok(captured[1].closest('[data-chart-viewer]'), 'viewer PDF captures inside the viewer');
    assert.ok(captured[1].querySelector('figure[data-chart-expanded]'), 'and it is the expanded chart');
    assert.equal(captured[1].querySelector('[data-chart-controls]'), null, 'controls are never inside what is captured');
    assert.equal(saved.length, 2);
  });

  test('an empty chart opens too: same empty message and link, range controls still usable', async () => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    await mount(React.createElement(TrendChart, { id: 'weight', title: 'Weight Trend', icon: React.createElement('span'), data: [], unit: 'kg', series: [{ key: 'weight', label: 'Weight', color: '#000' }], empty: 'No weight entries in this period.' }));
    const d = await open('Weight Trend');
    assert.match(d.querySelector('[role="status"]')?.textContent ?? '', /No weight entries logged yet/);
    assert.equal(d.querySelector('[role="status"] a')?.getAttribute('href'), '/weight');
    assert.equal(checked(d, 'Weight Trend range'), 'Last 30 days');
  });

  test('fixed-window and delta charts open with the shared viewer and have no range / style / PDF', async () => {
    const { WeeklyBarChart } = await import('../../src/components/charts/WeeklyBarChart');
    const { DeltaChart } = await import('../../src/components/charts/DeltaChart');
    const { ReportCharts } = await import('../../src/components/ReportCharts');
    const week = Array.from({ length: 7 }, (_, i) => ({ date: `D${i}`, fullDate: iso(6 - i), calories: 1000 + i }));
    await mount(React.createElement('div', null,
      React.createElement(WeeklyBarChart, { title: 'Weekly Calories', icon: React.createElement('span'), data: week, valueKey: 'calories', label: 'Calories', unit: 'cal', color: '#000' }),
      React.createElement(DeltaChart, { title: 'Weight Change', icon: React.createElement('span'), unit: 'kg', entries: [{ date: iso(10), value: 81 }, { date: iso(3), value: 80 }], emptyText: 'Log two.' }),
      React.createElement(ReportCharts, { data: days(14).map((date) => ({ date, calories: 2000, workout: 30, sleep: 7 })) }),
    ));
    for (const title of ['Weekly Calories', 'Weight Change', 'Calories & Workout Trend', 'Sleep Trend']) {
      const d = await open(title);
      assert.ok(d, title);
      assert.equal(d.querySelector('h2')?.textContent, title);
      assert.ok(d.querySelector('[data-chart-plot]'), `${title} has an expanded plot`);
      assert.equal(d.querySelector('[role="radiogroup"]'), null, `${title} gained no range or style switch`);
      assert.equal(d.querySelector('[aria-label^="Download"]'), null);
      await act(async () => click(env.window, d.querySelector('[aria-label="Close full screen view"]')!));
      await flush(30);
      assert.equal(dialog(), null);
    }
  });

  test('body recomposition opens with its range and its badges', async () => {
    const { BodyRecompositionCard } = await import('../../src/components/BodyRecompositionCard');
    env.window.localStorage.setItem('fittrack_chart_body_recomp_range', '14');
    await mount(React.createElement(BodyRecompositionCard, { weight: days(30).map((date) => ({ date, value: 80 })), waist: days(30).map((date) => ({ date, value: 90 })) }));
    const d = await open('Body Recomposition Index');
    assert.equal(checked(d, 'Body Recomposition Index range'), 'Last 14 days');
    assert.equal(d.querySelector('[aria-label$="chart type"]'), null);
    assert.match(d.textContent ?? '', /Δ Weight/);
  });
});
