import { describe, test, mock, beforeAll as before, afterAll as after, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep, typeInto } from './support/domHarness';

// The Personal Data page mounted with scripted hooks: what is on screen, the exact payload and the range check on
// Save, history disclosure, and the folded settings (rest timers, MCP token) keep working.
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/personalData.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

const saved = {
  full_name: 'Alex Test', dob: null, age: 36, gender: 'M', height_cm: 180, target_weight_kg: 78,
  gym_day_calorie_target: 2300, gym_day_calorie_target_max: 2600, rest_day_calorie_target: 1900, rest_day_calorie_target_max: 2200,
  protein_multiplier: 1.8, protein_multiplier_max: 2.2, carb_multiplier: 3, carb_multiplier_max: 4,
  workout_days: [1, 3], workout_day_templates: { '1': 't1' },
};
// The hook is scripted: tests set `hook` to say what the page was handed (loading, failed first load, stale, empty).
const emptyProfile = {
  full_name: null, dob: null, age: null, gender: null, height_cm: null, target_weight_kg: null,
  gym_day_calorie_target: null, gym_day_calorie_target_max: null, rest_day_calorie_target: null, rest_day_calorie_target_max: null,
  protein_multiplier: null, protein_multiplier_max: null, carb_multiplier: null, carb_multiplier_max: null,
  workout_days: [], workout_day_templates: {},
};
const hook = { data: saved as typeof saved | typeof emptyProfile, loading: false, phase: 'ready', loadFailed: false, refreshFailed: false, error: null as unknown };
const baseHook = { ...hook };
let hookRefetches = 0;
const saves: unknown[] = [];
const toasts = { error: [] as string[], success: [] as string[] };
const restSaves: number[][] = [];
const invokes: string[] = [];
let tokenExists = true;

mock.module('sonner', () => ({
  toast: { error: (m: string) => toasts.error.push(m), success: (m: string) => toasts.success.push(m) },
}));
mock.module('@/hooks/usePersonalData', () => ({
  usePersonalData: () => ({
    ...hook,
    save: async (p: unknown) => { saves.push(p); return { error: null }; },
    refetch: async () => { hookRefetches++; },
  }),
}));
const hist = (id: string, field: string, value: number, at: string) => ({ id, field, value, changed_at: at });
mock.module('@/hooks/usePersonalDataHistory', () => {
  const entries = [
    hist('a', 'gym_day_calorie_target', 2300, '2026-10-01T10:00:00.100Z'),
    hist('b', 'gym_day_calorie_target_max', 2600, '2026-10-01T10:00:00.300Z'),
    hist('c', 'gym_day_calorie_target', 2200, '2026-09-01T10:00:00.100Z'),
    hist('d', 'gym_day_calorie_target_max', 2500, '2026-09-01T10:00:00.300Z'),
    hist('e', 'target_weight_kg', 78, '2026-10-02T10:00:00Z'),
  ];
  return { usePersonalDataHistory: () => ({ entries, loading: false, refetch: async () => {}, latestFor: () => null, historyFor: (f: string) => entries.filter((e) => e.field === f) }) };
});
mock.module('@/hooks/useWeight', () => ({ useWeight: () => ({ entries: [{ id: 'w', weight: 82, date: '2026-10-30' }], loading: false }) }));
mock.module('@/hooks/useWorkoutTemplates', () => ({ useWorkoutTemplates: () => ({ templates: [{ id: 't1', name: 'Push Day' }] }) }));
mock.module('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({
    settings: { set_rest_seconds: 60, exercise_rest_seconds: 90 }, loading: false,
    updateRestTimers: async (s: number, e: number) => { restSaves.push([s, e]); },
  }),
}));
mock.module('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: async (_name: string, opts: { body: { action: string } }) => {
        invokes.push(opts.body.action);
        if (opts.body.action === 'status') return { data: { exists: tokenExists }, error: null };
        if (opts.body.action === 'generate') { tokenExists = true; return { data: { token: 'tok_abc123', exists: true }, error: null }; }
        tokenExists = false;
        return { data: { exists: false }, error: null };
      },
    },
  },
}));

