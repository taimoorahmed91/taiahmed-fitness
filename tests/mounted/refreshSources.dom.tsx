import { describe, test, expect, mock, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { installDom, loadJsdom, sleep } from './support/domHarness';

// The five hook-owned sources (templates, settings, goals, daily summary, personal data), mounted under a real
// shell refresh owner with a scripted fake backend. Proves each registers exactly one task, header refresh and
// demo regeneration reload them, failures are counted truthfully, unmounting unregisters, and hooks still work
// with no shell around them.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/refreshSources.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Answer = { data?: unknown; error?: unknown };
const SETTINGS_ROW = { daily_calorie_goal: 2400, weight_measurement_interval: 3, waist_measurement_interval: 7, set_rest_seconds: 60, exercise_rest_seconds: 90 };
const TEMPLATE_ROW = { id: 't1', name: 'Push', exercises: ['Bench'], created_at: '2026-01-01', updated_at: '2026-01-01' };
const defaults = (): Record<string, () => Answer> => ({
  fittrack_workout_templates: () => ({ data: [TEMPLATE_ROW] }),
  fittrack_user_settings: () => ({ data: SETTINGS_ROW }),
  fittrack_goals: () => ({ data: [] }),
  fittrack_personal_data: () => ({ data: { id: 'p1', full_name: 'Ada', dob: null, age: 30, gender: 'F', height_cm: 170, target_weight_kg: 60 } }),
  get_or_create_daily_summary: () => ({ data: { id: 's1', user_id: 'user-a', date: '2026-01-01', calories_consumed: 0, calories_remaining: 2000, calorie_goal: 2000, workout_status: 'none' } }),
});
let answers = defaults();
const calls: Record<string, number> = {};
const chainFor = (name: string): unknown => {
  calls[name] = (calls[name] ?? 0) + 1;
  const chain: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const a = (answers[name] ?? (() => ({ data: [] })))();
        return (resolve: (v: Answer) => unknown) => resolve({ data: a.data ?? null, error: a.error ?? null });
      }
      return () => chain;
    },
  });
  return chain;
};
mock.module('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => chainFor(t), rpc: (fn: string) => chainFor(fn), auth: {} } }));
mock.module('@/lib/authSession', () => ({
  getSessionUser: async () => ({ id: 'user-a' }),
  onAuthIdentityChange: () => ({ unsubscribe() {} }),
}));
mock.module('@/hooks/useActivityLog', () => ({ logActivity: () => {} }));
const USER = { id: 'user-a', user_metadata: {} };
mock.module('@/contexts/UserContext', () => ({ useUser: () => ({ user: USER }) }));

const REFUSED = { code: '42501', message: 'permission denied' };
const OFFLINE = { message: 'Failed to fetch' };

describe('hook-owned refresh sources', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, QueryClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hooks: any, ctx: any, gr: any, cache: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let root: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: { current: any } = { current: null };
  let renders = 0;
  let registered = 0;
  let unregistered = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let refresh: any;

  beforeAll(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    ({ QueryClient } = await import('@tanstack/react-query'));
    act = React.act;
    gr = await import('../../src/app/globalRefresh');
    ctx = await import('../../src/app/globalRefreshContext');
    cache = await import('../../src/lib/workoutOfflineCache');
    hooks = {
      templates: (await import('../../src/hooks/useWorkoutTemplates')).useWorkoutTemplates,
      settings: (await import('../../src/hooks/useUserSettings')).useUserSettings,
      goals: (await import('../../src/hooks/useGoals')).useGoals,
      summary: (await import('../../src/hooks/useDailySummary')).useDailySummary,
      personal: (await import('../../src/hooks/usePersonalData')).usePersonalData,
    };
  });
  afterAll(() => env?.window.close());
  beforeEach(() => {
    answers = defaults();
    for (const k of Object.keys(calls)) delete calls[k];
    env.window.localStorage.clear();
    renders = 0; registered = 0; unregistered = 0;
    const real = gr.createGlobalRefresh(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    refresh = { ...real, registerTask: (task: unknown) => { registered++; const off = real.registerTask(task); return () => { unregistered++; off(); }; } };
  });
  afterEach(async () => { if (root) { await act(async () => root.unmount()); root = null; } });

  const Probe = () => {
    renders++;
    h.current = {
      templates: hooks.templates(), settings: hooks.settings(), goals: hooks.goals(), summary: hooks.summary(), personal: hooks.personal(),
    };
    return null;
  };
  const mount = async (shell: boolean) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    const tree = shell
      ? React.createElement(ctx.GlobalRefreshContext.Provider, { value: refresh }, React.createElement(Probe))
      : React.createElement(Probe);
    await act(async () => root.render(tree));
    await act(async () => { await sleep(30); });
  };
  const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
    let out!: T;
    await act(async () => { out = await fn(); });
    return out;
  };

  test('under the shell: five registrations, no re-registration, no render loop', async () => {
    await mount(true);
    expect(registered).toBe(5);
    expect(refresh.hasWork()).toBe(true);
    const settled = renders;
    await act(async () => { await sleep(60); });
    expect(renders).toBe(settled); // nothing keeps re-rendering
    expect(registered).toBe(5); // and nothing re-registered
    expect(unregistered).toBe(0);
    for (const k of ['templates', 'settings', 'goals', 'summary', 'personal']) {
      expect(h.current[k].phase).toBe('ready');
      expect(h.current[k].loadFailed).toBe(false);
      expect(h.current[k].refreshFailed).toBe(false);
    }
    expect(h.current.settings.settings.daily_calorie_goal).toBe(2400);
  });

  test('header refresh and demo regeneration reload templates, settings, goals, personal data and summary', async () => {
    await mount(true);
    const before = { ...calls };
    const manual = await run(() => refresh.run());
    expect(manual.outcome).toBe('success');
    expect(manual.total).toBe(5);
    const demo = await run(() => refresh.run({ invalidate: true }));
    expect(demo.outcome).toBe('success');
    expect(demo.total).toBe(5);
    for (const table of ['fittrack_workout_templates', 'fittrack_user_settings', 'fittrack_goals', 'fittrack_personal_data', 'get_or_create_daily_summary']) {
      expect(calls[table]).toBe((before[table] ?? 0) + 2);
    }
  });

  test('failures are counted truthfully and keep the last good rows (refreshFailed)', async () => {
    await mount(true);
    answers.fittrack_goals = () => ({ error: REFUSED });
    answers.fittrack_user_settings = () => ({ error: REFUSED });
    const result = await run(() => refresh.run());
    expect(result.outcome).toBe('partial');
    expect(result.failed).toBe(2);
    expect(result.total).toBe(5);
    expect(h.current.goals.refreshFailed).toBe(true);
    expect(h.current.goals.phase).toBe('ready');
    expect(h.current.settings.refreshFailed).toBe(true);
    expect(h.current.settings.settings.daily_calorie_goal).toBe(2400); // last good value kept
    expect(h.current.templates.refreshFailed).toBe(false);

    // A later good refresh clears the flag.
    answers = defaults();
    const ok = await run(() => refresh.run());
    expect(ok.outcome).toBe('success');
    expect(h.current.goals.refreshFailed).toBe(false);
    expect(h.current.settings.error).toBe(null);
  });

  test('a first load that fails is an error, not an empty list', async () => {
    answers.fittrack_goals = () => ({ error: REFUSED });
    answers.fittrack_personal_data = () => ({ error: REFUSED });
    answers.get_or_create_daily_summary = () => ({ error: REFUSED });
    await mount(true);
    expect(h.current.goals.phase).toBe('error');
    expect(h.current.goals.loadFailed).toBe(true);
    expect(h.current.personal.loadFailed).toBe(true);
    expect(h.current.summary.loadFailed).toBe(true);
    expect(h.current.goals.loading).toBe(false);
    const result = await run(() => refresh.run());
    expect(result.failed).toBe(3);
  });

  test('unmounting unregisters every task', async () => {
    await mount(true);
    expect(refresh.hasWork()).toBe(true);
    await act(async () => root.unmount());
    root = null;
    expect(unregistered).toBe(5);
    expect(refresh.hasWork()).toBe(false);
    expect((await refresh.run()).outcome).toBe('nothing-to-refresh');
  });

  test('outside the shell the hooks still load and refetch on their own', async () => {
    await mount(false);
    expect(registered).toBe(0);
    for (const k of ['templates', 'settings', 'goals', 'summary', 'personal']) expect(h.current[k].phase).toBe('ready');
    const before = calls.fittrack_user_settings;
    await run(() => h.current.settings.refetch());
    expect(calls.fittrack_user_settings).toBe(before + 1);
    answers.fittrack_user_settings = () => ({ error: REFUSED });
    await run(() => h.current.settings.refetch()); // public refetch never throws
    expect(h.current.settings.refreshFailed).toBe(true);
  });

  describe('workout templates: offline copy versus real failures', () => {
    const seedCache = () => cache.writeTemplatesCache('user-a', [TEMPLATE_ROW]);

    test('server unreachable with a saved copy: shown as cached and stale, never first-load empty', async () => {
      seedCache();
      answers.fittrack_workout_templates = () => ({ error: OFFLINE });
      await mount(true);
      const t = h.current.templates;
      expect(t.templates.map((x: { id: string }) => x.id)).toEqual(['t1']);
      expect(t.isCached).toBe(true);
      expect(t.phase).toBe('ready');
      expect(t.loadFailed).toBe(false);
      expect(t.refreshFailed).toBe(true);
      expect(t.error).toEqual(OFFLINE);
      // And the global batch says so.
      const result = await run(() => refresh.run());
      expect(result.failed).toBe(1);
      expect(result.outcome).toBe('partial');
    });

    test('a real server refusal is an error and the saved copy does not hide it', async () => {
      seedCache();
      answers.fittrack_workout_templates = () => ({ error: REFUSED });
      await mount(true);
      const t = h.current.templates;
      expect(t.phase).toBe('error');
      expect(t.loadFailed).toBe(true);
      expect(t.refreshFailed).toBe(false);
      expect(t.isCached).toBe(false);
      expect(t.templates).toEqual([]);
      expect(t.error).toEqual(REFUSED);
      expect(t.loading).toBe(false);
    });

    test('server unreachable and no saved copy is an error', async () => {
      answers.fittrack_workout_templates = () => ({ error: OFFLINE });
      await mount(true);
      expect(h.current.templates.phase).toBe('error');
      expect(h.current.templates.loadFailed).toBe(true);
    });

    test('a refusal after a good server list keeps that list, flagged stale', async () => {
      await mount(true);
      expect(h.current.templates.phase).toBe('ready');
      answers.fittrack_workout_templates = () => ({ error: REFUSED });
      await run(() => h.current.templates.refetch()); // public refetch never throws
      const t = h.current.templates;
      expect(t.templates).toHaveLength(1);
      expect(t.phase).toBe('ready');
      expect(t.refreshFailed).toBe(true);
      expect(t.isCached).toBe(false);
    });

    test('recovers: a good answer clears cached and failure flags', async () => {
      seedCache();
      answers.fittrack_workout_templates = () => ({ error: OFFLINE });
      await mount(true);
      expect(h.current.templates.isCached).toBe(true);
      answers = defaults();
      const result = await run(() => refresh.run());
      expect(result.outcome).toBe('success');
      expect(h.current.templates.isCached).toBe(false);
      expect(h.current.templates.refreshFailed).toBe(false);
    });
  });
});
