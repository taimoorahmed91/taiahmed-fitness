import { describe, test, expect, mock, beforeAll, afterAll, afterEach } from 'bun:test';
import { click, installDom, loadJsdom, sleep, typeInto } from './support/domHarness';
import {
  ACTIVE_DRAFT_KEY, PARKED_DRAFT_PREFIX, readSlot, writeDraft, type StorageLike,
} from '../../src/lib/workoutDraft';
import {
  applySetUpdate, buildActiveWorkoutState, initialWorkoutData, type ActiveWorkoutState,
} from '../../src/lib/workoutSession';

// The real ActiveWorkoutModal, mounted: identity binding, snapshot resume, honest persistence warning,
// failed discard, account switch. Needs jsdom (not a project dependency). Run through tests/laneBMountedRunner.test.ts
// (own process: the fake DOM and module mocks must not leak into other tests), or directly:
//   JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/workoutModal.dom.tsx
const JSDOM = await loadJsdom();

// The modal only talks to the network through these; they are stubbed so nothing real is called.
let currentUserId: string | null = 'user-a';
mock.module('@/contexts/UserContext', () => ({ useUser: () => ({ user: currentUserId ? { id: currentUserId } : null }) }));
mock.module('@/lib/authSession', () => ({ getSessionUser: async () => null, onAuthIdentityChange: () => ({ unsubscribe() {} }) }));
mock.module('@/hooks/useActivityLog', () => ({ logActivity: () => {} }));
mock.module('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}) } }));

const A = 'user-a';
const B = 'user-b';

if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

describe('mounted: ActiveWorkoutModal recovery', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, ActiveWorkoutModal: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  const realSet = () => env.window.Storage.prototype.setItem;
  let setItemOriginal: (k: string, v: string) => void;
  let removeItemOriginal: (k: string) => void;

  beforeAll(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ ActiveWorkoutModal } = await import('../../src/components/ActiveWorkoutModal'));
    setItemOriginal = realSet();
    removeItemOriginal = env.window.Storage.prototype.removeItem;
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
    env.window.Storage.prototype.setItem = setItemOriginal;
    env.window.Storage.prototype.removeItem = removeItemOriginal;
    env.window.localStorage.clear();
    currentUserId = A;
  });
  afterAll(() => env?.window.close());

  const storage = (): StorageLike => env.window.localStorage;
  const q = (sel: string) => env.window.document.querySelector(sel) as HTMLInputElement | null;
  const byText = (text: string) =>
    [...env.window.document.querySelectorAll('button')].find((b: HTMLElement) => b.textContent?.includes(text)) as HTMLElement | undefined;
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });

  const savedDraft = (templateId = 'tpl-push', exercises = ['Bench', 'Row', 'Fly']): ActiveWorkoutState => {
    let data = initialWorkoutData(exercises.length);
    data = applySetUpdate(data, { index: 1, key: 'set1', value: '8', time: '10:01' }).data;
    data = applySetUpdate(data, { index: 1, key: 'set1Weight', value: '60', time: '10:01' }).data;
    return buildActiveWorkoutState({
      templateId, templateName: 'Push day', exercises, startTime: new Date('2026-10-30T10:00:00.000Z'), data,
      previousSequences: {}, expandedExercise: 1, restTimer: null,
    });
  };

  const template = (over: Record<string, unknown> = {}) => ({
    id: 'tpl-push', name: 'Push day', exercises: ['Bench', 'Row', 'Fly'], created_at: '', updated_at: '', ...over,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (props: Record<string, any>) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const element = (p: Record<string, unknown>) => React.createElement(ActiveWorkoutModal, {
      template: template(), open: true, onClose: () => {}, onFinish: async () => true, ...props, ...p,
    });
    await act(async () => root.render(element({})));
    await flush(30);
    return { rerender: async (p: Record<string, unknown> = {}) => { await act(async () => root.render(element(p))); await flush(10); } };
  };

  test('resume uses the saved snapshot even though the template was reordered, edited and renamed meanwhile', async () => {
    writeDraft(storage(), A, savedDraft(), Date.now());
    await mount({ template: template({ name: 'Push day v2', exercises: ['Row', 'Bench Press', 'Dips'] }) });
    const text = env.window.document.body.textContent as string;
    for (const name of ['Bench', 'Row', 'Fly']) expect(text).toContain(name);
    expect(text).not.toContain('Dips');
    expect(text).not.toContain('Bench Press');
    expect(text).toContain('Push day');
    expect(text).not.toContain('Push day v2');
    // Row is index 1 in the saved workout: its saved 8 x 60 is still on it.
    expect(q('#wk-1-set1-reps')?.value).toBe('8');
    expect(q('#wk-1-set1-weight')?.value).toBe('60');
    expect(q('#wk-0-set1-reps')?.value ?? '').toBe('');
  });

  test("another account never resumes (or writes over) someone else's workout; the owner finds it intact afterwards", async () => {
    const original = savedDraft();
    writeDraft(storage(), A, original, Date.now());
    currentUserId = B;
    await mount({});
    expect(q('#wk-1-set1-reps')?.value ?? '', "B must not see A's 8").toBe('');
    // B's own fresh workout is now in the slot; A's is parked untouched.
    const slot = readSlot(storage());
    expect(slot.kind === 'draft' && slot.envelope.userId).toBe(B);
    const parked = JSON.parse(env.window.localStorage.getItem(`${PARKED_DRAFT_PREFIX}${A}`) as string);
    expect(parked.userId).toBe(A);
    expect(parked.state).toEqual(original);
  });

  test('when storage fails the workout says so, never claims it is saving, blocks pausing, and recovers on retry', async () => {
    let closed = 0;
    await mount({ onClose: () => { closed++; } });
    // Enter a set while saving works.
    await act(async () => typeInto(env.window, q('#wk-0-set1-reps')!, '5'));
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();

    // Storage starts failing (quota).
    env.window.Storage.prototype.setItem = () => { throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }); };
    await act(async () => typeInto(env.window, q('#wk-0-set2-reps')!, '5'));
    await flush(10);
    const alert = env.window.document.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/not being saved on this device/i);
    expect(alert?.textContent).toMatch(/storage is full/i);
    expect(byText('Try saving again')).toBeTruthy();
    expect(env.window.document.body.textContent).not.toMatch(/workout is saving on this device/i);

    // Pausing would lose the workout: it stays open.
    await act(async () => click(env.window, byText('Pause & Resume Later')!));
    await flush(10);
    expect(closed).toBe(0);

    // Space is freed; retry works, warning goes away, pause now closes.
    env.window.Storage.prototype.setItem = setItemOriginal;
    await act(async () => click(env.window, byText('Try saving again')!));
    await flush(10);
    expect(env.window.document.querySelector('[role="alert"]')).toBeNull();
    const slot = readSlot(storage());
    expect(slot.kind).toBe('draft');
    expect(slot.kind === 'draft' && slot.envelope.state.exerciseSets[0].set2).toBe('5');
    await act(async () => click(env.window, byText('Pause & Resume Later')!));
    expect(closed).toBe(1);
  });

  test('discarding a workout whose saved copy cannot be removed stays open with an error, and works once storage does', async () => {
    let closed = 0;
    await mount({ onClose: () => { closed++; } });
    await act(async () => typeInto(env.window, q('#wk-0-set1-reps')!, '5'));
    expect(readSlot(storage()).kind).toBe('draft');

    env.window.Storage.prototype.removeItem = () => { throw new Error('blocked'); };
    await act(async () => click(env.window, byText('Cancel Workout')!));
    await flush(400);
    await act(async () => click(env.window, byText('Yes, discard workout')!));
    await flush(30);
    expect(closed).toBe(0);
    expect(env.window.document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toMatch(/Could not complete/);
    expect(readSlot(storage()).kind).toBe('draft');

    env.window.Storage.prototype.removeItem = removeItemOriginal;
    await act(async () => click(env.window, byText('Yes, discard workout')!));
    await flush(30);
    expect(closed).toBe(1);
    expect(readSlot(storage()).kind).toBe('empty');
  });

  test('a workout is never saved into a different account that signed in meanwhile', async () => {
    let finished = 0;
    const ui = await mount({ onFinish: async () => { finished++; return true; } });
    await act(async () => typeInto(env.window, q('#wk-0-set1-reps')!, '5'));
    currentUserId = B; // another tab signed someone else in
    await ui.rerender();
    await act(async () => click(env.window, byText('Complete Workout')!));
    await flush(30);
    expect(finished).toBe(0);
    // Still on the device, still A's.
    const slot = readSlot(storage());
    expect(slot.kind === 'draft' && slot.envelope.userId).toBe(A);
  });

  test('finishing passes the owner id, then removes only that saved copy', async () => {
    const owners: Array<string | null> = [];
    await mount({ onFinish: async (_data: unknown, ownerId: string | null) => { owners.push(ownerId); return true; } });
    await act(async () => typeInto(env.window, q('#wk-0-set1-reps')!, '5'));
    expect(readSlot(storage()).kind).toBe('draft');
    await act(async () => click(env.window, byText('Complete Workout')!));
    await flush(30);
    expect(owners).toEqual([A]);
    expect(readSlot(storage()).kind).toBe('empty');
    expect(env.window.document.body.textContent).toContain('Workout complete');
  });

  test('a failed final save keeps the workout on the device for a retry', async () => {
    await mount({ onFinish: async () => false });
    await act(async () => typeInto(env.window, q('#wk-0-set1-reps')!, '5'));
    await act(async () => click(env.window, byText('Complete Workout')!));
    await flush(30);
    expect(readSlot(storage()).kind).toBe('draft');
    expect(env.window.document.body.textContent).not.toContain('Workout complete');
  });
});
