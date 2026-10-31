import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from 'bun:test';
import { installDom, loadJsdom, sleep } from './support/domHarness';

// Confirmed-mutation contract for the Weight / Waist / Sleep / Meals hooks, mounted with a scripted fake backend.
// Contract: every add / update / delete resolves `true` ONLY when the database returned the affected row, and `false`
// for any other outcome (error, no signed-in user, zero rows from an RLS refusal or a vanished row). Never rejects.
// A zero-row update/delete resyncs the list (invalidate), shows an error toast and never patches the cache.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/trackerMutationHooks.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Answer = { data?: unknown; error?: unknown };
const script: Answer[] = [];
const calls: string[] = [];
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
  getSessionUser: async () => session.user,
  onAuthIdentityChange: () => ({ unsubscribe() {} }),
}));
mock.module('@/hooks/useActivityLog', () => ({ logActivity: () => {} }));
const toastError = mock((..._a: unknown[]) => {});
const toastSuccess = mock((..._a: unknown[]) => {});
mock.module('sonner', () => ({ toast: Object.assign(() => {}, { error: toastError, success: toastSuccess, info: () => {} }) }));
const session: { user: { id: string } | null } = { user: { id: 'user-a' } };
const patchSpy = mock((..._a: unknown[]) => {});
const invalidateSpy = mock(async () => {});
mock.module('@/lib/sharedTable', () => ({
  useSharedTable: () => ({ user: session.user, data: [], loading: false, lastFetchedAt: null, refetch: async () => {}, patch: patchSpy, invalidate: invalidateSpy }),
}));