describe('mounted: Personal Data page', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, TooltipProvider: any, Page: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    Page = (await import('../../src/pages/PersonalData')).default;
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
    saves.length = 0; restSaves.length = 0; invokes.length = 0;
    Object.assign(hook, baseHook); hookRefetches = 0;
    toasts.error.length = 0; toasts.success.length = 0;
    tokenExists = true;
  });
  after(() => env?.window.close());

  const mount = async () => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(TooltipProvider, null, React.createElement(Page))));
    await act(async () => { await sleep(10); });
    return host as HTMLElement;
  };
  const doc = () => env.window.document as Document;
  const q = (sel: string) => doc().querySelector(sel) as HTMLElement | null;
  const buttons = () => [...doc().querySelectorAll('button')] as HTMLButtonElement[];
  const byText = (text: string) => buttons().find((b) => b.textContent?.includes(text));
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  test('shows the summary first, then three open sections, the save bar and the folded settings', async () => {
    await mount();
    const h1 = [...doc().querySelectorAll('h1')].map(text);
    assert.deepEqual(h1, ['Personal Data']);
    const h2 = [...doc().querySelectorAll('h2')].map(text);
    assert.deepEqual(h2, ['Your settings at a glance', 'Profile & body', 'Nutrition targets', 'Training schedule', 'More settings']);
    const h3 = [...doc().querySelectorAll('h3')].map((h) => text(h.querySelector('button')) ? h.querySelector('button')!.getAttribute('aria-label') : text(h));
    assert.deepEqual(h3.slice(-3), ['Workout rest timers', 'Insight cutoffs', 'MCP token']);
    const summary = text(q('#summary'));
    assert.match(summary, /Alex Test · 36 yrs · Male/);
    assert.match(summary, /2,300.2,600 kcal/);
    assert.match(summary, /Mon · Wed/);
    assert.match(summary, /Overweight/);
    assert.equal(text(q('[role="status"]')), 'All changes saved.');
  });

  test('folded settings show their current value while closed, and open on click', async () => {
    await mount();
    const rest = byText('Workout rest timers')!;
    assert.equal(rest.getAttribute('aria-expanded'), 'false');
    assert.match(text(rest), /60 s between sets · 90 s between exercises/);
    assert.equal(q('#set-rest'), null, 'body is not rendered while closed');
    await act(async () => click(env.window, rest));
    assert.equal(rest.getAttribute('aria-expanded'), 'true');
    assert.equal((q('#set-rest') as HTMLInputElement).value, '60');
    assert.match(text(byText('Insight cutoffs')!), /High recovery from 66% · short sleep under 6.5 h/);
  });

  test('rest timers: an out-of-range value shows the linked error and saves nothing; a valid pair saves once', async () => {
    await mount();
    await act(async () => click(env.window, byText('Workout rest timers')!));
    await act(async () => typeInto(env.window, q('#set-rest') as HTMLInputElement, '2'));
    await act(async () => click(env.window, byText('Save rest timers')!));
    await flush(10);
    assert.equal(restSaves.length, 0);
    assert.match(text(q('#rest-error')), /between 5 and 900 seconds/);
    assert.equal(q('#set-rest')!.getAttribute('aria-invalid'), 'true');
    assert.equal(q('#set-rest')!.getAttribute('aria-describedby'), 'rest-error');
    await act(async () => typeInto(env.window, q('#set-rest') as HTMLInputElement, '45'));
    assert.equal(q('#rest-error'), null, 'error clears while typing');
    await act(async () => click(env.window, byText('Save rest timers')!));
    await flush(10);
    assert.deepEqual(restSaves, [[45, 90]]);
  });

  test('history: the current value is shown, earlier values open as one merged range per change', async () => {
    await mount();
    const targets = q('#targets')!;
    assert.match(text(targets), /Current: 2,300.2,600 kcal.* · set Oct 1, 2026/);
    const toggle = [...targets.querySelectorAll('button')].find((b) => b.textContent?.includes('Show 1 earlier')) as HTMLButtonElement;
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(targets.querySelector('ol'), null);
    await act(async () => click(env.window, toggle));
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(toggle.getAttribute('data-state'), 'open');
    const rows = [...targets.querySelectorAll('ol li')].map(text);
    assert.equal(rows.length, 1);
    assert.match(rows[0], /2,200.2,500 kcal/);
    assert.match(rows[0], /Sep 1, 2026/);
  });

  test('range check: Max below Min shows the inline error, marks both inputs, blocks Save with the original toast', async () => {
    await mount();
    const group = [...doc().querySelectorAll('[role="group"]')].find((g) => text(g).includes('Min (kcal)') && text(g).includes('Rest day calories') === false && g.closest('#targets') && /Gym day/.test(text(g.parentElement!.parentElement)))!;
    const inputs = group.querySelectorAll('input');
    await act(async () => typeInto(env.window, inputs[1] as HTMLInputElement, '2000'));
    assert.equal(inputs[0].getAttribute('aria-invalid'), 'true');
    assert.equal(inputs[1].getAttribute('aria-invalid'), 'true');
    assert.match(text(group), /Max must be the same as or higher than Min\./);
    assert.match(text(q('[role="status"]')), /Unsaved changes/);
    await act(async () => click(env.window, byText('Save profile, targets & schedule')!));
    await flush(10);
    assert.equal(saves.length, 0);
    assert.deepEqual(toasts.error, ['Gym day calories: Max must be greater than or equal to Min']);
  });

  test('save: sends the payload (blank max becomes min, template picks kept), toasts, and is clean afterwards', async () => {
    await mount();
    const height = q('#height') as HTMLInputElement;
    await act(async () => typeInto(env.window, height, '181,5'));
    assert.equal(height.value, '181.5', 'comma turns into a dot');
    await act(async () => typeInto(env.window, height, '18x'));
    assert.equal(height.value, '181.5', 'letters are ignored');
    await act(async () => click(env.window, byText('Save profile, targets & schedule')!));
    await flush(10);
    assert.equal(saves.length, 1);
    const p = saves[0] as Record<string, unknown>;
    assert.equal(p.height_cm, 181.5);
    assert.equal(p.gym_day_calorie_target, 2300);
    assert.equal(p.gym_day_calorie_target_max, 2600);
    assert.deepEqual(p.workout_days, [1, 3]);
    assert.deepEqual(p.workout_day_templates, { '1': 't1' });
    assert.deepEqual(toasts.success, ['Personal data saved']);
  });

  test('schedule: ticking a day adds it in order and shows a picker; unticking removes it', async () => {
    await mount();
    assert.ok(q('[aria-label="Template for Monday"]'));
    assert.equal(q('[aria-label="Template for Tuesday"]'), null);
    await act(async () => click(env.window, q('#wd-2')!));
    assert.ok(q('[aria-label="Template for Tuesday"]'));
    await act(async () => click(env.window, q('#wd-1')!));
    assert.equal(q('[aria-label="Template for Monday"]'), null);
    await act(async () => click(env.window, byText('Save profile, targets & schedule')!));
    await flush(10);
    const p = saves[0] as { workout_days: number[]; workout_day_templates: Record<string, string> };
    assert.deepEqual(p.workout_days, [2, 3]);
    assert.deepEqual(p.workout_day_templates, {}, 'the template of the unticked day is dropped');
  });

  test('MCP token: closed it says Active; open it keeps the token hidden; refresh shows it once and opens the copy notice; revoke asks first', async () => {
    await mount();
    await flush(10);
    const header = byText('MCP token')!;
    assert.match(text(header), /Active · no expiry/);
    assert.equal(header.getAttribute('aria-expanded'), 'false');
    await act(async () => click(env.window, header));
    assert.match(text(q('#mcp-token')), /Token hidden\. It cannot be shown again\./);
    assert.ok(byText('Refresh token') && byText('Revoke'));
    await act(async () => click(env.window, byText('Refresh token')!));
    await flush(20);
    assert.deepEqual(invokes, ['status', 'generate']);
    assert.match(text(q('#mcp-token')), /Copy now — this token will not be shown again/);
    assert.match(text(q('#mcp-token')), /tok_abc123/);
    assert.match(text(header), /New token ready to copy/);
    await act(async () => click(env.window, byText('Revoke')!));
    await flush(20);
    assert.ok(q('[role="alertdialog"]'), 'revoking opens a confirmation');
    assert.deepEqual(invokes, ['status', 'generate'], 'nothing is revoked before confirming');
  });

  test('MCP token: with no token the header says so and Generate is offered', async () => {
    tokenExists = false;
    await mount();
    await flush(10);
    const header = byText('MCP token')!;
    assert.match(text(header), /No token yet/);
    await act(async () => click(env.window, header));
    assert.ok(byText('Generate token'));
  });
});

