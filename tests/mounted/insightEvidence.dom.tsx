import { describe, test, expect, mock, beforeAll, afterAll, afterEach } from 'bun:test';
import { click, installDom, loadJsdom } from './support/domHarness';

// Mounted (real DOM) checks for the "Show evidence" disclosure behind cross-metric insights, and for the hook that
// feeds it: closed by default, keyboard-operable, a real table per group with ISO dates, exact counts, neutral
// words, stale/unavailable sources disclosed honestly.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/insightEvidence.dom.tsx
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

describe('mounted: cross-metric evidence disclosure', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, Router: any, roots: any[] = [];
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
    for (const t of Object.keys(tables) as (keyof typeof tables)[]) tables[t] = { phase: 'ready', refreshFailed: false };
  });
  afterAll(() => env?.window.close());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(Router.MemoryRouter, null, node)));
    return host as HTMLElement;
  };
  const $ = (sel: string) => env.window.document.querySelector(sel) as HTMLElement | null;
  const $$ = (sel: string) => [...env.window.document.querySelectorAll(sel)] as HTMLElement[];
  const card = async (props: Record<string, unknown> = {}) => {
    const { CrossMetricSummaryCard } = await import('../../src/components/CrossMetricSummaryCard');
    return mount(React.createElement(CrossMetricSummaryCard, props));
  };
  const toggleFor = (id: string) => $(`[data-testid="cross-metric-${id}"] button[aria-expanded]`)!;

  test('both insights show their full result with the neutral lead, no line clamp, and evidence closed by default', async () => {
    await card();
    const rec = $('[data-testid="cross-metric-recovery_vs_gym"]')!;
    const sl = $('[data-testid="cross-metric-sleep_vs_nutrition"]')!;
    for (const el of [rec, sl]) {
      expect(el.textContent).toContain('Observed difference in logged days');
      expect(el.querySelector('[class*="line-clamp"]')).toBeNull();
    }
    expect(rec.textContent).toContain('Based on 4 higher-recovery and 3 lower-recovery workout days');
    expect(sl.textContent).toContain('Based on 4 shorter-sleep and 4 longer-sleep days');
    expect(toggleFor('recovery_vs_gym').getAttribute('aria-expanded')).toBe('false');
    expect(toggleFor('recovery_vs_gym').textContent).toContain('Show evidence');
    expect($('table')).toBeNull();
    // No good/bad colouring anywhere in the insight blocks.
    expect(rec.innerHTML + sl.innerHTML).not.toMatch(/chart-(min|max)|text-green|text-red/);
  });

  test('disclosure is a native button: focusable, toggles aria-expanded, controls a labelled region', async () => {
    await card();
    const btn = toggleFor('recovery_vs_gym') as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.type).toBe('button');
    expect(btn.tabIndex).toBe(0);
    const panel = env.window.document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(panel.hasAttribute('hidden')).toBe(true);
    await act(async () => click(env.window, btn));
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toContain('Hide evidence');
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toBe('Evidence for Recovery vs. Gym');
    await act(async () => click(env.window, btn));
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hasAttribute('hidden')).toBe(true);
  });

  test('recovery evidence: threshold/window text, two group tables with ISO dates, exact counts, neutral delta', async () => {
    await card();
    await act(async () => click(env.window, toggleFor('recovery_vs_gym')));
    const panel = $('[data-testid="insight-evidence-recovery_vs_gym"]')!;
    expect(panel.textContent).toContain(`Window: logged days from ${iso(-29)} onward`);
    expect(panel.textContent).toContain('Recovery of 66% or higher is the higher group');
    const high = $('[data-testid="evidence-cohort-high"]')!;
    const low = $('[data-testid="evidence-cohort-low"]')!;
    const isoIn = (el: HTMLElement) => [...el.querySelectorAll('tbody [data-iso-date]')].map((n) => n.getAttribute('data-iso-date'));
    expect(isoIn(high)).toEqual([d(1), d(2), d(3), d(7)]);
    expect(isoIn(low)).toEqual([d(4), d(5), d(6)]);
    expect(high.querySelector('h5')!.textContent).toContain('4 days');
    expect(low.querySelector('h5')!.textContent).toContain('3 days');
    // Real tables: caption, column headers and row headers, dates as <time>.
    expect(high.querySelector('caption')).not.toBeNull();
    expect([...high.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['Date', 'Recovery', 'Time (min)', 'Volume (kg)']);
    expect(high.querySelector(`tbody tr th time[datetime="${d(1)}"]`)).not.toBeNull();
    expect(high.querySelector('tbody tr:first-child')!.textContent).toContain('80%');
    expect(high.querySelector('tbody tr:first-child')!.textContent).toContain('500');
    // The scrollable region is keyboard reachable.
    expect(high.querySelector('[role="region"]')!.getAttribute('tabindex')).toBe('0');
    const delta = $('[data-testid="evidence-delta"]')!.textContent!;
    expect(delta).toContain('Observed difference in logged days');
    expect(delta).toContain('does not show a cause');
    expect(panel.textContent).not.toMatch(/\b(better|worse|healthier|improv|boost)\w*/i);
    // No colour-coded meaning inside the disclosure.
    expect(panel.innerHTML).not.toMatch(/chart-(min|max|warn)|text-green|text-red/);
  });

  test('sleep evidence: unknown carbs show a dash with a spoken label and denominators match known-carb days', async () => {
    await card();
    await act(async () => click(env.window, toggleFor('sleep_vs_nutrition')));
    const panel = $('[data-testid="insight-evidence-sleep_vs_nutrition"]')!;
    const short = $('[data-testid="evidence-cohort-short"]')!;
    const normal = $('[data-testid="evidence-cohort-normal"]')!;
    expect([...short.querySelectorAll('tbody [data-iso-date]')].map((n) => n.getAttribute('data-iso-date'))).toEqual([d(1), d(2), d(3), d(4)]);
    expect(normal.querySelectorAll('tbody tr').length).toBe(4);
    const unknownRow = [...short.querySelectorAll('tbody tr')].find((r) => r.querySelector(`[data-iso-date="${d(3)}"]`))!;
    expect(unknownRow.querySelector('.sr-only')!.textContent).toBe('not recorded');
    expect(panel.textContent).toContain('Carbs known on 3 of 4 shorter-sleep and 4 of 4 longer-sleep days');
    expect(panel.textContent).toContain('Sleep logged on a date is matched with the meals logged on that same date');
    expect(panel.textContent).toContain('Sleep under 6.5 h is the shorter-sleep group');
  });

  test('onSelectDate turns each date into a button that reports its ISO date; without it dates are plain time elements', async () => {
    const picked: string[] = [];
    await card({ onSelectDate: (d: string) => picked.push(d) });
    await act(async () => click(env.window, toggleFor('recovery_vs_gym')));
    const btn = $(`[data-testid="evidence-cohort-low"] tbody button[data-iso-date="${d(5)}"]`) as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe(`Open ${d(5)}`);
    await act(async () => click(env.window, btn));
    expect(picked).toEqual([d(5)]);
  });

  test('a source whose refresh failed is named even while the disclosure is closed; a source that never loaded gives no insight', async () => {
    tables.sleep = { phase: 'ready', refreshFailed: true };
    await card();
    const sl = $('[data-testid="cross-metric-sleep_vs_nutrition"]')!;
    expect(sl.querySelector('[data-testid="evidence-stale"]')!.textContent).toContain('refresh of sleep failed');
    expect($('[data-testid="cross-metric-recovery_vs_gym"] [data-testid="evidence-stale"]')).toBeNull();
    await act(async () => env.window.document.body.innerHTML = '');
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    tables.whoop = { phase: 'error', refreshFailed: false };
    tables.meals = { phase: 'loading', refreshFailed: false };
    await card();
    expect($('[data-testid="cross-metric-recovery_vs_gym"]')).toBeNull();
    expect($('[data-testid="cross-metric-sleep_vs_nutrition"]')).toBeNull();
    expect($('table')).toBeNull();
    expect($('[data-testid^="insight-evidence"]')).toBeNull();
  });

  test('hook output is always neutral and carries evidence whose counts equal the copy', async () => {
    const { useCrossMetricInsights } = await import('../../src/hooks/useCrossMetricInsights');
    let out: ReturnType<typeof useCrossMetricInsights> = [];
    const Probe = () => { out = useCrossMetricInsights(d(1)); return null; };
    await mount(React.createElement(Probe));
    expect(out.map((i) => i.id)).toEqual(['recovery_vs_gym', 'sleep_vs_nutrition']);
    expect(out.every((i) => i.correlation === 'neutral')).toBe(true);
    const rec = out[0].evidence as { high: unknown[]; low: unknown[] };
    expect(out[0].description).toContain(`${rec.high.length} higher-recovery and ${rec.low.length} lower-recovery`);
  });
});
