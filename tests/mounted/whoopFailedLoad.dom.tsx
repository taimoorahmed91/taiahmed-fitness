import { describe, test, expect, mock, beforeAll, afterAll, afterEach, beforeEach } from 'bun:test';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// The WHOOP page, mounted on the REAL whoop shared-table hook with a scripted backend.
// The point: a failed first load is never "0 entries" or "No WHOOP data yet", a failed refresh keeps the rows with a
// stale notice, a true empty list keeps its onboarding guidance, and a reading that was not recorded never prints "-%".
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/whoopFailedLoad.dom.tsx
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
mock.module('sonner', () => ({ toast: { error: () => {}, success: () => {}, info: () => {} } }));

const ok = (rows: unknown) => () => ({ data: rows });
const fail = () => ({ error: { message: 'Failed to fetch' } });
const pending = () => 'pending' as const;

/** A database row. Everything not listed is not recorded (null). */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'w1', user_id: 'user-a', date: '2020-03-04', created_at: '2020-03-04T07:00:00Z', cycle_end_timestamp: null,
  recovery_score: 72, hrv_rmssd_milli: 48, resting_heart_rate: 52, spo2_percentage: null, skin_temp_celsius: null,
  sleep_performance_percentage: 85, sleep_efficiency_percentage: null, total_in_bed_hours: null, total_rem_sleep_milli: null,
  total_deep_sleep_milli: null, total_light_sleep_milli: null, total_awake_time_milli: null, respiratory_rate: null,
  disturbance_count: null, sleep_cycle_count: null, strain: 12.34, kilojoule: null, average_heart_rate: null, max_heart_rate: null,
  ...over,
});

