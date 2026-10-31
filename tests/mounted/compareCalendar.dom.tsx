import { describe, test, mock, beforeAll as before, afterAll as after, afterEach, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import * as ReactNS from 'react';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Compare and Calendar mounted with scripted hooks (real DOM, own process).
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/compareCalendar.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

const day = (iso: string, delta: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = day(TODAY, -1);

type Table = 'meals' | 'gym_sessions' | 'weight' | 'waist' | 'sleep' | 'daily_notes';
const TABLES: Table[] = ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'daily_notes'];
type Phase = 'loading' | 'ready' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: Record<string, any> = {};
const tableState = {} as Record<Table, { phase: Phase; refreshFailed: boolean }>;
const refetchCalls = {} as Record<Table, number>;
// What a Try again does: scripted per test, then the store is bumped so mounted pages re-render.
let onRefetch: (table: Table) => void = () => {};

// A tiny external store, so a refetch that "succeeds" re-renders the mounted page like React Query would.
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const useVersion = () =>
  ReactNS.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );

const setPhase = (table: Table, phase: Phase, refreshFailed = false) => {
  tableState[table] = { phase, refreshFailed };
};
const setAll = (phase: Phase) => TABLES.forEach((t) => setPhase(t, phase));

const resetData = () => {
  TABLES.forEach((t) => {
    setPhase(t, 'ready');
    refetchCalls[t] = 0;
  });
  onRefetch = () => {};
  data.meals = [
    { id: 'm1', food: 'Oats', calories: 300, protein: 12, carbs: 50, time: '08:05', date: TODAY },
    { id: 'm2', food: 'Pasta', calories: 800, protein: 30, carbs: 100, time: '19:30', date: TODAY },
  ];
  data.gym = [
    { id: 'g1', exercise: 'Push', duration: 45, date: TODAY, notes: 'Start:09:30 End:10:15 | 1.Bench press: S1:12@40kg S2:10@40kg' },
    { id: 'g2', exercise: 'Push', duration: 50, date: YESTERDAY, notes: 'Start:18:00 End:18:50 | 1.Bench press: S1:12@42.5kg S2:10@40kg' },
  ];
  data.weight = [
    { id: 'w1', weight: 70.5, date: TODAY },
    { id: 'w2', weight: 70.2, date: YESTERDAY, notes: 'morning' },
    { id: 'w3', weight: 71, date: day(TODAY, -7) },
  ];
  data.sleep = [{ id: 's1', hours: 7.5, date: TODAY }];
  data.waist = [];
  data.notes = [{ id: 'n1', user_id: 'u', date: TODAY, tags: ['Headache'], severity: 2, notes: 'mild', created_at: '', updated_at: '' }];
};
resetData();

// Like the real hooks: a table whose first load failed (or has not finished) has NO rows, which is why "no rows" alone cannot be read as "empty".
const rows = (table: Table, list: unknown[]) => (tableState[table].phase === 'ready' ? list : []);
const refetchFor = (table: Table) => async () => {
  refetchCalls[table] += 1;
  await new Promise((r) => setTimeout(r, 5));
  onRefetch(table);
  bump();
};
mock.module('@/lib/sharedTable', () => ({
  useSharedTable: () => ({}),
  useSharedTableState: (table: Table) => {
    useVersion();
    const { phase, refreshFailed } = tableState[table];
    return { phase, loadFailed: phase === 'error', refreshFailed: phase === 'ready' && refreshFailed, error: null };
  },
}));
mock.module('@/hooks/useMeals', () => ({ useMeals: () => (useVersion(), { meals: rows('meals', data.meals), refetch: refetchFor('meals') }) }));
mock.module('@/hooks/useGymSessions', () => ({ useGymSessions: () => (useVersion(), { sessions: rows('gym_sessions', data.gym), refetch: refetchFor('gym_sessions') }) }));
mock.module('@/hooks/useWeight', () => ({ useWeight: () => (useVersion(), { entries: rows('weight', data.weight), refetch: refetchFor('weight') }) }));
mock.module('@/hooks/useSleep', () => ({ useSleep: () => (useVersion(), { entries: rows('sleep', data.sleep), refetch: refetchFor('sleep') }) }));
mock.module('@/hooks/useWaist', () => ({ useWaist: () => (useVersion(), { entries: rows('waist', data.waist), refetch: refetchFor('waist') }) }));
mock.module('@/hooks/useDailyNotes', () => ({ useDailyNotes: () => (useVersion(), { notes: rows('daily_notes', data.notes), refetch: refetchFor('daily_notes') }), SYMPTOM_TAGS: [] }));