describe('tracker mutation hooks: confirmed success only', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, root: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hook: { current: any } = { current: null };

  beforeAll(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
  });
  afterAll(async () => {
    if (root) await act(async () => root.unmount());
    env?.window.close();
  });
  beforeEach(() => {
    script.length = 0; calls.length = 0; session.user = { id: 'user-a' };
    patchSpy.mockClear(); invalidateSpy.mockClear(); toastError.mockClear(); toastSuccess.mockClear();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountHook = async (useIt: () => any) => {
    if (root) await act(async () => root.unmount());
    const Probe = () => { hook.current = useIt(); return null; };
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => { await sleep(10); });
    script.length = 0; calls.length = 0;
  };
  const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
    let out!: T;
    await act(async () => { out = await fn(); });
    return out;
  };

  const trackers = [
    { name: 'weight', mod: '../../src/hooks/useWeight', use: 'useWeight', field: 'weight', value: 70.5, row: (id: string) => ({ id, weight: 70.5, date: '2026-10-30', notes: null }) },
    { name: 'waist', mod: '../../src/hooks/useWaist', use: 'useWaist', field: 'waist', value: 80, row: (id: string) => ({ id, waist: 80, date: '2026-10-30', notes: null }) },
    { name: 'sleep', mod: '../../src/hooks/useSleep', use: 'useSleep', field: 'hours', value: 7.5, row: (id: string) => ({ id, hours: 7.5, date: '2026-10-30', notes: null }) },
  ] as const;

  for (const t of trackers) {
    describe(t.name, () => {
      const draft = { [t.field]: t.value, date: '2026-10-30' };
      const load = async () => {
        const mod = await import(t.mod);
        await mountHook(mod[t.use]);
      };

      test('add: only a returned row is success; error and signed-out are false and never reject', async () => {
        await load();
        script.push({ error: { message: 'Failed to fetch' } });
        expect(await run(() => hook.current.addEntry(draft))).toBe(false);
        expect(patchSpy).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalledTimes(1);

        script.push({ data: null }); // nothing came back (should never look like success)
        expect(await run(() => hook.current.addEntry(draft))).toBe(false);
        expect(patchSpy).not.toHaveBeenCalled();

        script.push({ data: t.row('n1') });
        expect(await run(() => hook.current.addEntry(draft))).toBe(true);
        expect(patchSpy).toHaveBeenCalledTimes(1);

        session.user = null;
        await load(); // the hook reads the user at render time, so remount signed out
        expect(await run(() => hook.current.addEntry(draft))).toBe(false);
        expect(calls).not.toContain('insert');
      });

      test('update: error and zero-row (RLS / gone) are false, resync, error toast, no patch, no success toast', async () => {
        await load();
        script.push({ error: { message: 'boom' } });
        expect(await run(() => hook.current.updateEntry('e1', draft))).toBe(false);
        expect(patchSpy).not.toHaveBeenCalled();

        toastError.mockClear();
        script.push({ data: null }); // zero rows: maybeSingle() returns null
        expect(await run(() => hook.current.updateEntry('e1', draft))).toBe(false);
        expect(invalidateSpy).toHaveBeenCalledTimes(1);
        expect(patchSpy).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalledTimes(1);
        expect(toastSuccess).not.toHaveBeenCalled();

        script.push({ data: t.row('e1') });
        expect(await run(() => hook.current.updateEntry('e1', draft))).toBe(true);
        expect(patchSpy).toHaveBeenCalledTimes(1);
        expect(toastSuccess).toHaveBeenCalledTimes(1);
      });

      test('delete: error and zero-row (RLS / gone) are false, resync, error toast, no patch, no success toast', async () => {
        await load();
        script.push({ error: { message: 'boom' } });
        expect(await run(() => hook.current.deleteEntry('e1'))).toBe(false);

        toastError.mockClear();
        script.push({ data: [] }); // zero rows deleted
        expect(await run(() => hook.current.deleteEntry('e1'))).toBe(false);
        expect(invalidateSpy).toHaveBeenCalledTimes(1);
        expect(patchSpy).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalledTimes(1);
        expect(toastSuccess).not.toHaveBeenCalled();

        script.push({ data: null });
        expect(await run(() => hook.current.deleteEntry('e1'))).toBe(false);

        script.push({ data: [{ id: 'e1' }] });
        expect(await run(() => hook.current.deleteEntry('e1'))).toBe(true);
        expect(patchSpy).toHaveBeenCalledTimes(1);
        expect(calls).toContain('select'); // the delete asks for the deleted row back, so a no-op is detectable
      });
    });
  }

  describe('meals', () => {
    const meal = { food: 'Oats', calories: 300, protein: 10, carbs: 40, time: '08:00', date: '2026-10-30' };
    const row = (id: string) => ({ id, ...meal, user_id: 'user-a' });
    const load = async () => { const { useMeals } = await import('../../src/hooks/useMeals'); await mountHook(useMeals); };

    test('add: error, empty answer and signed-out are false; only a returned row is true', async () => {
      await load();
      script.push({ error: { message: 'Failed to fetch' } });
      expect(await run(() => hook.current.addMeal(meal))).toBe(false);
      script.push({ data: null });
      expect(await run(() => hook.current.addMeal(meal))).toBe(false);
      expect(patchSpy).not.toHaveBeenCalled();
      script.push({ data: row('m1') });
      expect(await run(() => hook.current.addMeal(meal))).toBe(true);
      expect(patchSpy).toHaveBeenCalledTimes(1);
      session.user = null;
      expect(await run(() => hook.current.addMeal(meal))).toBe(false);
    });

    test('update: no returned row is false (error toast, resync, no success toast), never a success', async () => {
      await load();
      script.push({ error: { message: 'boom' } });
      expect(await run(() => hook.current.updateMeal('m1', { food: 'X' }))).toBe(false);
      toastError.mockClear();
      script.push({ data: null });
      expect(await run(() => hook.current.updateMeal('m1', { food: 'X' }))).toBe(false);
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledTimes(1);
      expect(toastSuccess).not.toHaveBeenCalled();
      script.push({ data: row('m1') });
      expect(await run(() => hook.current.updateMeal('m1', { food: 'X' }))).toBe(true);
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    test('delete: zero rows deleted is false (error toast, resync, no patch)', async () => {
      await load();
      script.push({ error: { message: 'boom' } });
      expect(await run(() => hook.current.deleteMeal('m1'))).toBe(false);
      toastError.mockClear();
      script.push({ data: [] });
      expect(await run(() => hook.current.deleteMeal('m1'))).toBe(false);
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledTimes(1);
      script.push({ data: [{ id: 'm1' }] });
      expect(await run(() => hook.current.deleteMeal('m1'))).toBe(true);
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
