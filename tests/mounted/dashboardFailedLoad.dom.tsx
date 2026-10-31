import { describe, test, expect, mock, beforeAll, afterAll, afterEach, beforeEach } from 'bun:test';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// The Dashboard, mounted on the REAL shared-table hooks with a scripted backend.
// The point: a table that never loaded must never become zero calories, "No meals logged today", a default
// target, a reminder, a chart or a cross-metric claim; rows kept after a failed refresh stay on screen with a
// notice; a true empty table still says so; Try again recovers.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/dashboardFailedLoad.dom.tsx
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
stub('YesterdayStatus', 'yesterday', (p) => `yesterday ${String(p.yesterdayCalories)} cal`);
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

const today = new Date().toISOString().split('T')[0];
const ok = (rows: unknown[]) => () => ({ data: rows });
const fail = () => ({ error: { message: 'Failed to fetch' } });
const pending = () => 'pending' as const;
const TABLES = ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'whoop_data', 'extra_activities', 'daily_notes'].map((t) => `fittrack_${t}`);
const mealRow = { id: 'm1', food: 'Oats', calories: 300, protein: 10, carbs: 40, time: '08:00', date: today };
const weightRow = { id: 'w1', weight: '81.5', date: today, notes: null };

describe('Dashboard: failed first loads are never zeros, empties, targets, reminders or claims', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, QueryClient: any, QueryClientProvider: any, TooltipProvider: any, MemoryRouter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Dashboard: any, GlobalRefreshContext: any, createGlobalRefresh: any, globalRefresh: any, root: any, client: any;
  const consoleError = console.error;

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
  afterAll(() => { console.error = consoleError; env?.window.close(); });
  beforeEach(() => {
    for (const key of Object.keys(behaviour)) delete behaviour[key];
    for (const t of TABLES) behaviour[t] = ok([]);
    requests.length = 0;
    nonShared.settingsError = null;
    nonShared.personalError = null;
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = null;
    client?.clear();
    env.window.document.body.innerHTML = '';
  });

  const mount = async () => {
    client = new QueryClient();
    globalRefresh = createGlobalRefresh(() => client);
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(
      React.createElement(QueryClientProvider, { client },
        React.createElement(GlobalRefreshContext.Provider, { value: globalRefresh },
          React.createElement(TooltipProvider, null,
            React.createElement(MemoryRouter, null, React.createElement(Dashboard))))),
    ));
    await act(async () => { await sleep(40); });
  };
  const text = () => env.window.document.body.textContent as string;
  const has = (testid: string) => env.window.document.querySelector(`[data-testid="${testid}"]`) !== null;
  // The four reminder tiles are the only links to these pages ("Log a meal" is a different link).
  const links = () => [...env.window.document.querySelectorAll('a')].map((a: HTMLAnchorElement) => a.getAttribute('href')).filter((h) => h !== '/meals');
  const refreshAll = async () => { await act(async () => { await globalRefresh.run(); }); };
  const retryButton = () =>
    [...env.window.document.querySelectorAll('[role="alert"] button, [role="status"] button')]
      .find((b: HTMLElement) => b.textContent?.trim() === 'Try again') as HTMLElement | undefined;
  const pressRetry = async () => {
    const b = retryButton();
    expect(b).toBeDefined();
    await act(async () => { click(env.window, b!); await sleep(40); });
  };

  const claimsText = ['No meals logged today', 'Rest day', 'Today is a workout day', 'Get moving', 'Measure your weight today', 'Measure your waist today',
    'Not synced yet today', 'Next measurement in', 'You did workout today', 'On track'];
  const noClaims = () => { for (const c of claimsText) expect(text()).not.toContain(c); };
  const claimBlocks = ['calorie-goal', 'protein-target', 'carb-target', 'yesterday', 'meal-timing', 'recovery-chart', 'macro-chart', 'workout-chart', 'balance-chart', 'weight-chart', 'waist-chart', 'sleep-chart', 'insights-card'];

  test('everything still loading: skeletons only, no claims, no tiles as links, no alerts', async () => {
    for (const t of TABLES) behaviour[t] = pending;
    await mount();
    noClaims();
    for (const id of claimBlocks) expect(has(id)).toBe(false);
    expect(links()).toEqual([]);
    expect(text()).not.toContain('Reminder paused');
    expect(text()).not.toContain('paused');
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();
  });

  test('everything loaded and truly empty: the real empty state and the real (zero) numbers appear', async () => {
    await mount();
    expect(text()).toContain('No meals logged today');
    expect(text()).toContain('calorie-goal 0 cal');
    for (const id of claimBlocks) expect(has(id)).toBe(true);
    expect(text()).not.toContain('paused');
    expect(text()).not.toContain("Couldn't");
    expect(links().length).toBe(4);
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();
  });

  test('meals never loaded: no "no meals", no zero calories, no targets or claims built from meals; recovers with Try again', async () => {
    behaviour.fittrack_meals = fail;
    await mount();
    expect(text()).not.toContain('No meals logged today');
    expect(text()).toContain("Today's meals are unavailable");
    expect(text()).toContain("Couldn't load your meals");
    for (const id of ['calorie-goal', 'protein-target', 'carb-target', 'yesterday', 'meal-timing', 'macro-chart', 'balance-chart', 'insights-card']) {
      expect(has(id)).toBe(false);
    }
    expect(text()).not.toMatch(/\b0 cal\b/);
    // Blocks that do not need meals are unaffected.
    for (const id of ['recovery-chart', 'workout-chart', 'weight-chart', 'waist-chart', 'sleep-chart']) expect(has(id)).toBe(true);
    // The reminder tiles do not read meals, so they still work.
    expect(links().length).toBe(4);

    const before = requests.length;
    await pressRetry();
    expect(requests.length).toBeGreaterThan(before);
    expect(text()).toContain("Today's meals are unavailable"); // still failing: stays honest
    behaviour.fittrack_meals = ok([mealRow]);
    await pressRetry();
    expect(text()).toContain('Oats');
    expect(has('calorie-goal')).toBe(true);
    expect(text()).not.toContain("Today's meals are unavailable");
    expect(text()).not.toContain("Couldn't load your meals");
  });

  test('workouts never loaded: the workout reminder pauses (never "Rest day"), calorie targets and cross-metric claims pause', async () => {
    behaviour.fittrack_gym_sessions = fail;
    await mount();
    expect(text()).toContain('Reminder paused');
    expect(text()).toContain("Couldn't load your workouts");
    for (const c of ['Rest day', 'Today is a workout day', 'Get moving', 'You did workout today', 'You missed a workout day']) expect(text()).not.toContain(c);
    expect(links()).not.toContain('/gym');
    for (const id of ['calorie-goal', 'yesterday', 'macro-chart', 'workout-chart', 'insights-card']) expect(has(id)).toBe(false);
    // Weight / waist / WHOOP tiles do not need workouts.
    expect(links().sort()).toEqual(['/waist', '/weight', '/whoop-data']);
    expect(has('weight-chart')).toBe(true);
  });

  test('weight never loaded: weight reminder, protein/carb targets, weight chart and insights pause', async () => {
    behaviour.fittrack_weight = fail;
    await mount();
    expect(links()).not.toContain('/weight');
    expect(text()).toContain("Couldn't load your weight entries");
    for (const id of ['protein-target', 'carb-target', 'weight-chart', 'macro-chart', 'insights-card']) expect(has(id)).toBe(false);
    expect(has('calorie-goal')).toBe(true); // calories do not need weight
    expect(text()).not.toContain('Measure your weight today');
    expect(text()).not.toContain('Next measurement in 3 days');
  });

  test('WHOOP never loaded: WHOOP tile, recovery, calorie balance, sleep chart and insights pause; the workout tile keeps working without a recovery line', async () => {
    behaviour.fittrack_whoop_data = fail;
    await mount();
    expect(links()).not.toContain('/whoop-data');
    expect(text()).not.toContain('Not synced yet today');
    for (const id of ['recovery-chart', 'balance-chart', 'sleep-chart', 'insights-card']) expect(has(id)).toBe(false);
    expect(links()).toContain('/gym');
  });

  test('daily notes never loaded: the three charts that mark notes pause, nothing else does', async () => {
    behaviour.fittrack_daily_notes = fail;
    await mount();
    for (const id of ['weight-chart', 'waist-chart', 'sleep-chart']) expect(has(id)).toBe(false);
    for (const id of ['calorie-goal', 'protein-target', 'workout-chart', 'balance-chart', 'insights-card']) expect(has(id)).toBe(true);
  });

  test('settings (not a shared table) that report a failure pause the targets and reminders built on defaults', async () => {
    nonShared.settingsError = new Error('settings failed');
    await mount();
    expect(text()).toContain("Couldn't load your settings");
    for (const id of ['calorie-goal', 'yesterday', 'macro-chart', 'interval-setting']) expect(has(id)).toBe(false);
    expect(links()).not.toContain('/weight');
    expect(links()).not.toContain('/waist');
    expect(text()).not.toContain('Next measurement in');
  });

  test('a failed refresh keeps every block and the last rows on screen, with a stale notice that retries', async () => {
    behaviour.fittrack_meals = ok([mealRow]);
    behaviour.fittrack_weight = ok([weightRow]);
    await mount();
    expect(text()).toContain('Oats');
    expect(text()).toContain('calorie-goal 300 cal');
    behaviour.fittrack_meals = fail;
    behaviour.fittrack_weight = fail;
    await refreshAll();
    // Last good data is still there ...
    expect(text()).toContain('Oats');
    expect(text()).toContain('calorie-goal 300 cal');
    for (const id of claimBlocks) expect(has(id)).toBe(true);
    // ... and says it may be out of date, without calling it a failed load.
    expect(text()).toContain("Couldn't refresh your meals and weight");
    expect(text()).not.toContain('unavailable');
    expect(text()).not.toContain('paused');
    expect(text()).not.toContain("Couldn't load your");
    behaviour.fittrack_meals = ok([mealRow]);
    behaviour.fittrack_weight = ok([weightRow]);
    await pressRetry();
    expect(text()).not.toContain("Couldn't refresh");
    expect(text()).toContain('Oats');
  });
});
