import { describe, test, beforeAll as before, afterAll as after, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom } from './support/domHarness';

// Mounted (real DOM) check of the chart empty-state links and the shared heading primitives:
// a link really navigates in the router, keeps link semantics, and the heading outline has no gaps.
// Run through tests/laneBMountedRunner.test.ts (own process), or: bun test ./tests/mounted/chartEmptyActions.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: run `bun install` (jsdom is a devDependency) or set JSDOM_PATH');

describe('mounted: chart empty-state actions and heading primitives', () => {
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
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });
  after(() => env?.window.close());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any, url = '/dashboard') => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const Where = () => React.createElement('p', { 'data-testid': 'where' }, Router.useLocation().pathname);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, { initialEntries: [url] }, node, React.createElement(Where))));
    return host;
  };
  const where = () => env.window.document.querySelector('[data-testid="where"]')?.textContent;
  const linkTexts = () => [...env.window.document.querySelectorAll('[role="status"] a')].map((a: HTMLAnchorElement) => `${a.getAttribute('href')}|${a.textContent}`);

  test('weight trend with nothing logged: one real link; clicking it navigates to /weight', async () => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    const { Scale } = await import('lucide-react');
    await mount(React.createElement(TrendChart, {
      id: 'weight', title: 'Weight Trend', icon: React.createElement(Scale), data: [], unit: 'kg',
      series: [{ key: 'weight', label: 'Weight', color: '#000' }], empty: 'No weight entries in this period. Try a wider date range.',
    }));
    assert.deepEqual(linkTexts(), ['/weight|Add a weigh-in']);
    assert.equal(env.window.document.querySelector('[role="status"] button'), null, 'a link, not a button');
    assert.equal(where(), '/dashboard');
    await act(async () => click(env.window, env.window.document.querySelector('[role="status"] a')));
    assert.equal(where(), '/weight');
  });

  test('weight trend with entries outside the range: range advice, no link', async () => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    await mount(React.createElement(TrendChart, {
      id: 'weight', title: 'Weight Trend', icon: React.createElement('span'), data: [{ date: '2001-01-01', weight: 80 }], unit: 'kg',
      series: [{ key: 'weight', label: 'Weight', color: '#000' }], empty: 'No weight entries in this period. Try a wider date range.',
    }));
    assert.deepEqual(linkTexts(), []);
    assert.match(env.window.document.querySelector('[role="status"]')?.textContent ?? '', /Try a wider date range/);
  });

  test('empty body recomposition offers both body pages and each one navigates', async () => {
    const { BodyRecompositionCard } = await import('../../src/components/BodyRecompositionCard');
    await mount(React.createElement(BodyRecompositionCard, { weight: [], waist: [] }), '/reports');
    assert.deepEqual(linkTexts(), ['/weight|Add a weigh-in', '/waist|Add a measurement']);
    await act(async () => click(env.window, env.window.document.querySelectorAll('[role="status"] a')[1]));
    assert.equal(where(), '/waist');
  });

  test('empty weekly intake chart links to Meals', async () => {
    const { WeeklyBarChart } = await import('../../src/components/charts/WeeklyBarChart');
    const data = Array.from({ length: 7 }, (_, i) => ({ date: `D${i}`, fullDate: `2001-01-0${i + 1}`, protein: 0 }));
    await mount(React.createElement(WeeklyBarChart, { title: 'Weekly Protein', icon: React.createElement('span'), data, valueKey: 'protein', label: 'Protein', unit: 'g', color: '#000' }));
    assert.deepEqual(linkTexts(), ['/meals|Log a meal']);
  });

  test('heading outline: PageHeader h1 > PageSection h2 > Card h3, nested section h3, no skipped level', async () => {
    const { PageHeader, PageSection } = await import('../../src/components/layout/Page');
    const { Card, CardHeader, CardTitle } = await import('../../src/components/ui/card');
    await mount(React.createElement('div', null,
      React.createElement(PageHeader, { title: 'Dashboard' }),
      React.createElement(PageSection, { title: 'Trends' },
        React.createElement(Card, { titleSize: 'chart' }, React.createElement(CardHeader, null, React.createElement(CardTitle, null, 'Weight'))),
        React.createElement(PageSection, { title: 'Nested', headingLevel: 'h3' }, 'x'))));
    const levels = [...env.window.document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h: HTMLElement) => `${h.tagName.toLowerCase()}:${h.textContent}`);
    assert.deepEqual(levels, ['h1:Dashboard', 'h2:Trends', 'h3:Weight', 'h3:Nested']);
    const weight = [...env.window.document.querySelectorAll('h3')].find((h: HTMLElement) => h.textContent === 'Weight') as HTMLElement;
    assert.ok(weight.classList.contains('text-lg') && !weight.classList.contains('text-2xl'), 'chart size role applied');
    const section = env.window.document.querySelector('section') as HTMLElement;
    assert.equal(env.window.document.getElementById(section.getAttribute('aria-labelledby')!)?.textContent, 'Trends');
  });
});