describe('WHOOP page: failed first loads are never "0 entries" or "No WHOOP data yet"', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, QueryClient: any, QueryClientProvider: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Whoop: any, root: any, client: any;
  const consoleError = console.error;

  beforeAll(async () => {
    env = installDom(JSDOM);
    console.error = () => {};
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    ({ QueryClient, QueryClientProvider } = await import('@tanstack/react-query'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    act = React.act;
    Whoop = (await import('../../src/pages/WhoopData')).default;
  });
  afterAll(() => { console.error = consoleError; env?.window.close(); });
  beforeEach(() => {
    for (const key of Object.keys(behaviour)) delete behaviour[key];
    behaviour.fittrack_whoop_data = ok([]);
    behaviour.fittrack_user_settings = ok({ whoop_api_url: 'https://example.com/whoop' });
    requests.length = 0;
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = null;
    client?.clear();
    env.window.document.body.innerHTML = '';
  });

  const mount = async () => {
    client = new QueryClient();
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(
      React.createElement(QueryClientProvider, { client },
        React.createElement(TooltipProvider, null, React.createElement(Whoop))),
    ));
    await act(async () => { await sleep(40); });
  };
  const text = () => (env.window.document.body.textContent as string).replace(/\s+/g, ' ');
  const refreshAll = async () => { await act(async () => { await client.refetchQueries({ queryKey: ['fittrack-data'] }); }); };
  const pressRetry = async (where = 'button') => {
    const b = [...env.window.document.querySelectorAll(where)]
      .find((x: HTMLElement) => x.textContent?.trim() === 'Try again') as HTMLElement | undefined;
    expect(b).toBeDefined();
    await act(async () => { click(env.window, b!); await sleep(40); });
  };

  test('still loading: placeholders only, no count, no empty copy, no error', async () => {
    behaviour.fittrack_whoop_data = pending;
    await mount();
    expect(text()).not.toContain('No WHOOP data yet');
    expect(text()).not.toMatch(/\d+ entr/);
    expect(text()).not.toContain('Latest reading');
    expect(text()).toContain('Loading WHOOP');
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();
  });

  test('a true empty list keeps the onboarding guidance and shows no error or stale notice', async () => {
    await mount();
    expect(text()).toContain('No WHOOP data yet');
    expect(text()).toContain('Use Sync Now to fetch your first readings.');
    expect(text()).toContain('0 entries');
    expect(text()).not.toContain("Couldn't");
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();
  });

  test('never loaded: a persistent error with one working Try again, and no "0 entries" or "No WHOOP data yet"', async () => {
    behaviour.fittrack_whoop_data = fail;
    await mount();
    expect(text()).toContain("We couldn't load your WHOOP data");
    expect(text()).not.toContain('No WHOOP data yet');
    expect(text()).not.toMatch(/\d+ entr/);
    expect(text()).not.toContain('Use Sync Now to fetch your first readings');
    expect(text()).not.toContain('Latest reading');
    expect(text()).toContain('Your WHOOP history will show here once your entries load.');
    // Sync Now is not tied to the history loading
    expect([...env.window.document.querySelectorAll('button')].some((b: HTMLElement) => b.textContent?.includes('Sync Now'))).toBe(true);

    const before = requests.length;
    await pressRetry();
    expect(requests.length).toBeGreaterThan(before);
    expect(text()).toContain("We couldn't load your WHOOP data"); // still failing: stays honest
    expect(text()).not.toContain('No WHOOP data yet');

    behaviour.fittrack_whoop_data = ok([row()]);
    await pressRetry();
    expect(text()).not.toContain("We couldn't load");
    expect(text()).toContain('1 entry');
    expect(text()).toContain('Latest reading');
  });

  test('a failed refresh keeps the previous rows and shows a stale notice with a working retry', async () => {
    behaviour.fittrack_whoop_data = ok([row(), row({ id: 'w2', date: '2020-03-03' })]);
    await mount();
    expect(text()).toContain('2 entries');
    behaviour.fittrack_whoop_data = fail;
    await refreshAll();
    expect(text()).toContain('2 entries');
    expect(text()).toContain('Latest reading');
    expect(text()).toContain("Couldn't refresh your WHOOP data");
    expect(text()).not.toContain("We couldn't load your WHOOP data");
    expect(text()).not.toContain('No WHOOP data yet');
    behaviour.fittrack_whoop_data = ok([row(), row({ id: 'w2', date: '2020-03-03' })]);
    await pressRetry();
    expect(text()).not.toContain("Couldn't refresh");
    expect(text()).toContain('2 entries');
  });

  test('a reading that was not recorded is a dash with no unit, never "-%", "-ms" or "-h"', async () => {
    // spo2, in-bed and calories are not recorded on the latest entry
    behaviour.fittrack_whoop_data = ok([row()]);
    await mount();
    const page = text();
    expect(page).not.toMatch(/-\s?(%|ms|bpm|h\b|cal)/);
    expect(page).not.toContain('SpO2: -');
    expect(page).toMatch(/SpO2: —/);
    expect(page).toMatch(/In bed: —/);
    expect(page).toMatch(/Energy: —/);
    // recorded readings keep their units
    expect(page).toContain('72%');
    expect(page).toContain('HRV: 48 ms');
    expect(page).toContain('52 bpm');
    expect(page).toContain('12.3');
    // and the dash is spoken as "not recorded"
    expect(page).toContain('SpO2 not recorded');
    expect(page).not.toMatch(/ — ?%/);
  });

  test('every visible date is the shared readable calendar format, with the ISO day kept on <time dateTime>', async () => {
    behaviour.fittrack_whoop_data = ok([row(), row({ id: 'w2', date: '2020-03-03' })]);
    await mount();
    const latest = [...env.window.document.querySelectorAll('p')].find((p: HTMLElement) => p.textContent?.includes('Latest reading')) as HTMLElement;
    expect(latest.textContent).toContain('Latest reading: Wed, Mar 4, 2020');
    expect(latest.textContent).not.toContain('2020-03-04');
    expect(latest.querySelector('time')?.getAttribute('dateTime')).toBe('2020-03-04');
    // grouped rows: no raw ISO text is drawn (aria labels keep the exact day for assistive tech)
    const visible = [...env.window.document.querySelectorAll('time')].map((t: HTMLElement) => t.textContent ?? '');
    expect(visible.some((t) => /\d{4}-\d{2}-\d{2}/.test(t))).toBe(false);
  });

  test('the saved URL that failed to load is "Not checked" with a retry, never "Not set", and Save is held back', async () => {
    behaviour.fittrack_user_settings = fail;
    await mount();
    expect(text()).toContain('Not checked');
    expect(text()).not.toContain('Not set');
    const save = [...env.window.document.querySelectorAll('button')].find((b: HTMLElement) => b.textContent?.includes('Save URL')) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    behaviour.fittrack_user_settings = ok({ whoop_api_url: 'https://example.com/whoop' });
    await pressRetry('[role="alert"] button');
    expect(text()).toContain('Connected');
    expect(save.disabled).toBe(false);
  });
});
