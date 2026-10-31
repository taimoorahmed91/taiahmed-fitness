import { describe, test, expect, mock, beforeAll, afterAll, afterEach, beforeEach } from 'bun:test';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Weight, Waist, Sleep and Reports, mounted on the REAL shared-table hooks with a scripted backend.
// The point: a blocked / failed request must never render "No entries yet" or zeros, a failed refresh must keep
// the last rows on screen, and a true empty table must still say so.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/trackerLoadState.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Answer = { data?: unknown; error?: unknown } | 'pending';
/** What each table's next query answers. Mutated by the tests. */
const behaviour: Record<string, () => Answer> = {};
const requests: string[] = [];
const makeChain = (table: string): unknown => {
  const chain: Record<string, unknown> = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        requests.push(table);
        const answer = (behaviour[table] ?? (() => ({ data: [] })))();
        if (answer === 'pending') return () => undefined;
        return (resolve: (v: unknown) => unknown) => resolve({ data: answer.data ?? null, error: answer.error ?? null });
      }
      return () => chain;
    },
  });
  return chain;
};
mock.module('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => makeChain(table), auth: {} } }));
mock.module('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'user-a', email: 'a@example.com' }, loading: false }) }));
mock.module('@/lib/authSession', () => ({ getSessionUser: async () => ({ id: 'user-a' }), onAuthIdentityChange: () => ({ unsubscribe() {} }) }));
mock.module('@/hooks/useActivityLog', () => ({ logActivity: () => {} }));
mock.module('@/hooks/usePersonalData', () => ({ usePersonalData: () => ({ data: { target_weight_kg: null }, loading: false }) }));
mock.module('@/hooks/useUserSettings', () => ({ useUserSettings: () => ({ settings: { waist_measurement_interval: 7, daily_calorie_goal: 2000 }, loading: false }) }));
// Reports: the heavy children are stand-ins that only say they rendered. The calculations are stubbed to ZEROS on purpose:
// a page that drew them for a table that never loaded would show "0h", which the tests forbid.
mock.module('@/components/ReportCharts', () => ({ ReportCharts: () => <div data-testid="report-charts">charts</div> }));
mock.module('@/components/WeeklyDigestCard', () => ({ WeeklyDigestCard: () => <div data-testid="digest">digest</div> }));
mock.module('@/components/BodyRecompositionCard', () => ({ BodyRecompositionCard: () => <div data-testid="recomp">recomp</div> }));
mock.module('@/components/ShareableSummary', () => ({ ShareableSummary: () => <div data-testid="summary">summary</div> }));
mock.module('@/components/InsightCard', () => ({ InsightCard: () => <div /> }));
mock.module('@/hooks/useCrossMetricInsights', () => ({ useCrossMetricInsights: () => [] }));
mock.module('@/hooks/useReportData', () => ({
  useReportData: () => ({
    stats: { avgCalories: 0, totalWorkouts: 0, avgSleepHours: 0, avgWeight: 0, weightChange: 0, goalsMetDays: 0, totalDays: 7, calorieGoal: 2000, avgWorkoutDuration: 0 },
    chartData: [],
    dailyData: [],
    correlationInsights: [],
  }),
}));

const ok = (rows: unknown[]) => () => ({ data: rows });
const fail = () => ({ error: { message: 'Failed to fetch' } });
const weightRow = { id: 'w1', weight: '81.5', date: '2026-10-01', notes: null };
const waistRow = { id: 'a1', waist: '90', date: '2026-10-01', notes: null };
const sleepRow = { id: 's1', hours: '7.5', date: '2026-10-01', notes: null };

describe('trackers and reports: failed fetch is not empty', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, QueryClient: any, QueryClientProvider: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Weight: any, Waist: any, Sleep: any, Reports: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let root: any, client: any;
  const consoleError = console.error;

  beforeAll(async () => {
    env = installDom(JSDOM);
    console.error = () => {}; // the hooks log every failed fetch; that is expected here
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    act = React.act;
    Weight = (await import('../../src/pages/Weight')).default;
    Waist = (await import('../../src/pages/Waist')).default;
    Sleep = (await import('../../src/pages/Sleep')).default;
    Reports = (await import('../../src/pages/Reports')).default;
  });
  afterAll(() => { console.error = consoleError; env?.window.close(); });
  beforeEach(() => {
    for (const key of Object.keys(behaviour)) delete behaviour[key];
    requests.length = 0;
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = null;
    client?.clear();
    env.window.document.body.innerHTML = '';
  });

  const mount = async (Page: unknown) => {
    client = new QueryClient();
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(TooltipProvider, null, React.createElement(Page as never)))));
    await act(async () => { await sleep(30); });
  };
  const text = () => env.window.document.body.textContent as string;
  const has = (selector: string) => env.window.document.querySelector(selector) !== null;
  const button = (label: string) =>
    [...env.window.document.querySelectorAll('button')].find((b: HTMLElement) => b.textContent?.trim() === label) as HTMLElement | undefined;
  const refreshAll = async () => { await act(async () => { await client.refetchQueries({ queryKey: ['fittrack-data'] }); }); };
  const press = async (label: string) => {
    const b = button(label);
    expect(b).toBeDefined();
    await act(async () => { click(env.window, b!); await sleep(30); });
  };

  const trackers = [
    { name: 'Weight', Page: () => Weight, table: 'fittrack_weight', row: weightRow, emptyTitle: 'No weight entries yet', emptyHint: 'Log your first weigh-in above.', noun: 'weight entries', rowText: '81.5 kg' },
    { name: 'Waist', Page: () => Waist, table: 'fittrack_waist', row: waistRow, emptyTitle: 'No waist entries yet', emptyHint: 'Log your first measurement above.', noun: 'waist entries', rowText: '90 cm' },
    { name: 'Sleep', Page: () => Sleep, table: 'fittrack_sleep', row: sleepRow, emptyTitle: 'No sleep entries yet', emptyHint: 'Log your first night above.', noun: 'sleep entries', rowText: '7.5 hours' },
  ];

  for (const t of trackers) {
    describe(t.name, () => {
      test('first load in flight: skeleton, no empty copy', async () => {
        behaviour[t.table] = () => 'pending';
        await mount(t.Page());
        expect(text()).not.toContain(t.emptyTitle);
        expect(text()).not.toContain(t.emptyHint);
        expect(text()).not.toContain('No entries match');
        expect(has('[role="status"]')).toBe(true);
        expect(has('[role="alert"]')).toBe(false);
      });

      test('first load failed: persistent error, never "no entries"; retry recovers', async () => {
        behaviour[t.table] = fail;
        await mount(t.Page());
        expect(text()).toContain(`We couldn't load your ${t.noun}`);
        expect(has('[role="alert"]')).toBe(true);
        expect(text()).not.toContain(t.emptyTitle);
        expect(text()).not.toContain(t.emptyHint);
        const before = requests.length;
        // Still failing: the error stays (nothing silently turns into an empty list).
        await press('Try again');
        expect(requests.length).toBeGreaterThan(before);
        expect(text()).toContain(`We couldn't load your ${t.noun}`);
        expect(text()).not.toContain(t.emptyTitle);
        // Server is back: the same button loads the rows.
        behaviour[t.table] = ok([t.row]);
        await press('Try again');
        expect(text()).toContain(t.rowText);
        expect(has('[role="alert"]')).toBe(false);
        expect(text()).not.toContain(`We couldn't load your ${t.noun}`);
      });

      test('failed refresh keeps the last rows and shows a stale notice with a working retry', async () => {
        behaviour[t.table] = ok([t.row]);
        await mount(t.Page());
        expect(text()).toContain(t.rowText);
        behaviour[t.table] = fail;
        await refreshAll();
        expect(text()).toContain(t.rowText);
        expect(text()).toContain(`Couldn't refresh your ${t.noun}`);
        expect(text()).not.toContain(t.emptyTitle);
        expect(text()).not.toContain(`We couldn't load your ${t.noun}`);
        behaviour[t.table] = ok([t.row]);
        await press('Try again');
        expect(text()).toContain(t.rowText);
        expect(text()).not.toContain(`Couldn't refresh your ${t.noun}`);
      });

      test('a successful empty table still says so', async () => {
        behaviour[t.table] = ok([]);
        await mount(t.Page());
        expect(text()).toContain(t.emptyTitle);
        expect(text()).toContain(t.emptyHint);
        expect(has('[role="alert"]')).toBe(false);
        expect(text()).not.toContain("Couldn't");
      });
    });
  }

  describe('Reports', () => {
    const allOk = () => {
      behaviour.fittrack_meals = ok([]);
      behaviour.fittrack_gym_sessions = ok([]);
      behaviour.fittrack_weight = ok([weightRow]);
      behaviour.fittrack_waist = ok([waistRow]);
      behaviour.fittrack_sleep = ok([sleepRow]);
      behaviour.fittrack_whoop = ok([]);
    };
    const tables = () => Object.keys(behaviour);

    test('everything loading: skeletons, no zeros, no sections', async () => {
      for (const k of ['fittrack_meals', 'fittrack_gym_sessions', 'fittrack_weight', 'fittrack_waist', 'fittrack_sleep', 'fittrack_whoop']) behaviour[k] = () => 'pending';
      await mount(Reports);
      expect(text()).not.toContain('0h');
      expect(text()).not.toContain('paused');
      expect(has('[data-testid="report-charts"]')).toBe(false);
      expect(has('[data-testid="summary"]')).toBe(false);
    });

    test('one table failed: partial warning, only dependent sections blocked, retry recovers', async () => {
      allOk();
      behaviour.fittrack_sleep = fail;
      await mount(Reports);
      expect(tables().length).toBe(6);
      expect(text()).toContain("Couldn't load your sleep.");
      // Sleep numbers are unknown, not zero.
      expect(text()).not.toContain('0h');
      expect(text()).toContain("Couldn't load");
      // Parts that need sleep are paused; the weight-only and weight+waist parts are not.
      expect(text()).toContain('Report charts are paused');
      expect(text()).toContain('Your progress summary is paused');
      expect(text()).toContain('This week at a glance is paused');
      expect(has('[data-testid="report-charts"]')).toBe(false);
      expect(has('[data-testid="summary"]')).toBe(false);
      expect(has('[data-testid="recomp"]')).toBe(true);
      // Retry reloads only what failed.
      const before = requests.length;
      behaviour.fittrack_sleep = ok([sleepRow]);
      await press('Try again');
      expect(requests.slice(before)).toEqual(['fittrack_sleep']);
      expect(text()).not.toContain('paused');
      expect(has('[data-testid="report-charts"]')).toBe(true);
      expect(has('[data-testid="summary"]')).toBe(true);
      expect(has('[role="alert"]')).toBe(false);
    });

    test('failed refresh keeps every section on screen and warns', async () => {
      allOk();
      await mount(Reports);
      expect(has('[data-testid="report-charts"]')).toBe(true);
      behaviour.fittrack_sleep = fail;
      await refreshAll();
      expect(has('[data-testid="report-charts"]')).toBe(true);
      expect(has('[data-testid="summary"]')).toBe(true);
      expect(text()).toContain("Couldn't refresh your sleep.");
      expect(text()).not.toContain('paused');
      behaviour.fittrack_sleep = ok([sleepRow]);
      await press('Try again');
      expect(text()).not.toContain("Couldn't refresh");
    });

    test('all loaded: no notice, every section drawn', async () => {
      allOk();
      await mount(Reports);
      expect(text()).not.toContain("Couldn't");
      expect(text()).not.toContain('paused');
      for (const id of ['report-charts', 'digest', 'recomp', 'summary']) expect(has(`[data-testid="${id}"]`)).toBe(true);
    });
  });
});
