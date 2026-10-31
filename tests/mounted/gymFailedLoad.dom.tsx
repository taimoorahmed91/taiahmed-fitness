import { describe, test, expect, mock, beforeAll, afterAll, afterEach, beforeEach } from 'bun:test';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// The Gym page, mounted on the REAL gym_sessions shared-table hook with a scripted backend, and on a scripted
// templates hook that exposes the explicit loading / error / loadFailed / refreshFailed fields.
// The point: a failed first load is never "No workouts yet" or "No templates yet", a failed refresh keeps the rows,
// Try again recovers, the URL tab is kept, and a paused workout is still resumed whatever the history did.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/gymFailedLoad.dom.tsx
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
mock.module('@/hooks/usePersonalData', () => ({ usePersonalData: () => ({ data: { workout_days: [], workout_day_templates: {} }, loading: false }) }));
mock.module('@/hooks/useWhoopData', () => ({ useWhoopData: () => ({ entries: [], loading: false }) }));

// The templates hook is scripted: tests set `tpl` and count `tplRefetches`.
const tpl = {
  templates: [] as { id: string; name: string; exercises: string[] }[],
  loading: false,
  error: null as unknown,
  loadFailed: false,
  refreshFailed: false,
};
let tplRefetches = 0;
mock.module('@/hooks/useWorkoutTemplates', () => ({
  useWorkoutTemplates: () => ({
    ...tpl,
    isCached: false,
    cachedAt: null,
    getCachedLastSession: () => null,
    addTemplate: async () => true,
    updateTemplate: async () => true,
    deleteTemplate: async () => true,
    refetch: async () => { tplRefetches++; },
  }),
}));

// Heavy children say what they were handed. Their empty copy is exactly what a failed load must never produce.
mock.module('@/components/GymForm', () => ({ GymForm: () => <div data-testid="gym-form">start a workout</div> }));
mock.module('@/components/GymList', () => ({
  GymList: ({ sessions }: { sessions: unknown[] }) => <div data-testid="gym-list">{sessions.length === 0 ? 'No workouts yet' : `${sessions.length} workouts listed`}</div>,
}));
mock.module('@/components/GymOverviewCard', () => ({
  GymOverviewCard: ({ sessions }: { sessions: unknown[] }) => <div data-testid="gym-overview">All time: {sessions.length} workouts</div>,
}));
mock.module('@/components/DataFilter', () => ({ DataFilter: () => <div data-testid="data-filter" /> }));
mock.module('@/components/WorkoutTemplateList', () => ({
  WorkoutTemplateList: ({ templates }: { templates: { id: string; name: string }[] }) => (
    <div data-testid="template-list">{templates.length === 0 ? 'No templates yet' : templates.map((t) => t.name).join(', ')}</div>
  ),
}));
mock.module('@/components/PersonalRecordsList', () => ({ PersonalRecordsList: () => <div data-testid="records-list">records</div> }));
mock.module('@/components/ActiveWorkoutModal', () => ({
  ActiveWorkoutModal: ({ template, open }: { template: { name: string } | null; open: boolean }) => (open ? <div data-testid="active-workout">{template?.name}</div> : null),
}));
mock.module('@/components/EditTemplateModal', () => ({ EditTemplateModal: () => null }));
mock.module('@/components/EditWorkoutSessionModal', () => ({ EditWorkoutSessionModal: () => null }));

const ok = (rows: unknown[]) => () => ({ data: rows });
const fail = () => ({ error: { message: 'Failed to fetch' } });
const pending = () => 'pending' as const;
const sessionRow = { id: 's1', exercise: 'Push', duration: 45, date: '2026-10-01', notes: null, start_time: null, end_time: null };
const template = { id: 't1', name: 'Push day', exercises: ['Bench'] };