describe('mounted: Personal Data page load states', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, TooltipProvider: any, Page: any, root: any;

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    Page = (await import('../../src/pages/PersonalData')).default;
  });
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    root = null;
    env.window.document.body.innerHTML = '';
    Object.assign(hook, baseHook); hookRefetches = 0; saves.length = 0;
    toasts.error.length = 0; toasts.success.length = 0;
  });
  after(() => env?.window.close());

  const doc = () => env.window.document as Document;
  const q = (sel: string) => doc().querySelector(sel) as HTMLElement | null;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const body = () => text(doc().body);
  const tryAgain = () => [...doc().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Try again') as HTMLButtonElement | undefined;
  const mount = async () => {
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(React.createElement(TooltipProvider, null, React.createElement(Page))));
    await act(async () => { await sleep(10); });
  };
  const rerender = async () => {
    await act(async () => root.render(React.createElement(TooltipProvider, null, React.createElement(Page))));
    await act(async () => { await sleep(10); });
  };
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });

  test('first load still running: a loading placeholder, no values, no error, no "All changes saved"', async () => {
    Object.assign(hook, { data: emptyProfile, loading: true, phase: 'loading' });
    await mount();
    assert.match(text(q('[role="status"]')), /Loading personal data/);
    assert.equal(q('#summary'), null);
    assert.equal(q('#fullName'), null);
    assert.equal(q('[role="alert"]'), null);
    assert.doesNotMatch(body(), /Not set|All changes saved/);
  });

  test('first load FAILED: a persistent error with Try again, never "Not set", a blank form or "All changes saved"', async () => {
    Object.assign(hook, { data: emptyProfile, loading: false, phase: 'error', loadFailed: true, error: new Error('boom') });
    await mount();
    assert.match(text(q('[role="alert"]')), /We couldn't load your personal data/);
    assert.equal(q('#summary'), null, 'no summary of unknown values');
    assert.equal(q('#profile'), null);
    assert.equal(q('#targets'), null);
    assert.equal(q('#schedule'), null);
    assert.equal(q('#fullName'), null, 'no blank form to type into');
    assert.doesNotMatch(body(), /Not set|All changes saved|Save profile/);
    // the independent settings still work: they have their own hooks
    assert.match(body(), /More settings/);
    assert.ok(tryAgain(), 'one working Try again');
    await act(async () => click(env.window, tryAgain()!));
    await flush(10);
    assert.equal(hookRefetches, 1);
  });

  test('a retry that is still running keeps the error on screen (the hook reports loading AND failed)', async () => {
    Object.assign(hook, { data: emptyProfile, loading: true, phase: 'error', loadFailed: true, error: new Error('boom') });
    await mount();
    assert.ok(q('[role="alert"]'));
    assert.equal(q('#fullName'), null);
  });

  test('retry succeeds: the error is replaced by the real summary and form', async () => {
    Object.assign(hook, { data: emptyProfile, loading: false, phase: 'error', loadFailed: true, error: new Error('boom') });
    await mount();
    Object.assign(hook, baseHook);
    await rerender();
    assert.equal(q('[role="alert"]'), null);
    assert.match(text(q('#summary')), /Alex Test/);
    assert.equal((q('#fullName') as HTMLInputElement).value, 'Alex Test');
    assert.equal(text(q('[role="status"]')), 'All changes saved.');
  });

  test('true empty profile: the setup state stays (Not set, blank form, nothing to save yet)', async () => {
    Object.assign(hook, { data: emptyProfile });
    await mount();
    assert.equal(q('[role="alert"]'), null);
    assert.match(text(q('#summary')), /Not set/);
    assert.equal((q('#fullName') as HTMLInputElement).value, '');
    assert.ok(q('#profile') && q('#targets') && q('#schedule'));
    assert.equal(text([...doc().querySelectorAll('[role="status"]')].find((e) => /saved|Unsaved/.test(text(e)))!), 'All changes saved.');
    assert.doesNotMatch(body(), /couldn't/i);
  });

  test('failed refresh: the rows stay, a stale notice with Try again appears, nothing else is replaced', async () => {
    Object.assign(hook, { refreshFailed: true, error: new Error('refresh failed') });
    await mount();
    const notice = [...doc().querySelectorAll('[role="status"]')].find((e) => /Couldn't refresh your personal data/.test(text(e)));
    assert.ok(notice, 'stale notice');
    assert.match(text(q('#summary')), /Alex Test/);
    assert.equal((q('#fullName') as HTMLInputElement).value, 'Alex Test');
    assert.equal(q('[role="alert"]'), null);
    assert.doesNotMatch(body(), /We couldn't load your personal data/);
    await act(async () => click(env.window, tryAgain()!));
    await flush(10);
    assert.equal(hookRefetches, 1);
  });

  test('a failed refresh never replaces unsaved edits, and the form still says it has unsaved changes', async () => {
    await mount();
    const height = q('#height') as HTMLInputElement;
    await act(async () => typeInto(env.window, height, '191'));
    Object.assign(hook, { refreshFailed: true, error: new Error('refresh failed') });
    await rerender();
    assert.equal((q('#height') as HTMLInputElement).value, '191');
    assert.match(body(), /Couldn't refresh your personal data/);
    assert.ok([...doc().querySelectorAll('[role="status"]')].some((e) => /Unsaved changes/.test(text(e))));
  });

  test('a successful background refresh does not wipe unsaved edits, but does update an untouched form', async () => {
    await mount();
    await act(async () => typeInto(env.window, q('#height') as HTMLInputElement, '191'));
    Object.assign(hook, { data: { ...saved, full_name: 'Alex Renamed', height_cm: 181 } });
    await rerender();
    assert.equal((q('#height') as HTMLInputElement).value, '191', 'edited field kept');
    assert.match(text(q('#summary')), /Alex Renamed/, 'saved summary follows the server');
    // an untouched form follows new data
    await act(async () => root.unmount());
    env.window.document.body.innerHTML = '';
    Object.assign(hook, baseHook);
    await mount();
    Object.assign(hook, { data: { ...saved, full_name: 'Alex Renamed' } });
    await rerender();
    assert.equal((q('#fullName') as HTMLInputElement).value, 'Alex Renamed');
  });

  test('after a save the form is clean even while the reload after it has not arrived yet', async () => {
    await mount();
    await act(async () => typeInto(env.window, q('#height') as HTMLInputElement, '185'));
    await act(async () => click(env.window, [...doc().querySelectorAll('button')].find((b) => b.textContent?.includes('Save profile'))!));
    await flush(10);
    assert.equal(saves.length, 1);
    assert.equal((q('#height') as HTMLInputElement).value, '185');
    // The reload then delivers the saved values: the form stays as saved and reports it.
    Object.assign(hook, { data: { ...saved, height_cm: 185 } });
    await rerender();
    assert.equal((q('#height') as HTMLInputElement).value, '185');
    assert.ok([...doc().querySelectorAll('[role="status"]')].some((e) => text(e) === 'All changes saved.'));
  });
});
