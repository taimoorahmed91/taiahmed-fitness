import { describe, test, expect, mock, beforeAll, afterAll, afterEach, beforeEach, setSystemTime } from 'bun:test';
import { installDom, loadJsdom, sleep } from './support/domHarness';

// The real Dashboard at the daylight-saving edges: yesterday's calories, goal and label must all come from the
// same UTC day (and that day is handed to YesterdayStatus explicitly). Scripted backend, stand-in children.
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Answer = { data?: unknown; error?: unknown } | 'pending';
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
mock.module('@/hooks/useDailySummary', () => ({ useDailySummary: () => ({ refetch: async () => {} }) }));

// Settings and personal targets are not shared tables. The scripted view lets a test make one of them report a failure.
const nonShared = { settingsError: null as unknown, personalError: null as unknown };
const personal = {
  target_weight_kg: null, protein_multiplier: 1.6, protein_multiplier_max: 2, carb_multiplier: 3, carb_multiplier_max: 4,
  workout_days: [0, 1, 2, 3, 4, 5, 6], workout_day_templates: {}, gym_day_calorie_target: 2500, gym_day_calorie_target_max: 2800,
  rest_day_calorie_target: 2000, rest_day_calorie_target_max: 2200,
};
mock.module('@/hooks/usePersonalData', () => ({
  usePersonalData: () => ({ data: personal, loading: false, error: nonShared.personalError, refetch: async () => {} }),
}));
mock.module('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({
    settings: { daily_calorie_goal: 2000, weight_measurement_interval: 3, waist_measurement_interval: 7 },
    loading: false,
    error: nonShared.settingsError,
    updateWeightInterval: async () => {},
    updateWaistInterval: async () => {},
    refetch: async () => {},
  }),
}));

// Heavy children are stand-ins that only say what they were handed. They are computed from zeros on purpose:
// a page that drew one for a table that never loaded would show "0 cal" or a chart, which the tests forbid.
const stub = (name: string, testid: string, extra?: (p: Record<string, unknown>) => string) => {
  mock.module(`@/components/${name}`, () => ({ [name]: (p: Record<string, unknown>) => <div data-testid={testid}>{extra?.(p) ?? testid}</div> }));
};
stub('CalorieGoalProgress', 'calorie-goal', (p) => `calorie-goal ${String(p.current)} cal`);
stub('ProteinTargetCard', 'protein-target');
stub('CarbTargetCard', 'carb-target');
stub('YesterdayStatus', 'yesterday', (p) => `yesterday ${String(p.yesterdayCalories)} cal on ${String(p.date)}`);
stub('MealTimeChart', 'meal-timing');
stub('RecoveryChart', 'recovery-chart');
stub('MacroTargetChart', 'macro-chart', (p) => `macro-chart ${String(p.title)}`);
stub('WorkoutDurationChart', 'workout-chart');
stub('CalorieBalanceChart', 'balance-chart');
stub('WeightChart', 'weight-chart');
stub('WaistChart', 'waist-chart');
stub('SleepChart', 'sleep-chart');
stub('GoalsCard', 'goals-card');
stub('CrossMetricSummaryCard', 'insights-card');
stub('WeightIntervalSetting', 'interval-setting');

const TABLES = ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'whoop_data', 'extra_activities', 'daily_notes'].map((t) => `fittrack_${t}`);
const meal = (id: string, date: string, calories: number) => ({ id, food: 'Oats', calories, protein: 10, carbs: 40, time: '08:00', date });

describe('Dashboard: yesterday data and label share one UTC day', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, QueryClient: any, QueryClientProvider: any, TooltipProvider: any, MemoryRouter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Dashboard: any, GlobalRefreshContext: any, createGlobalRefresh: any, root: any, client: any;
  const consoleError = console.error;
  const originalTz = process.env.TZ;

  beforeAll(async () => {
    env = installDom(JSDOM);
    console.error = () => {};
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
    ({ GlobalRefreshContext } = await import('../../src/app/globalRefreshContext'));
    ({ createGlobalRefresh } = await import('../../src/app/globalRefresh'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    ({ MemoryRouter } = await import('react-router-dom'));
    act = React.act;
    Dashboard = (await import('../../src/pages/Dashboard')).default;
  });
  afterAll(() => {
    console.error = consoleError;
    env?.window.close();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });
  beforeEach(() => {
    for (const key of Object.keys(behaviour)) delete behaviour[key];
    for (const t of TABLES) behaviour[t] = () => ({ data: [] });
    requests.length = 0;
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = null;
    client?.clear();
    env.window.document.body.innerHTML = '';
    setSystemTime();
  });

  const mountAt = async (tz: string, nowIso: string, meals: unknown[]) => {
    process.env.TZ = tz;
    setSystemTime(new Date(nowIso));
    behaviour.fittrack_meals = () => ({ data: meals });
    client = new QueryClient();
    const globalRefresh = createGlobalRefresh(() => client);
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(
      React.createElement(QueryClientProvider, { client },
        React.createElement(GlobalRefreshContext.Provider, { value: globalRefresh },
          React.createElement(TooltipProvider, null,
            React.createElement(MemoryRouter, null, React.createElement(Dashboard))))),
    ));
    await act(async () => { await sleep(60); });
    return (env.window.document.querySelector('[data-testid="yesterday"]')?.textContent ?? '') as string;
  };

  test('Europe/Warsaw at 2026-10-26T00:30Z (after the fallback): Oct 25 totals, Oct 25 label', async () => {
    const out = await mountAt('Europe/Warsaw', '2026-10-26T00:30:00Z', [meal('a', '2026-10-25', 640), meal('b', '2026-10-24', 999)]);
    expect(out).toBe('yesterday 640 cal on 2026-10-25');
  });

  test('America/New_York at 2026-11-02T00:30Z (after the US fallback): Nov 1 totals, Nov 1 label', async () => {
    const out = await mountAt('America/New_York', '2026-11-02T00:30:00Z', [meal('a', '2026-11-01', 480), meal('b', '2026-10-31', 999)]);
    expect(out).toBe('yesterday 480 cal on 2026-11-01');
  });
});