describe('Gym: failed first loads are never "no workouts" or "no templates"', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, QueryClient: any, QueryClientProvider: any, TooltipProvider: any, MemoryRouter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Gym: any, root: any, client: any, workoutDraft: any;
  const consoleError = console.error;

  beforeAll(async () => {
    env = installDom(JSDOM);
    console.error = () => {};
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    ({ MemoryRouter } = await import('react-router-dom'));
    act = React.act;
    workoutDraft = await import('../../src/lib/workoutDraft');
    Gym = (await import('../../src/pages/Gym')).default;
  });
  afterAll(() => { console.error = consoleError; env?.window.close(); });
  beforeEach(() => {
    for (const key of Object.keys(behaviour)) delete behaviour[key];
    behaviour.fittrack_gym_sessions = ok([]);
    requests.length = 0;
    Object.assign(tpl, { templates: [], loading: false, error: null, loadFailed: false, refreshFailed: false });
    tplRefetches = 0;
    env.window.localStorage.clear();
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = null;
    client?.clear();
    env.window.document.body.innerHTML = '';
  });

  const mount = async (url = '/gym') => {
    client = new QueryClient();
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(
      React.createElement(QueryClientProvider, { client },
        React.createElement(TooltipProvider, null,
          React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Gym)))),
    ));
    await act(async () => { await sleep(40); });
  };
  const text = () => env.window.document.body.textContent as string;
  const has = (testid: string) => env.window.document.querySelector(`[data-testid="${testid}"]`) !== null;
  const refreshAll = async () => { await act(async () => { await client.refetchQueries({ queryKey: ['fittrack-data'] }); }); };
  const pressRetry = async () => {
    const b = [...env.window.document.querySelectorAll('[role="alert"] button, [role="status"] button')]
      .find((x: HTMLElement) => x.textContent?.trim() === 'Try again') as HTMLElement | undefined;
    expect(b).toBeDefined();
    await act(async () => { click(env.window, b!); await sleep(40); });
  };
  const selectedTab = () => env.window.document.querySelector('[role="tab"][data-state="active"]')?.textContent;

  test('sessions still loading: placeholders only, no empty copy, no alert', async () => {
    behaviour.fittrack_gym_sessions = pending;
    await mount();
    expect(text()).not.toContain('No workouts yet');
    expect(has('gym-list')).toBe(false);
    expect(has('gym-overview')).toBe(false);
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();
    expect(has('gym-form')).toBe(true); // starting a workout never waits for the history
  });

  test('a true empty history still says so', async () => {
    await mount();
    expect(text()).toContain('No workouts yet');
    expect(has('gym-overview')).toBe(true);
    expect(text()).not.toContain('paused');
    expect(text()).not.toContain("Couldn't");
  });

  test('sessions never loaded: no empty list, no zero overview, paused parts, one working Try again', async () => {
    behaviour.fittrack_gym_sessions = fail;
    tpl.templates = [template];
    await mount();
    expect(text()).not.toContain('No workouts yet');
    expect(text()).not.toContain('All time: 0');
    expect(has('gym-list')).toBe(false);
    expect(has('gym-overview')).toBe(false);
    expect(text()).toContain('Workout history is paused');
    expect(text()).toContain("Couldn't load your workouts");
    expect(has('gym-form')).toBe(true);

    const before = requests.length;
    await pressRetry();
    expect(requests.length).toBeGreaterThan(before);
    expect(has('gym-list')).toBe(false); // still failing: stays honest
    behaviour.fittrack_gym_sessions = ok([sessionRow]);
    await pressRetry();
    expect(text()).toContain('1 workouts listed');
    expect(has('gym-overview')).toBe(true);
    expect(text()).not.toContain("Couldn't load your workouts");
  });

  test('the URL tab is kept while data is paused: templates and records need the history', async () => {
    behaviour.fittrack_gym_sessions = fail;
    tpl.templates = [template];
    await mount('/gym?tab=templates');
    expect(selectedTab()).toContain('Templates');
    expect(has('template-list')).toBe(false);
    expect(text()).toContain('Workout templates are paused');
    expect(text()).not.toContain('No templates yet');
    await act(async () => root.unmount());
    root = null;
    await mount('/gym?tab=records');
    expect(selectedTab()).toContain('Records');
    expect(has('records-list')).toBe(false);
    expect(text()).toContain('Personal records are paused');
  });

  test('templates never loaded (explicit loadFailed): no "No templates yet", retry reloads templates; the Log tab keeps working', async () => {
    Object.assign(tpl, { loadFailed: true, error: new Error('templates failed') });
    await mount('/gym?tab=templates');
    expect(text()).not.toContain('No templates yet');
    expect(has('template-list')).toBe(false);
    expect(text()).toContain('Workout templates are paused');
    expect(text()).toContain("Couldn't load your workout templates");
    expect(text()).not.toContain("Couldn't load your workouts");
    await pressRetry();
    expect(tplRefetches).toBe(1);
    // The Log tab does not wait on templates: history and the start form are there.
    await act(async () => root.unmount());
    root = null;
    await mount('/gym');
    expect(has('gym-list')).toBe(true);
    expect(has('gym-form')).toBe(true);
    expect(text()).toContain('No workouts yet'); // sessions loaded and are truly empty
    expect(text()).toContain("Couldn't load your workout templates");
  });

  test('templates still loading: placeholders, not "No templates yet"', async () => {
    Object.assign(tpl, { loading: true });
    await mount('/gym?tab=templates');
    expect(text()).not.toContain('No templates yet');
    expect(has('template-list')).toBe(false);
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();
  });

  test('a failed templates refresh keeps the template rows and shows a stale notice', async () => {
    Object.assign(tpl, { templates: [template], refreshFailed: true, error: new Error('refresh failed') });
    await mount('/gym?tab=templates');
    expect(text()).toContain('Push day');
    expect(has('template-list')).toBe(true);
    expect(text()).toContain("Couldn't refresh your workout templates");
    expect(text()).not.toContain('paused');
    await pressRetry();
    expect(tplRefetches).toBe(1);
  });

  test('a failed sessions refresh keeps the history and shows a stale notice with a working retry', async () => {
    behaviour.fittrack_gym_sessions = ok([sessionRow]);
    await mount();
    expect(text()).toContain('1 workouts listed');
    behaviour.fittrack_gym_sessions = fail;
    await refreshAll();
    expect(text()).toContain('1 workouts listed');
    expect(has('gym-overview')).toBe(true);
    expect(text()).toContain("Couldn't refresh your workouts");
    expect(text()).not.toContain('paused');
    expect(text()).not.toContain('No workouts yet');
    behaviour.fittrack_gym_sessions = ok([sessionRow]);
    await pressRetry();
    expect(text()).not.toContain("Couldn't refresh");
    expect(text()).toContain('1 workouts listed');
  });

  test('a paused workout is still resumed when the history and templates both failed to load', async () => {
    behaviour.fittrack_gym_sessions = fail;
    Object.assign(tpl, { loadFailed: true, error: new Error('templates failed') });
    const written = workoutDraft.writeDraft(workoutDraft.defaultStorage(), 'user-a', {
      templateId: 'manual-1', templateName: 'Leg day', exercises: ['Squat'], startTime: new Date().toISOString(), expandedExercise: null,
      extraExercises: [], exerciseSets: {}, exerciseTimestamps: {}, exerciseSequence: {}, nextSequence: 1, exerciseNotes: {}, exerciseSetCount: {},
    });
    expect(written.ok).toBe(true);
    await mount();
    expect(has('active-workout')).toBe(true);
    expect(env.window.document.querySelector('[data-testid="active-workout"]')?.textContent).toBe('Leg day');
    // The saved workout was not touched by the failed loads.
    expect(workoutDraft.defaultStorage().getItem(workoutDraft.ACTIVE_DRAFT_KEY)).not.toBeNull();
  });
});
