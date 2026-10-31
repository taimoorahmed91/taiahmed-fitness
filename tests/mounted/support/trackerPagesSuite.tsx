import { describe, test, mock, beforeAll as before, afterAll as after, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep, typeInto } from './domHarness';

// Weight / Waist / Sleep / Meals pages mounted with scripted hooks. Every add / save / delete outcome other than an
// explicit `true` (false, undefined, a rejection) must keep the person's draft on screen with a visible error;
// only `true` clears, resets or closes. A double tap sends one request.
// Registered by tests/mounted/trackerPages*.dom.tsx (split in three so each process stays well inside the runner's 5s limit).
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/trackerPagesWeight.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

type Outcome = 'false' | 'reject' | 'true' | 'undefined';
// One scripted API per tracker; each hook call records its arguments and takes the next outcome.
const makeApi = () => {
  const api = {
    outcomes: [] as Outcome[],
    calls: [] as Array<{ op: string; args: unknown[] }>,
    delay: 15,
    entries: [] as unknown[],
    call: async (op: string, ...args: unknown[]) => {
      api.calls.push({ op, args });
      await sleep(api.delay);
      const next = api.outcomes.shift() ?? 'true';
      if (next === 'reject') throw new Error('network');
      if (next === 'undefined') return undefined;
      return next === 'true';
    },
  };
  return api;
};
const apis = { weight: makeApi(), waist: makeApi(), sleep: makeApi(), meals: makeApi() };
const hookFor = (api: ReturnType<typeof makeApi>) => () => ({
  entries: api.entries, loading: false,
  addEntry: (...a: unknown[]) => api.call('add', ...a),
  updateEntry: (...a: unknown[]) => api.call('update', ...a),
  deleteEntry: (...a: unknown[]) => api.call('delete', ...a),
  refetch: async () => {},
});
const readyState = { phase: 'ready', loadFailed: false, refreshFailed: false, error: null };
mock.module('@/lib/sharedTable', () => ({ useSharedTableState: () => readyState, useSharedTable: () => ({}) }));
mock.module('@/hooks/useWeight', () => ({ useWeight: hookFor(apis.weight) }));
mock.module('@/hooks/useWaist', () => ({ useWaist: hookFor(apis.waist) }));
mock.module('@/hooks/useSleep', () => ({ useSleep: hookFor(apis.sleep) }));
mock.module('@/hooks/useMeals', () => ({
  useMeals: () => ({
    meals: apis.meals.entries, lastFetchedAt: null, refetch: async () => {},
    addMeal: (...a: unknown[]) => apis.meals.call('add', ...a),
    updateMeal: (...a: unknown[]) => apis.meals.call('update', ...a),
    deleteMeal: (...a: unknown[]) => apis.meals.call('delete', ...a),
    getTodayCalories: () => 0, getTodayProtein: () => 0, getTodayCarbs: () => 0,
  }),
}));
mock.module('@/hooks/usePersonalData', () => ({
  usePersonalData: () => ({ data: { target_weight_kg: null, protein_multiplier: null, protein_multiplier_max: null, carb_multiplier: null, carb_multiplier_max: null, workout_days: [], workout_day_templates: {}, gym_day_calorie_target: null, gym_day_calorie_target_max: null, rest_day_calorie_target: null, rest_day_calorie_target_max: null }, loading: false }),
}));
mock.module('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({ settings: { daily_calorie_goal: 2000, weight_interval: 7, waist_interval: 7 }, loading: false }),
}));
mock.module('@/hooks/useGymSessions', () => ({ useGymSessions: () => ({ sessions: [], loading: false }) }));
mock.module('@/hooks/useExtraActivities', () => ({ useExtraActivities: () => ({ activities: [], loading: false }) }));

