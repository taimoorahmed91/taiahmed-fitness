import { describe, test, beforeAll as before, afterAll as after, afterEach, mock } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Account-scoped chart selection with the REAL user context object (src/contexts/userContextCore.ts), no mocks of it:
// a Provider value changes from account A to account B while the chart keeps the very same rows. The previous account's
// selected day must not be on screen for B, not even for one render. (The scope rules themselves, with a mocked id and the
// viewer panel: tests/mounted/chartDaySelection.dom.tsx.)
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

describe('mounted: chart selection follows the real user context', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any, Ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    (globalThis as Record<string, unknown>).__React = React;
    ({ createRoot } = await import('react-dom/client'));
    Router = await import('react-router-dom');
    Ctx = await import('../../src/contexts/userContextCore');
    act = React.act;
    env.window.matchMedia = (query: string) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
    Object.defineProperty(globalThis, 'matchMedia', { value: env.window.matchMedia, configurable: true, writable: true });
  });
  after(() => env?.window.close());
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });

  const rows = () => days(20).map((date, i) => ({ date, weight: 80 + (i % 4) / 10 }));
  const provide = (id: string | null, node: unknown) =>
    React.createElement(Ctx.UserContext.Provider, { value: id === null ? { user: null } : { user: { id } } }, node);

  test('A selects a day; B (same rows, same dates) sees nothing selected on its first render and cannot inherit it', async () => {
    const { TrendChart } = await import('../../src/components/TrendChart');
    env.window.localStorage.setItem('fittrack_chart_weight_range', '30');
    const data = rows();
    const chart = React.createElement(TrendChart, { id: 'weight', title: 'Weight Trend', icon: React.createElement('span'), data, unit: 'kg', series: [{ key: 'weight', label: 'Weight', color: '#000' }], empty: 'none' });
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const draw = (id: string | null) => act(async () => root.render(React.createElement(Router.MemoryRouter, null, provide(id, chart))));
    const readout = () => host.querySelector('[data-chart-day-readout]')?.getAttribute('data-chart-day-readout') ?? null;

    await draw('user-a');
    const target = data[10].date;
    const circle = host.querySelector(`g[data-chart-point="${target}"] circle[fill="transparent"]`)!;
    await act(async () => click(env.window, circle));
    assert.equal(readout(), target, 'A selected the day');

    await draw('user-a'); // same account re-render keeps it
    assert.equal(readout(), target);

    await draw('user-b');
    assert.ok(readout() === null, 'B does not see A\'s day');
    assert.ok(host.querySelector('g[data-selected]') === null);
    assert.equal(host.querySelector('[data-chart-day-live]')?.textContent, '');
    await act(async () => { await sleep(20); });
    assert.ok(readout() === null, 'and it does not come back after effects run');

    await draw('user-a');
    assert.ok(readout() === null, 'A\'s old choice is not resurrected when A returns');
  });
});