describe('mounted: Compare and Calendar', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, TooltipProvider: any, MemoryRouter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    ({ MemoryRouter } = await import('react-router-dom'));
  });
  beforeEach(() => resetData());
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });
  after(() => env?.window.close());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountPage = async (Page: any) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(MemoryRouter, null, React.createElement(TooltipProvider, null, React.createElement(Page)))));
    return host as HTMLElement;
  };
  const doc = () => env.window.document as Document;
  const all = (sel: string) => [...doc().querySelectorAll<HTMLElement>(sel)];
  const q = (sel: string) => doc().querySelector<HTMLElement>(sel);
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const clickEl = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click exists');
    await act(async () => click(env.window, el!));
  };
  const radio = (name: string) => all('[role="radio"]').find((r) => text(r).startsWith(name));
  const checkboxes = () => all('ul[role="list"] [role="checkbox"]');
  const labelOf = (cb: HTMLElement) => cb.closest('label')!;
  const tickRecord = async (contains: string) => {
    const cb = checkboxes().find((c) => text(labelOf(c)).includes(contains));
    await clickEl(cb);
  };
  const byLabel = (label: string) => q(`[aria-label="${label}"]`);
  const within = (scope: Element, label: string) => [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label));

  describe('Compare', () => {
    const loadCompare = async () => mountPage((await import('../../src/pages/Compare')).default);

    test('starts as a three-step flow: h1, then h2 per step, nothing chosen, next action explained', async () => {
      await loadCompare();
      assert.equal(all('h1').length, 1);
      assert.deepEqual(all('h2').map((h) => text(h).replace(/^Step \d: /, '')), ['Choose a metric', 'Select two records', 'Inspect the comparison']);
      const group = q('[role="radiogroup"]')!;
      assert.equal(group.getAttribute('aria-label'), 'Metric to compare');
      assert.deepEqual(all('[role="radio"]').map((r) => r.getAttribute('aria-checked')), ['false', 'false', 'false', 'false']);
      assert.match(text(doc().body), /Start with step 1/);
      assert.match(text(doc().body), /Choose a metric in step 1 and its records are listed here/);
      assert.equal(q('ul[role="list"]'), null);
    });

    test('metric tiles say what each holds and how many records there are', async () => {
      await loadCompare();
      assert.match(text(radio('Weight')), /3 weigh-ins/);
      assert.match(text(radio('Meals')), /2 meals/);
      assert.match(text(radio('Gym')), /Duration, exercises and sets/);
    });

    test('choosing a metric lists its records as labelled checkboxes with date and unit', async () => {
      await loadCompare();
      await clickEl(radio('Weight'));
      assert.equal(radio('Weight')!.getAttribute('aria-checked'), 'true');
      const boxes = checkboxes();
      assert.equal(boxes.length, 3);
      for (const cb of boxes) assert.ok(cb.closest('label'), 'every checkbox sits in a label');
      const first = text(labelOf(boxes[0]));
      assert.match(first, /70\.5 kg/);
      assert.match(first, /Today|[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+/);
      assert.match(text(doc().body), /Pick two records/);
    });

    test('one pick fills A and says what is still needed; two picks show the comparison', async () => {
      await loadCompare();
      await clickEl(radio('Weight'));
      await tickRecord('70.2 kg');
      assert.match(text(q('[role="status"]')), /1 of 2 records selected: A is 70\.2 kg/);
      assert.match(text(doc().body), /Pick one more record/);
      assert.match(text(doc().body), /Record A is 70\.2 kg/);
      assert.equal(all('dl').length, 0, 'no comparison yet');

      await tickRecord('70.5 kg');
      assert.match(text(q('[role="status"]')), /2 of 2 records selected/);
      const body = text(doc().body);
      // B (70.5) minus A (70.2) = +0.3, noise-free, worded neutrally, with the day gap.
      assert.match(body, /B is 0\.3 kg higher than A, 1 day later\./);
      assert.match(body, /\+0\.3 kg/);
      assert.match(body, /from A to B/);
      assert.match(body, /70\.2 kg/);
      assert.match(body, /70\.5 kg/);
      assert.equal(all('time[datetime]').length >= 2, true);
      assert.match(text(q('dl')), /Notes/);
    });

    test('the change is never coloured red or green and carries a glyph, a sign and a word', async () => {
      await loadCompare();
      await clickEl(radio('Weight'));
      await tickRecord('71 kg');
      await tickRecord('70.5 kg');
      const results = q('#compare-results')!;
      assert.equal(/chart-min|chart-max|text-green|text-red|destructive/.test(results.innerHTML), false);
      const chip = [...results.querySelectorAll('span')].find((s) => text(s).startsWith('\u22120.5 kg'))!;
      assert.ok(chip, 'signed change with a real minus sign');
      assert.ok(chip.querySelector('svg'), 'direction arrow');
      assert.match(text(chip), /Lower/);
    });

    test('a third tick replaces A, swap flips the direction, remove and clear return to guidance', async () => {
      await loadCompare();
      await clickEl(radio('Weight'));
      await tickRecord('71 kg');
      await tickRecord('70.2 kg');
      await tickRecord('70.5 kg');
      const tray = text(q('ol[aria-label="Selected records"]'));
      assert.match(tray, /70\.2 kg/);
      assert.match(tray, /70\.5 kg/);
      assert.equal(/71 kg/.test(tray), false, 'the earliest pick was dropped');
      assert.match(text(doc().body), /B is 0\.3 kg higher than A/);

      await clickEl(all('button').find((b) => text(b).includes('Swap A and B')));
      assert.match(text(doc().body), /B is 0\.3 kg lower than A/);

      await clickEl(byLabel('Remove record B: 70.2 kg') ?? all('button').find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Remove record B')));
      assert.match(text(doc().body), /Pick one more record/);

      await clickEl(all('button').find((b) => text(b).includes('Clear picks')));
      assert.match(text(doc().body), /Pick two records/);
      assert.equal(checkboxes().filter((c) => c.getAttribute('aria-checked') === 'true').length, 0);
    });

    test('switching metric starts a fresh pick, and Start over returns to step 1', async () => {
      await loadCompare();
      await clickEl(radio('Weight'));
      await tickRecord('71 kg');
      await clickEl(radio('Sleep'));
      assert.equal(checkboxes().length, 1);
      assert.equal(checkboxes()[0].getAttribute('aria-checked'), 'false');
      await clickEl(all('button').find((b) => text(b) === 'Start over'));
      assert.deepEqual(all('[role="radio"]').map((r) => r.getAttribute('aria-checked')), ['false', 'false', 'false', 'false']);
      assert.match(text(doc().body), /Start with step 1/);
    });

    test('meals compare calories, food and macros with units', async () => {
      await loadCompare();
      await clickEl(radio('Meals'));
      await tickRecord('Oats');
      await tickRecord('Pasta');
      const body = text(q('#compare-results'));
      assert.match(body, /B is 500 calories higher than A, on the same day\./);
      assert.match(body, /300 cal/);
      assert.match(body, /800 cal/);
      assert.match(body, /\+18 g/);
      assert.match(text(q('dl')), /Food/);
    });

    test('gym compares duration and then exercise by exercise, with set changes', async () => {
      await loadCompare();
      await clickEl(radio('Gym'));
      await tickRecord('50 min');
      await tickRecord('45 min');
      const results = q('#compare-results')!;
      assert.match(text(results), /B is 5 min.* lower than A|B is 5 minutes lower than A/);
      const exercise = results.querySelector('section[aria-label="Exercise: Bench press"]')!;
      assert.ok(exercise, 'exercise section');
      assert.equal(exercise.querySelector('h4')!.textContent!.includes('Bench press'), true);
      assert.match(text(exercise), /\u22122\.5 kg/);
      assert.match(text(exercise), /Set 1/);
    });

    test('an empty metric explains the next step and links to where to log', async () => {
      data.sleep = [];
      await loadCompare();
      assert.match(text(radio('Sleep')), /None logged yet/);
      await clickEl(radio('Sleep'));
      assert.match(text(doc().body), /No sleep logs logged yet/);
      const link = all('a').find((a) => text(a).startsWith('Go to Sleep'))!;
      assert.equal(link.getAttribute('href'), '/sleep');
      assert.match(text(doc().body), /Nothing to compare in sleep yet/);
    });

    test('loading never says "no records"', async () => {
      setAll('loading');
      await loadCompare();
      assert.match(text(radio('Weight')), /Loading/);
      await clickEl(radio('Weight'));
      assert.equal(/logged yet/.test(text(doc().body)), false);
      assert.ok(q('[role="status"]'));
    });

    test('every control keeps a 44px touch target via the shared primitives', async () => {
      await loadCompare();
      await clickEl(radio('Weight'));
      await tickRecord('71 kg');
      const removeButton = all('button').find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Remove record A'))!;
      assert.match(removeButton.className, /pointer:coarse\)\]:h-11/);
      for (const cb of checkboxes()) assert.match(cb.className, /pointer:coarse\)\]:h-11/);
    });
  });

  describe('Calendar', () => {
    const loadCalendar = async () => mountPage((await import('../../src/pages/Calendar')).default);
    const dayButtons = () => all('[role="group"][aria-label^="Days of"] button');
    const dayButton = (iso: string) => dayButtons().find((b) => (b.getAttribute('aria-label') ?? '').startsWith(longDay(iso)))!;
    const longDay = (iso: string) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
    const monthLabel = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

    test('outline: one h1, the month as h2, the selected day as h2, areas as h3', async () => {
      await loadCalendar();
      assert.equal(all('h1').length, 1);
      assert.deepEqual(all('h2').map((h) => text(h).replace(/\s*Today$/, '')), [monthLabel(TODAY), longDay(TODAY)]);
      assert.deepEqual(all('#calendar-day-detail h3').map((h) => text(h)), ['Meals', 'Workouts', 'Body', 'Recovery', 'Notes']);
      assert.deepEqual(all('h3').map((h) => text(h)).slice(0, 1), ['This month, and what the shapes mean']);
    });

    test('today is selected on arrival and marked by more than colour', async () => {
      await loadCalendar();
      const todayBtn = dayButton(TODAY);
      assert.equal(todayBtn.getAttribute('aria-pressed'), 'true');
      assert.equal(todayBtn.getAttribute('aria-current'), 'date');
      assert.match(todayBtn.getAttribute('aria-label')!, /, today, /);
      assert.match(todayBtn.className, /ring-2 ring-inset ring-primary/, 'selected outline');
      assert.ok(todayBtn.querySelector('span.rounded-full.bg-primary'), 'today disc around the number');
      assert.match(text(q('#calendar-day-detail')), /Today/);
      assert.equal(dayButtons().filter((b) => b.getAttribute('aria-pressed') === 'true').length, 1);
    });

    test('a day with data says what it holds; an empty day says nothing was logged', async () => {
      await loadCalendar();
      const label = dayButton(TODAY).getAttribute('aria-label')!;
      assert.match(label, /2 meals, 1,100 cal logged; 1 workout, 45 min; weight 70\.5 kg; sleep 7\.5 hours; 1 note/);
      const emptyIso = [...Array(28)].map((_, i) => day(`${TODAY.slice(0, 7)}-01`, i)).find((iso) => iso !== TODAY && iso !== YESTERDAY && iso.startsWith(TODAY.slice(0, 7)))!;
      assert.match(dayButton(emptyIso).getAttribute('aria-label')!, /nothing logged$/);
    });

    test('cells show shapes for phones and real numbers from sm, all hidden from assistive tech', async () => {
      await loadCalendar();
      const cell = dayButton(TODAY);
      const hidden = [...cell.querySelectorAll('[aria-hidden="true"]')];
      assert.equal(hidden.length >= 2, true);
      assert.match(text(hidden.find((h) => h.className.includes('sm:flex'))), /1,100 cal/);
      assert.match(text(hidden.find((h) => h.className.includes('sm:flex'))), /45 min/);
      assert.match(text(hidden.find((h) => h.className.includes('sm:flex'))), /70\.5 kg/);
      // Five areas: three real lines, then "+2 more" (four lines at most, the last one summarising the rest).
      assert.match(text(hidden.find((h) => h.className.includes('sm:flex'))), /\+2 more/);
      assert.equal(hidden.find((h) => h.className.includes('sm:hidden'))!.children.length, 5);
    });

    test('tapping a day selects it and the agenda follows', async () => {
      await loadCalendar();
      // Yesterday could be in last month on the 1st: only run the same-month assertions when it is not.
      if (!YESTERDAY.startsWith(TODAY.slice(0, 7))) return;
      await clickEl(dayButton(YESTERDAY));
      assert.equal(dayButton(YESTERDAY).getAttribute('aria-pressed'), 'true');
      assert.equal(dayButton(TODAY).getAttribute('aria-pressed'), 'false');
      assert.match(text(q('#calendar-day-detail h2')), new RegExp(longDay(YESTERDAY)));
      assert.match(text(q('#calendar-day-detail')), /Push/);
      assert.match(text(q('#calendar-day-detail')), /2 entries across 2 areas/);
    });

    test('meals are listed in clock order inside one group, not one card per event', async () => {
      await loadCalendar();
      const meals = q('#calendar-day-detail section')!;
      assert.equal(text(meals.querySelector('h3')), 'Meals');
      const rows = [...meals.querySelectorAll('li')].map((li) => text(li));
      assert.equal(rows.length, 2);
      assert.match(rows[0], /^08:05Oats300 cal · 12 g protein · 50 g carbs$/);
      assert.match(rows[1], /^19:30Pasta/);
      // Name on one line, facts on one wrapping line (not one line per fact), so a row stays short on a phone.
      assert.equal(meals.querySelectorAll('li')[0].querySelectorAll('span.block').length, 2);
      assert.equal(q('#calendar-day-detail')!.querySelectorAll('ul').length, 5);
    });

    test('month navigation moves the heading, keeps the selection and has accessible names', async () => {
      await loadCalendar();
      const prev = byLabel('Previous month')!;
      const next = byLabel('Next month')!;
      assert.ok(prev && next);
      assert.match(prev.className, /pointer:coarse\)\]:h-11/);
      await clickEl(next);
      assert.notEqual(text(q('#calendar-month-heading')), monthLabel(TODAY));
      // The selected day is still today, shown in the agenda.
      assert.match(text(q('#calendar-day-detail h2')), new RegExp(longDay(TODAY)));
      await clickEl(byLabel('Previous month'));
      assert.equal(text(q('#calendar-month-heading')), monthLabel(TODAY));
      assert.equal(dayButton(TODAY).getAttribute('aria-pressed'), 'true');
    });

    test('Today brings the month and the selection back', async () => {
      await loadCalendar();
      await clickEl(byLabel('Next month'));
      await clickEl(all('button').find((b) => text(b) === 'Today'));
      assert.equal(text(q('#calendar-month-heading')), monthLabel(TODAY));
      assert.equal(dayButton(TODAY).getAttribute('aria-pressed'), 'true');
    });

    test('previous / next day step through days and follow across a month end', async () => {
      await loadCalendar();
      await clickEl(byLabel('Next day'));
      const tomorrow = day(TODAY, 1);
      assert.match(text(q('#calendar-day-detail h2')), new RegExp(longDay(tomorrow)));
      assert.equal(text(q('#calendar-month-heading')), monthLabel(tomorrow), 'the grid follows the selected day');
      await clickEl(byLabel('Previous day'));
      await clickEl(byLabel('Previous day'));
      assert.match(text(q('#calendar-day-detail h2')), new RegExp(longDay(YESTERDAY)));
      assert.equal(text(q('#calendar-month-heading')), monthLabel(YESTERDAY));
    });

    test('month numbers double as a key: each label carries its shape and the right count', async () => {
      await loadCalendar();
      const stats = q('dl')!;
      assert.match(text(stats), /Days with meals/);
      assert.equal(stats.querySelectorAll('[aria-hidden="true"]').length, 6, 'one shape per label');
      assert.match(text(stats.parentElement), /what the shapes mean/);
      // The month heading carries the headline count.
      const month = TODAY.slice(0, 7);
      const expected = new Set([TODAY, YESTERDAY, day(TODAY, -7)].filter((d) => d.startsWith(month))).size;
      assert.match(text(q('#calendar-month-heading')!.parentElement), new RegExp(`${expected} ${expected === 1 ? 'day' : 'days'} with entries`));
    });

    test('while loading nothing is called empty and counts show a dash', async () => {
      setAll('loading');
      await loadCalendar();
      assert.equal(/nothing logged/.test(dayButton(TODAY).getAttribute('aria-label')!), false);
      assert.match(text(q('#calendar-day-detail')), /Loading entries/);
      assert.match(text(q('dl')), /–/);
      assert.match(text(q('#calendar-month-heading')!.parentElement), /Loading/);
    });

    test('an empty selected day is stated plainly', async () => {
      data.meals = []; data.gym = []; data.weight = []; data.sleep = []; data.notes = [];
      await loadCalendar();
      assert.match(text(q('#calendar-day-detail')), /Nothing logged on this day\./);
      assert.equal(q('#calendar-day-detail h3'), null);
    });

    test('phone strip repeats the selected day and offers a jump to its agenda', async () => {
      await loadCalendar();
      const strip = all('div').find((d) => d.className.includes('lg:hidden') && text(d).includes('Details'))!;
      assert.ok(strip);
      assert.match(text(strip), /1,100 cal · 45 min · 70\.5 kg · 7\.5 h · 1 note/);
      let scrolled = 0;
      q('#calendar-day-detail')!.scrollIntoView = () => { scrolled++; };
      await clickEl([...strip.querySelectorAll('button')].find((b) => text(b).startsWith('Details')));
      assert.equal(scrolled, 1);
      assert.equal(doc().activeElement, q('#calendar-day-detail h2'));
    });
  });

  const settle = async (ms = 30) => act(async () => { await sleep(ms); });
  const buttonWith = (label: string) => all('button').find((b) => text(b).includes(label));
  const alerts = () => all('[role="alert"]').map((a) => text(a));
  const bodyText = () => text(doc().body);

  describe('Compare: loading, failed, empty and stale are different states', () => {
    const loadCompare = async () => mountPage((await import('../../src/pages/Compare')).default);
    const radio = (name: string) => all('[role="radio"]').find((r) => text(r).startsWith(name))!;

    test('a failed first load is never worded as empty: tile, step 2 and step 3 all say it did not load', async () => {
      setPhase('weight', 'error');
      await loadCompare();
      assert.match(text(radio('Weight')), /Couldn't load/);
      assert.equal(/None logged yet/.test(text(radio('Weight'))), false);
      // The other metrics are unaffected and still show their counts.
      assert.match(text(radio('Meals')), /2 meals/);
      await act(async () => click(env.window, radio('Weight')));
      assert.match(text(radio('Weight')), /Couldn't load/, 'a compact tile keeps the failure visible');
      assert.ok(alerts().some((a) => /We couldn't load your weigh-ins/.test(a)), alerts().join(' | '));
      assert.ok(buttonWith('Try again'), 'a working Try again');
      assert.equal(q('ul[role="list"]'), null, 'no record list');
      assert.equal(/logged yet|None logged|Nothing to compare/.test(bodyText()), false, bodyText());
      assert.match(bodyText(), /The comparison is paused/);
      // The open failed metric explains itself once: no second page-level alert for it.
      assert.equal(alerts().filter((a) => /Couldn't load your weigh-ins/.test(a) && !/We couldn't/.test(a)).length, 0);
    });

    test('other failed metrics are named once in a page notice, and its retry targets only them', async () => {
      setPhase('weight', 'error');
      setPhase('sleep', 'error');
      await loadCompare();
      assert.ok(alerts().some((a) => /Couldn't load your weigh-ins and sleep logs/.test(a)), alerts().join(' | '));
      await act(async () => click(env.window, buttonWith('Try again')!));
      await settle();
      assert.deepEqual(TABLES.filter((t) => refetchCalls[t] > 0), ['weight', 'sleep']);
      assert.equal(refetchCalls.meals + refetchCalls.gym_sessions, 0);
    });

    test('Try again in step 2 reloads only that source and the records appear when it succeeds', async () => {
      setPhase('weight', 'error');
      onRefetch = (t) => { if (t === 'weight') setPhase('weight', 'ready'); };
      await loadCompare();
      await act(async () => click(env.window, radio('Weight')));
      await act(async () => click(env.window, buttonWith('Try again')!));
      assert.ok(buttonWith('Trying again'), 'progress while it retries');
      await settle();
      assert.deepEqual(TABLES.filter((t) => refetchCalls[t] > 0), ['weight']);
      assert.equal(all('ul[role="list"] [role="checkbox"]').length, 3);
      assert.equal(alerts().length, 0);
      assert.match(text(radio('Weight')), /Weight/);
      assert.equal(/Couldn't load/.test(bodyText()), false);
      assert.match(bodyText(), /Pick two records/);
    });

    test('a retry that fails again keeps the error and the button usable', async () => {
      setPhase('weight', 'error');
      await loadCompare();
      await act(async () => click(env.window, radio('Weight')));
      await act(async () => click(env.window, buttonWith('Try again')!));
      await settle();
      assert.ok(alerts().some((a) => /We couldn't load your weigh-ins/.test(a)));
      const again = buttonWith('Try again') as HTMLButtonElement;
      assert.ok(again && !again.disabled);
      assert.equal(refetchCalls.weight, 1);
      await act(async () => click(env.window, again));
      await settle();
      assert.equal(refetchCalls.weight, 2);
    });

    test('a genuinely empty source still gets the normal guided empty state', async () => {
      data.weight = [];
      await loadCompare();
      assert.match(text(radio('Weight')), /None logged yet/);
      await act(async () => click(env.window, radio('Weight')));
      assert.match(bodyText(), /No weigh-ins logged yet/);
      assert.match(bodyText(), /Nothing to compare in weight yet/);
      assert.equal(/couldn't load|paused/i.test(bodyText()), false);
      assert.equal(alerts().length, 0);
    });

    test('a failed refresh keeps the old rows: a stale notice with retry, and the comparison still works', async () => {
      setPhase('weight', 'ready', true);
      onRefetch = (t) => { if (t === 'weight') setPhase('weight', 'ready', false); };
      await loadCompare();
      await act(async () => click(env.window, radio('Weight')));
      assert.equal(all('ul[role="list"] [role="checkbox"]').length, 3, 'old rows kept');
      const notice = all('[role="status"]').find((n) => /Couldn't refresh your weigh-ins/.test(text(n)))!;
      assert.ok(notice, all('[role="status"]').map(text).join(' | '));
      assert.match(text(notice), /Showing what we loaded earlier/);
      assert.equal(alerts().length, 0, 'stale is not an error');
      assert.match(text(radio('Weight')), /3 weigh-ins/);
      for (const cb of all('ul[role="list"] [role="checkbox"]').slice(0, 2)) await act(async () => click(env.window, cb));
      assert.match(bodyText(), /B is .* than A/);
      await act(async () => click(env.window, within(notice, 'Try again')!));
      await settle();
      assert.equal(refetchCalls.weight, 1);
      assert.equal(all('[role="status"]').some((n) => /Couldn't refresh/.test(text(n))), false);
    });

    test('picks survive a stale refresh, and a metric that fails later is paused without losing the others', async () => {
      await loadCompare();
      await act(async () => click(env.window, radio('Meals')));
      for (const cb of all('ul[role="list"] [role="checkbox"]').slice(0, 2)) await act(async () => click(env.window, cb));
      assert.match(bodyText(), /B is 500 calories higher/);
      setPhase('gym_sessions', 'error');
      await act(async () => bump());
      assert.match(bodyText(), /B is 500 calories higher/, 'the open comparison is untouched');
      assert.ok(alerts().some((a) => /Couldn't load your workouts/.test(a)));
      assert.match(text(radio('Gym')), /Couldn't load/);
    });
  });

  describe('Calendar: loading, failed, partial, empty and stale are different states', () => {
    const loadCalendar = async () => mountPage((await import('../../src/pages/Calendar')).default);
    const dayButtons = () => all('[role="group"][aria-label^="Days of"] button');

    test('every table failed: grid, totals and agenda are paused, nothing says zero or empty, navigation stays', async () => {
      setAll('error');
      await loadCalendar();
      assert.equal(dayButtons().length, 0, 'no day cells');
      assert.equal(q('dl'), null, 'no month totals');
      assert.ok(alerts().some((a) => /We couldn't load your entries/.test(a)), alerts().join(' | '));
      assert.match(bodyText(), /Your meals, workouts, weigh-ins, waist logs, sleep logs and notes didn't load/);
      assert.equal(/nothing logged|nothing found|0 days|No entries|no entries/i.test(bodyText()), false, bodyText());
      assert.match(text(q('#calendar-month-heading')!.parentElement), /Couldn't load your entries/);
      assert.match(text(q('#calendar-day-detail')), /The day's agenda is paused/);
      assert.equal(q('#calendar-day-detail h3'), null);
      // Navigation and the filter are still usable.
      assert.ok(byLabel('Previous month') && byLabel('Next month') && byLabel('Filter calendar entries'));
      assert.ok(byLabel('Next day') && byLabel('Previous day'));
      await act(async () => click(env.window, byLabel('Next month')));
      assert.equal(dayButtons().length, 0);
      assert.equal(all('h1').length, 1);
    });

    test('Try again reloads every failed table, and the real month appears when they succeed', async () => {
      setAll('error');
      onRefetch = (t) => setPhase(t, 'ready');
      await loadCalendar();
      await act(async () => click(env.window, buttonWith('Try again')!));
      await settle(60);
      assert.deepEqual(TABLES.filter((t) => refetchCalls[t] === 1), TABLES);
      assert.ok(dayButtons().length >= 28);
      assert.equal(alerts().length, 0);
      assert.match(text(q('#calendar-day-detail')), /Meals/);
      assert.match(text(q('#calendar-month-heading')!.parentElement), /days? with entries/);
    });

    test('some tables failed: the loaded areas show, the missing ones are named, and nothing is called empty', async () => {
      setPhase('sleep', 'error');
      setPhase('daily_notes', 'error');
      await loadCalendar();
      assert.ok(dayButtons().length >= 28);
      assert.ok(alerts().some((a) => /Couldn't load your sleep logs and notes/.test(a)), alerts().join(' | '));
      assert.match(text(q('#calendar-month-heading')!.parentElement), /Some entries are missing/);
      // Loaded areas keep real numbers; missing areas show a dash, never 0.
      const stat = (label: string) => all('dl > div').find((d) => text(d.querySelector('dt')).startsWith(label))!;
      assert.match(text(stat('Sleep logs').querySelector('dd')), /^–\s*not loaded$/);
      assert.match(text(stat('Notes').querySelector('dd')), /^–\s*not loaded$/);
      assert.match(text(stat('Workouts').querySelector('dd')), /^\d+$/);
      // Today's agenda shows what loaded, minus sleep and notes, and says what is missing.
      assert.match(text(q('#calendar-day-detail')), /Couldn't load your sleep logs and notes/);
      assert.equal(q('#calendar-day-detail')!.querySelectorAll('h3').length, 3, 'meals, workouts, body');
      // A day with nothing in the loaded data is not "nothing logged".
      const quiet = dayButtons().find((b) => /no entries in the data that loaded/.test(b.getAttribute('aria-label')!));
      assert.ok(quiet, 'quiet days say so honestly');
      assert.equal(dayButtons().some((b) => /nothing logged$/.test(b.getAttribute('aria-label')!)), false);
      assert.equal(/nothing logged/i.test(bodyText()), false);
    });

    test('partial: Try again targets just the missing tables', async () => {
      setPhase('sleep', 'error');
      setPhase('daily_notes', 'error');
      onRefetch = (t) => setPhase(t, 'ready');
      await loadCalendar();
      await act(async () => click(env.window, buttonWith('Try again')!));
      await settle(60);
      assert.deepEqual(TABLES.filter((t) => refetchCalls[t] > 0), ['sleep', 'daily_notes']);
      assert.equal(alerts().length, 0);
      assert.equal(all('dl > div').some((d) => /not loaded/.test(text(d))), false);
      assert.match(text(q('#calendar-day-detail')), /Recovery/);
    });

    test('a failed refresh keeps every row and shows a stale notice, not an error', async () => {
      setPhase('meals', 'ready', true);
      onRefetch = (t) => setPhase(t, 'ready');
      await loadCalendar();
      assert.equal(alerts().length, 0);
      const notice = all('[role="status"]').find((n) => /Couldn't refresh your meals/.test(text(n)))!;
      assert.ok(notice);
      assert.match(text(q('#calendar-day-detail')), /Oats/);
      assert.match(dayButtons().find((b) => b.getAttribute('aria-current') === 'date')!.getAttribute('aria-label')!, /2 meals/);
      await act(async () => click(env.window, within(notice, 'Try again')!));
      await settle();
      assert.equal(refetchCalls.meals, 1);
      assert.equal(all('[role="status"]').some((n) => /Couldn't refresh/.test(text(n))), false);
    });

    test('a genuinely empty calendar still says "Nothing logged" and shows zero totals', async () => {
      data.meals = []; data.gym = []; data.weight = []; data.sleep = []; data.notes = [];
      await loadCalendar();
      assert.match(text(q('#calendar-day-detail')), /Nothing logged on this day\./);
      assert.match(text(q('#calendar-month-heading')!.parentElement), /0 days with entries/);
      assert.equal(alerts().length, 0);
      assert.equal(all('[role="status"]').some((n) => /Couldn't/.test(text(n))), false);
      assert.ok(dayButtons().every((b) => /nothing logged$/.test(b.getAttribute('aria-label')!)));
      assert.match(text(all('dl > div').find((d) => text(d).startsWith('Workouts'))), /0/);
    });

    test('still loading shows dashes and no claims, then the data arrives without a flash of "empty"', async () => {
      setAll('loading');
      await loadCalendar();
      assert.equal(dayButtons().some((b) => /nothing logged|no entries/.test(b.getAttribute('aria-label')!)), false);
      assert.match(text(q('#calendar-month-heading')!.parentElement), /Loading/);
      assert.equal(alerts().length, 0);
      TABLES.forEach((t) => setPhase(t, 'ready'));
      await act(async () => bump());
      assert.match(text(q('#calendar-day-detail')), /Meals/);
    });
  });
});
