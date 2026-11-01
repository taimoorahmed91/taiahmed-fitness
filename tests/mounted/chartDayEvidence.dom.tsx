import { describe, test, expect, mock, beforeAll, afterAll, afterEach } from 'bun:test';
import { click, installDom, loadJsdom } from './support/domHarness';

// Mounted (real DOM): evidence dates in the Dashboard card (CrossMetricSummaryCard) and the Reports card (InsightCard)
// open that day in Calendar through the shared adapter, a normal history push. Counts and copy are untouched.
// Same data as insightEvidence.dom.tsx. Run through tests/laneBMountedRunner.test.ts, or: bun test ./tests/mounted/chartDayEvidence.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Phase = 'ready' | 'loading' | 'error';
const tables = {
  meals: { phase: 'ready' as Phase, refreshFailed: false },
  gym_sessions: { phase: 'ready' as Phase, refreshFailed: false },
  sleep: { phase: 'ready' as Phase, refreshFailed: false },
  whoop: { phase: 'ready' as Phase, refreshFailed: false },
};
const states: Record<string, { phase: Phase; refreshFailed: boolean; loadFailed: boolean; error: null }> = {};
const stateFor = (t: keyof typeof tables) => {
  const cur = tables[t];
  const key = `${t}:${cur.phase}:${cur.refreshFailed}`;
  return (states[key] ||= { ...cur, loadFailed: cur.phase === 'error', error: null });
};

// Dates are relative to today so they always sit inside the card's 30-day window.
const iso = (offset: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const dates = Array.from({ length: 8 }, (_, i) => iso(i - 9));
const d = (n: number) => dates[n - 1];   // d(1) is the first of the eight days
const data = {
  meals: dates.map((date, i) => ({ id: `m${i}`, date, calories: 2000 + i * 100, carbs: i === 2 ? null : 250 + i * 10 })),
  sessions: dates.slice(0, 7).map((date, i) => ({ id: `s${i}`, date, duration: 50 + i, notes: `1.Row: S1:10@${50 + i}kg` })),
  sleep: [5, 6, 6, 6.4, 7.5, 8, 6.5, 7].map((hours, i) => ({ id: `z${i}`, date: dates[i], hours })),
  whoop: [80, 70, 66, 65, 40, 30, 90].map((s, i) => ({ id: `w${i}`, date: dates[i], recovery_score: s, created_at: `${dates[i]}T06:00:00Z`, cycle_end_timestamp: null })),
};
mock.module('@/hooks/useMeals', () => ({ useMeals: () => ({ meals: data.meals }) }));
mock.module('@/hooks/useGymSessions', () => ({ useGymSessions: () => ({ sessions: data.sessions }) }));
mock.module('@/hooks/useSleep', () => ({ useSleep: () => ({ entries: data.sleep }) }));
mock.module('@/hooks/useWhoopData', () => ({ useWhoopData: () => ({ entries: data.whoop }) }));
mock.module('@/hooks/useInsightThresholds', () => ({ useInsightThresholds: () => ({ thresholds: THRESHOLDS }) }));
const THRESHOLDS = { recoveryCutoff: 66, sleepCutoff: 6.5 };
mock.module('@/lib/sharedTable', () => ({ useSharedTableState: (t: keyof typeof tables) => stateFor(t) }));
mock.module('@/hooks/useWeight', () => ({ useWeight: () => ({ entries: [] }) }));
mock.module('@/hooks/useWaist', () => ({ useWaist: () => ({ entries: [] }) }));

describe('mounted: insight evidence dates open Calendar', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any, roots: any[] = [];
  let loc = { pathname: '', search: '' };
  beforeAll(async () => {
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
  afterAll(() => env?.window.close());

  const $ = (sel: string) => env.window.document.querySelector(sel) as HTMLElement | null;
  const Probe = () => {
    const l = Router.useLocation();
    loc = { pathname: l.pathname, search: l.search };
    return null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (page: any) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const { MemoryRouter, Routes, Route } = Router;
    await act(async () => root.render(
      React.createElement(MemoryRouter, { initialEntries: ['/dashboard?tab=insights'] },
        React.createElement(Probe),
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/dashboard', element: React.createElement(page) }),
          React.createElement(Route, { path: '/calendar', element: React.createElement('p', null, 'calendar page') }),
        ),
      ),
    ));
  };

  test('Dashboard card: an evidence date navigates to /calendar?date=ISO (a push) and the evidence counts are unchanged', async () => {
    const { CrossMetricSummaryCard } = await import('../../src/components/CrossMetricSummaryCard');
    const { useOpenCalendarDay } = await import('../../src/components/charts/useOpenCalendarDay');
    const Page = () => React.createElement(CrossMetricSummaryCard, { onSelectDate: useOpenCalendarDay() });
    await mount(Page);
    await act(async () => click(env.window, $('[data-testid="cross-metric-recovery_vs_gym"] button[aria-expanded]')!));
    const high = $('[data-testid="evidence-cohort-high"]')!;
    const low = $('[data-testid="evidence-cohort-low"]')!;
    expect(high.querySelector('h5')!.textContent).toContain('4 days');
    expect(low.querySelector('h5')!.textContent).toContain('3 days');
    expect($('[data-testid="cross-metric-recovery_vs_gym"]')!.textContent).toContain('Based on 4 higher-recovery and 3 lower-recovery workout days');
    // Dates are neutral buttons: no good/bad colouring.
    expect(high.innerHTML).not.toMatch(/chart-(min|max|warn)|text-green|text-red/);
    await act(async () => click(env.window, $(`[data-testid="evidence-cohort-low"] tbody button[data-iso-date="${d(5)}"]`)!));
    expect(loc).toEqual({ pathname: '/calendar', search: `?date=${d(5)}` });
    expect($('p')!.textContent).toBe('calendar page');
  });

  test('Reports card: InsightCard with the same adapter opens the evidence date in Calendar', async () => {
    const { InsightCard } = await import('../../src/components/InsightCard');
    const { useOpenCalendarDay } = await import('../../src/components/charts/useOpenCalendarDay');
    const { useCrossMetricInsights } = await import('../../src/hooks/useCrossMetricInsights');
    const Page = () => {
      const open = useOpenCalendarDay();
      const insights = useCrossMetricInsights(d(1));
      return React.createElement('div', null, insights.map((i) => React.createElement(InsightCard, { key: i.id, insight: i, onSelectDate: open })));
    };
    await mount(Page);
    await act(async () => click(env.window, $('button[aria-expanded]')!));
    const btn = $(`[data-testid="evidence-cohort-high"] tbody button[data-iso-date="${d(2)}"]`)!;
    expect(btn).not.toBeNull();
    await act(async () => click(env.window, btn));
    expect(loc).toEqual({ pathname: '/calendar', search: `?date=${d(2)}` });
  });

  test('the adapter ignores anything that is not a real ISO date (no empty or wrong Calendar day)', async () => {
    const { useOpenCalendarDay } = await import('../../src/components/charts/useOpenCalendarDay');
    const Page = () => {
      const open = useOpenCalendarDay();
      return React.createElement('div', null, ['2026-02-30', '10/30', '', '2026-10-30T10:00:00Z', 'banana'].map((v) => React.createElement('button', { key: v, 'data-bad': v, onClick: () => open(v) }, v || 'empty')));
    };
    await mount(Page);
    for (const b of env.window.document.querySelectorAll('button[data-bad]')) await act(async () => click(env.window, b));
    expect(loc).toEqual({ pathname: '/dashboard', search: '?tab=insights' });
  });
});
