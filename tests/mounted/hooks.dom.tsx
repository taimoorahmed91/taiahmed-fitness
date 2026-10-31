import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from 'bun:test';
import { installDom, loadJsdom, sleep } from './support/domHarness';

// The mutation hooks, mounted with a scripted fake backend: every update / delete / create resolves an explicit
// boolean (true only when the server confirmed it), and a refused or empty answer is never reported as success.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/hooks.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Answer = { data?: unknown; error?: unknown };
const script: Answer[] = [];
const calls: string[] = [];
// Every query-builder call returns the same thenable; awaiting it yields the next scripted answer.
const makeChain = (): unknown => {
  const chain: Record<string, unknown> = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const answer = script.shift() ?? { data: [], error: null };
        return (resolve: (v: Answer) => unknown) => resolve({ data: answer.data ?? null, error: answer.error ?? null });
      }
      return (...args: unknown[]) => { calls.push(prop); void args; return chain; };
    },
  });
  return chain;
};
mock.module('@/integrations/supabase/client', () => ({ supabase: { from: () => makeChain(), auth: {} } }));
mock.module('@/lib/authSession', () => ({
  getSessionUser: async () => ({ id: 'user-a' }),
  onAuthIdentityChange: () => ({ unsubscribe() {} }),
}));
mock.module('@/hooks/useActivityLog', () => ({ logActivity: () => {} }));
const patchSpy = mock(() => {});
const invalidateSpy = mock(async () => {});
mock.module('@/lib/sharedTable', () => ({
  useSharedTable: () => ({ data: [], loading: false, refetch: async () => {}, patch: patchSpy, invalidate: invalidateSpy }),
}));

describe('mutation hooks resolve an explicit boolean', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, useWorkoutTemplates: any, useGymSessions: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let root: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hook: { current: any } = { current: null };

  beforeAll(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ useWorkoutTemplates } = await import('../../src/hooks/useWorkoutTemplates'));
    ({ useGymSessions } = await import('../../src/hooks/useGymSessions'));
  });
  afterAll(() => env?.window.close());
  beforeEach(() => { script.length = 0; calls.length = 0; patchSpy.mockClear(); invalidateSpy.mockClear(); });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountHook = async (useIt: () => any) => {
    const Probe = () => { hook.current = useIt(); return null; };
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => { await sleep(20); });
    script.length = 0;
    calls.length = 0;
  };
  afterAll(async () => { if (root) await act(async () => root.unmount()); });
  const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
    let out!: T;
    await act(async () => { out = await fn(); });
    return out;
  };

  test('templates: update', async () => {
    await mountHook(useWorkoutTemplates);
    const row = { id: 't1', name: 'N', exercises: ['A'], created_at: '', updated_at: 'u2' };
    script.push({ error: { message: 'Failed to fetch' } });
    expect(await run(() => hook.current.updateTemplate('t1', { name: 'N' }))).toBe(false);
    script.push({ data: null }); // refused / not found: no row came back
    expect(await run(() => hook.current.updateTemplate('t1', { name: 'N' }))).toBe(false);
    script.push({ data: row });
    expect(await run(() => hook.current.updateTemplate('t1', { name: 'N' }))).toBe(true);
  });

  test('templates: delete', async () => {
    await mountHook(useWorkoutTemplates);
    script.push({ error: { message: 'boom' } });
    expect(await run(() => hook.current.deleteTemplate('t1'))).toBe(false);
    script.push({ data: [] }); // nothing deleted (RLS / gone)
    expect(await run(() => hook.current.deleteTemplate('t1'))).toBe(false);
    script.push({ data: [{ id: 't1' }] });
    expect(await run(() => hook.current.deleteTemplate('t1'))).toBe(true);
  });

  test('templates: create', async () => {
    await mountHook(useWorkoutTemplates);
    script.push({ error: { message: 'boom' } });
    expect(await run(() => hook.current.addTemplate({ name: 'N', exercises: ['A'] }))).toBe(false);
    script.push({ data: { id: 't9', name: 'N', exercises: ['A'], created_at: '', updated_at: '' } });
    expect(await run(() => hook.current.addTemplate({ name: 'N', exercises: ['A'] }))).toBe(true);
  });

  test('gym sessions: update', async () => {
    await mountHook(useGymSessions);
    script.push({ error: { message: 'Failed to fetch' } });
    expect(await run(() => hook.current.updateSession('s1', { exercise: 'X' }))).toBe(false);
    expect(patchSpy).not.toHaveBeenCalled();
    script.push({ data: null });
    expect(await run(() => hook.current.updateSession('s1', { exercise: 'X' }))).toBe(false);
    expect(invalidateSpy).toHaveBeenCalled(); // list resynced with the server
    expect(patchSpy).not.toHaveBeenCalled();
    script.push({ data: { id: 's1', exercise: 'X', duration: 5, date: '2026-10-30', notes: null, start_time: null, end_time: null } });
    expect(await run(() => hook.current.updateSession('s1', { exercise: 'X' }))).toBe(true);
    expect(patchSpy).toHaveBeenCalledTimes(1);
  });

  test('gym sessions: delete', async () => {
    await mountHook(useGymSessions);
    script.push({ error: { message: 'boom' } });
    expect(await run(() => hook.current.deleteSession('s1'))).toBe(false);
    script.push({ data: [] });
    expect(await run(() => hook.current.deleteSession('s1'))).toBe(false);
    expect(patchSpy).not.toHaveBeenCalled();
    script.push({ data: [{ id: 's1' }] });
    expect(await run(() => hook.current.deleteSession('s1'))).toBe(true);
    expect(patchSpy).toHaveBeenCalledTimes(1);
  });

  test("gym sessions: a workout recorded for one account is never inserted into another's log", async () => {
    await mountHook(useGymSessions);
    await expect(run(() => hook.current.addSession(
      { exercise: 'X', duration: 5, date: '2026-10-30' },
      { expectedUserId: 'someone-else' },
    ))).rejects.toThrow(/account changed/i);
    expect(calls).not.toContain('insert');
    // The matching account is saved normally.
    script.push({ data: { id: 's2', exercise: 'X', duration: 5, date: '2026-10-30', notes: null, start_time: null, end_time: null } });
    await run(() => hook.current.addSession({ exercise: 'X', duration: 5, date: '2026-10-30' }, { expectedUserId: 'user-a' }));
    expect(calls).toContain('insert');
  });
});