export const registerTrackerPages = (which: string[]) => describe(`mounted: ${which.join(' + ')} keep the draft until the database confirms`, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ TooltipProvider } = await import('../../../src/components/ui/tooltip'));
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
    for (const api of Object.values(apis)) { api.outcomes.length = 0; api.calls.length = 0; api.entries = []; }
  });
  after(() => env?.window.close());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    // The app mounts one TooltipProvider at its root; row icon buttons need it.
    await act(async () => root.render(React.createElement(TooltipProvider, null, node)));
    return host;
  };
  const q = (sel: string) => env.window.document.querySelector(sel) as HTMLElement | null;
  const byText = (text: string, scope: ParentNode = env.window.document) =>
    [...scope.querySelectorAll('button')].find((b) => (b as HTMLElement).textContent?.includes(text)) as HTMLButtonElement | undefined;
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  // On a phone a row's Edit / Delete live in a tray that opens when the row is tapped. Opens the first row once.
  const openFirstRow = async () => {
    const row = env.window.document.querySelector('li button[aria-expanded="false"]:not([aria-haspopup])') as HTMLElement | null;
    if (row) await act(async () => click(env.window, row));
  };
  const alertText = (scope: ParentNode = env.window.document) => scope.querySelector('[role="alert"]')?.textContent ?? '';

  const trackers = [
    { name: 'Weight', api: apis.weight, page: () => import('../../../src/pages/Weight'), field: 'weight', editField: 'edit-weight', first: '70.5', second: '71.2', label: 'weight', entry: { id: 'e1', weight: 70, date: '2026-10-29' } },
    { name: 'Waist', api: apis.waist, page: () => import('../../../src/pages/Waist'), field: 'waist', editField: 'edit-waist', first: '81.5', second: '82', label: 'waist', entry: { id: 'e1', waist: 80, date: '2026-10-29' } },
    { name: 'Sleep', api: apis.sleep, page: () => import('../../../src/pages/Sleep'), field: 'hours', editField: 'edit-hours', first: '7.5', second: '8', label: 'sleep', entry: { id: 'e1', hours: 7, date: '2026-10-29' } },
  ];

  for (const t of trackers.filter((x) => which.includes(x.name))) {
    describe(t.name, () => {
      test('add: false, undefined and rejection keep the draft and show an error; a double tap sends one request; only true clears', async () => {
        const Page = (await t.page()).default;
        await mount(React.createElement(Page));
        const input = () => q(`#${t.field}`) as HTMLInputElement;
        const notes = () => q('#notes') as HTMLTextAreaElement;
        await act(async () => typeInto(env.window, input(), t.first));
        await act(async () => typeInto(env.window, notes(), 'felt fine'));

        t.api.outcomes.push('false', 'undefined', 'reject', 'true');
        for (let attempt = 1; attempt <= 3; attempt++) {
          // Two quick taps: single flight.
          await act(async () => { click(env.window, byText('Add Entry')!); click(env.window, byText('Add Entry')!); });
          assert.equal((byText('Adding') as HTMLButtonElement | undefined)?.getAttribute('aria-busy'), 'true', `attempt ${attempt}: shows loading`);
          await flush(60);
          assert.equal(t.api.calls.length, attempt, `attempt ${attempt}: one request per submit`);
          assert.equal(input().value, t.first, `attempt ${attempt}: value kept`);
          assert.equal(notes().value, 'felt fine', `attempt ${attempt}: notes kept`);
          assert.match(alertText(), /still here/, `attempt ${attempt}: persistent error shown`);
        }
        // Editing the draft dismisses the stale error.
        await act(async () => typeInto(env.window, input(), t.second));
        assert.equal(alertText(), '', 'error cleared when the draft changes');

        await act(async () => click(env.window, byText('Add Entry')!));
        await flush(60);
        assert.equal(t.api.calls.length, 4);
        assert.equal((t.api.calls[3].args[0] as Record<string, unknown>)[t.field], Number(t.second));
        assert.equal(input().value, '', 'cleared after confirmed success');
        assert.equal(notes().value, '', 'notes cleared after confirmed success');
        assert.equal(alertText(), '');
      });

      test('edit: a failed save keeps the dialog open with the typed draft; only true closes; no close while saving', async () => {
        t.api.entries = [t.entry];
        const Page = (await t.page()).default;
        await mount(React.createElement(Page));
        await openFirstRow();
        await act(async () => click(env.window, q(`button[aria-label^="Edit ${t.label} entry"]`)!));
        await flush(10);
        const dialog = () => q('[role="dialog"]');
        assert.ok(dialog(), 'edit dialog is open');
        const field = () => q(`#${t.editField}`) as HTMLInputElement;
        await act(async () => typeInto(env.window, field(), t.second));
        await act(async () => typeInto(env.window, q('#edit-notes')!, 'typed note'));

        t.api.outcomes.push('false', 'reject', 'undefined', 'true');
        for (let attempt = 1; attempt <= 3; attempt++) {
          await act(async () => { click(env.window, byText('Save Changes', dialog()!)!); click(env.window, byText('Save Changes', dialog()!)!); });
          // While the save runs the dialog cannot be dismissed with Escape.
          if (attempt === 1) {
            await act(async () => { env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
            assert.ok(dialog(), 'cannot be dismissed while saving');
          }
          await flush(60);
          assert.equal(t.api.calls.length, attempt, `attempt ${attempt}: one request per submit`);
          assert.ok(dialog(), `attempt ${attempt}: still open`);
          assert.equal(field().value, t.second, `attempt ${attempt}: value kept`);
          assert.equal((q('#edit-notes') as HTMLTextAreaElement).value, 'typed note', `attempt ${attempt}: notes kept`);
          assert.match(alertText(dialog()!), /still here/, `attempt ${attempt}: error shown`);
          assert.equal(byText('Save Changes', dialog()!)!.disabled, false, 'can retry');
        }
        await act(async () => click(env.window, byText('Save Changes', dialog()!)!));
        await flush(60);
        assert.equal(t.api.calls.length, 4);
        assert.equal(q('[role="dialog"]'), null, 'closed only after confirmed success');
      });

      test('edit: cancelling after a failure discards the error; reopening starts clean', async () => {
        t.api.entries = [t.entry];
        const Page = (await t.page()).default;
        await mount(React.createElement(Page));
        const open = async () => { await openFirstRow(); await act(async () => click(env.window, q(`button[aria-label^="Edit ${t.label} entry"]`)!)); await flush(10); };
        await open();
        t.api.outcomes.push('false');
        await act(async () => click(env.window, byText('Save Changes', q('[role="dialog"]')!)!));
        await flush(60);
        assert.match(alertText(q('[role="dialog"]')!), /still here/);
        await act(async () => { env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        await flush(20);
        assert.equal(q('[role="dialog"]'), null, 'closed by cancel');
        await open();
        assert.equal(alertText(q('[role="dialog"]')!), '', 'no stale error on reopen');
      });

      test('delete: the page returns the hook result, so false keeps the confirm dialog open and true closes it', async () => {
        t.api.entries = [t.entry];
        const Page = (await t.page()).default;
        await mount(React.createElement(Page));
        await openFirstRow();
        await act(async () => click(env.window, q(`button[aria-label^="Delete ${t.label} entry"]`)!));
        await flush(400);
        t.api.outcomes.push('false', 'true');
        await act(async () => click(env.window, byText('Yes, delete')!));
        await flush(60);
        assert.ok(q('[role="alertdialog"]'), 'false => stays open');
        assert.match(alertText(q('[role="alertdialog"]')!), /Could not complete/);
        await act(async () => click(env.window, byText('Yes, delete')!));
        await flush(60);
        assert.equal(q('[role="alertdialog"]'), null, 'true => closed');
        assert.deepEqual(t.api.calls.map((c) => c.op), ['delete', 'delete']);
        assert.deepEqual(t.api.calls[0].args, ['e1']);
      });
    });
  }

  if (which.includes('Meals')) describe('Meals', () => {
    const meal = { id: 'm1', food: 'Oats', calories: 300, protein: 10, carbs: 40, time: '08:00', date: '2026-10-29' };

    test('add form: false / undefined / rejection keep every typed field and show the error; only true clears', async () => {
      const { MealForm } = await import('../../../src/components/MealForm');
      const outcomes: Outcome[] = ['false', 'undefined', 'reject', 'true'];
      const sent: unknown[] = [];
      const onSubmit = async (payload: unknown) => {
        sent.push(payload);
        await sleep(15);
        const next = outcomes.shift()!;
        if (next === 'reject') throw new Error('offline');
        return next === 'undefined' ? (undefined as unknown as boolean) : next === 'true';
      };
      await mount(React.createElement(MealForm, { onSubmit }));
      await act(async () => typeInto(env.window, q('#food')!, 'Rice bowl'));
      await act(async () => typeInto(env.window, q('#calories')!, '650'));
      for (let attempt = 1; attempt <= 3; attempt++) {
        await act(async () => { click(env.window, byText('Log Meal')!); click(env.window, byText('Log Meal')!); });
        await flush(60);
        assert.equal(sent.length, attempt, `attempt ${attempt}: single flight`);
        assert.equal((q('#food') as HTMLInputElement).value, 'Rice bowl', `attempt ${attempt}: food kept`);
        assert.equal((q('#calories') as HTMLInputElement).value, '650', `attempt ${attempt}: calories kept`);
        assert.match(alertText(), /not saved/, `attempt ${attempt}: error shown`);
      }
      await act(async () => click(env.window, byText('Log Meal')!));
      await flush(60);
      assert.equal(sent.length, 4);
      assert.equal((q('#food') as HTMLInputElement).value, '', 'cleared after confirmed success');
      assert.equal(alertText(), '');
    });

    test('Meals page edit dialog: false / undefined / rejection keep it open with the draft; only true closes', async () => {
      apis.meals.entries = [meal];
      const Meals = (await import('../../../src/pages/Meals')).default;
      await mount(React.createElement(Meals));
      // Open the edit dialog through the list's edit action (labelled with the meal name).
      // On a phone the row's actions sit in a tray that opens when the row is tapped.
      const row = [...env.window.document.querySelectorAll('li button[aria-expanded]:not([aria-haspopup])')][0] as HTMLElement | undefined;
      if (row) await act(async () => click(env.window, row));
      const editButton = [...env.window.document.querySelectorAll('button')].find((b) => /edit/i.test((b as HTMLElement).getAttribute('aria-label') ?? '') || /^edit$/i.test((b as HTMLElement).textContent?.trim() ?? '')) as HTMLElement | undefined;
      assert.ok(editButton, 'edit action is reachable on the meal row');
      await act(async () => click(env.window, editButton!));
      await flush(20);
      const dialog = () => q('[role="dialog"]');
      assert.ok(dialog(), 'edit dialog is open');
      await act(async () => typeInto(env.window, q('#edit-food')!, 'Oats with berries'));

      apis.meals.outcomes.push('false', 'reject', 'undefined', 'true');
      for (let attempt = 1; attempt <= 3; attempt++) {
        await act(async () => click(env.window, byText('Save Changes', dialog()!)!));
        await flush(60);
        assert.equal(apis.meals.calls.length, attempt);
        assert.ok(dialog(), `attempt ${attempt}: still open`);
        assert.equal((q('#edit-food') as HTMLInputElement).value, 'Oats with berries', `attempt ${attempt}: draft kept`);
        assert.match(alertText(dialog()!), /not saved/, `attempt ${attempt}: error shown`);
      }
      await act(async () => click(env.window, byText('Save Changes', dialog()!)!));
      await flush(60);
      assert.equal(q('[role="dialog"]'), null, 'closed only after confirmed success');
      assert.deepEqual(apis.meals.calls[3].args[0], 'm1');
    });
  });
});
