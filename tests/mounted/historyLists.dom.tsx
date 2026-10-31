import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep, typeInto } from './support/domHarness';

// Mounted behaviour of the grouped Meals and Gym history lists (real DOM, own process).
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/historyLists.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

describe('mounted: grouped Meals and Gym history', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let MealList: any, GymList: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  let todayIso = '';
  let addDaysIso: (iso: string, n: number) => string;
  let formatShortDay: (iso: string, today: string) => string;

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ MealList } = await import('../../src/components/MealList'));
    ({ GymList } = await import('../../src/components/GymList'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    const dates = await import('../../src/lib/historyDates');
    addDaysIso = dates.addDaysIso;
    formatShortDay = dates.formatShortDay;
    todayIso = dates.defaultToday();
  });

  /** Pretends the viewport is `width` px wide (the lists read min-width media queries). */
  const setViewport = (width: number) => {
    env.window.matchMedia = (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
        onchange: null, dispatchEvent: () => false,
      };
    };
  };

  beforeEach(() => {
    env.window.localStorage.clear();
    setViewport(390);
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });
  after(() => env?.window.close());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(React.createElement(TooltipProvider, null, node)));
    return host;
  };
  const doc = () => env.window.document as Document;
  const all = (sel: string) => [...doc().querySelectorAll<HTMLElement>(sel)];
  const q = (sel: string) => doc().querySelector<HTMLElement>(sel);
  const byLabel = (label: string) => q(`[aria-label="${label}"]`);
  const disclosure = (text: string) => all('li button[aria-expanded]:not([aria-haspopup])').find((b) => b.textContent?.includes(text));
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  const clickEl = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click exists');
    await act(async () => click(env.window, el!));
  };
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const headings = () => all('section h4').map((h) => text(h));
  const headerOf = (heading: Element) => text(heading.parentElement);

  const meal = (id: string, food: string, date: string, time: string, calories: number, protein?: number | null, carbs?: number | null) =>
    ({ id, food, date, time, calories, protein, carbs });

  const baseMeals = () => [
    meal('m1', 'Chicken rice bowl', todayIso, '12:40', 620, 38, 70),
    meal('m2', 'Greek yoghurt', todayIso, '09:10', 240, 24, null),
    meal('m3', 'Pasta', addDaysIso(todayIso, -1), '19:00', 800, null, null),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountMeals = (meals: any[], props: Record<string, unknown> = {}) =>
    mount(React.createElement(MealList, { meals, onDelete: () => {}, onEdit: () => {}, onCopy: () => {}, ...props }));

  describe('Meals', () => {
    test('groups by day, newest first, with Today / Yesterday, a real <time>, and honest totals', async () => {
      await mountMeals(baseMeals());
      const h = headings();
      assert.equal(h.length, 2);
      assert.match(h[0], /^Today · /);
      assert.match(h[1], /^Yesterday · /);
      assert.ok(q(`section h4 time[datetime="${todayIso}"]`), 'semantic <time> with the real date');

      const [today, yesterday] = all('section h4');
      // Protein: both meals have it. Carbs: only one does, so coverage is stated. Calories always add up.
      const t = headerOf(today);
      assert.match(t, /860 cal/);
      assert.match(t, /62 g protein/);
      assert.doesNotMatch(t, /62 g protein \(/);
      assert.match(t, /70 g carbs \(1 of 2 meals\)/);
      assert.match(t, /2 meals/);
      // Yesterday: nothing logged for either macro, so neither total appears (never "0 g").
      const y = headerOf(yesterday);
      assert.match(y, /800 cal/);
      assert.doesNotMatch(y, /protein|carbs/);
      assert.match(y, /1 meal\b/);
    });

    test('a row is ONE disclosure button; opening it shows a labelled action tray', async () => {
      const copied: string[] = [];
      const edited: string[] = [];
      await mountMeals(baseMeals(), { onCopy: (m: { id: string }) => copied.push(m.id), onEdit: (m: { id: string }) => edited.push(m.id) });
      const row = disclosure('Chicken rice bowl')!;
      assert.equal(row.getAttribute('aria-expanded'), 'false');
      assert.equal(byLabel('Actions for Chicken rice bowl'), null, 'tray is not shown while collapsed');
      assert.equal(row.querySelector('button'), null, 'no nested buttons inside the disclosure');
      assert.match(text(row), /12:40/);
      assert.match(text(row), /620/);
      assert.match(text(row), /38 g protein · 70 g carbs/);

      await clickEl(row);
      assert.equal(disclosure('Chicken rice bowl')!.getAttribute('aria-expanded'), 'true');
      const controls = disclosure('Chicken rice bowl')!.getAttribute('aria-controls')!;
      assert.ok(doc().getElementById(controls), 'aria-controls points at the panel');
      const tray = byLabel('Actions for Chicken rice bowl')!;
      assert.ok(tray, 'tray appears');
      const names = [...tray.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
      assert.deepEqual(names, [
        'Copy Chicken rice bowl to form',
        'Pin Chicken rice bowl to quick add',
        'Edit Chicken rice bowl',
        'Delete Chicken rice bowl',
      ]);
      assert.match(text(tray), /Copy/);
      assert.match(text(tray), /Quick add/);

      await clickEl(byLabel('Copy Chicken rice bowl to form'));
      await clickEl(byLabel('Edit Chicken rice bowl'));
      assert.deepEqual(copied, ['m1']);
      assert.deepEqual(edited, ['m1']);

      // Quick add is a toggle with aria-pressed, and keeps the exact pin label.
      const pin = () => byLabel('Pin Chicken rice bowl to quick add')!;
      assert.equal(pin().getAttribute('aria-pressed'), 'false');
      await clickEl(pin());
      assert.equal(pin().getAttribute('aria-pressed'), 'true');
      assert.match(text(disclosure('Chicken rice bowl')), /pinned to quick add/);

      await clickEl(disclosure('Chicken rice bowl'));
      assert.equal(disclosure('Chicken rice bowl')!.getAttribute('aria-expanded'), 'false');
      assert.equal(byLabel('Actions for Chicken rice bowl'), null);
    });

    test('delete from the tray still goes through the ConfirmDeleteButton dialog', async () => {
      const deleted: string[] = [];
      await mountMeals(baseMeals(), { onDelete: (id: string) => deleted.push(id) });
      await clickEl(disclosure('Pasta'));
      await clickEl(byLabel('Delete Pasta'));
      await flush(10);
      const dialog = q('[role="alertdialog"]')!;
      assert.ok(dialog, 'confirmation dialog opens');
      assert.equal(env.window.document.activeElement?.textContent, 'No, keep it', 'cancel-first focus');
      assert.deepEqual(deleted, [], 'nothing deleted before confirming');
      await flush(400);
      const confirm = all('[role="alertdialog"] button').find((b) => b.textContent?.includes('Yes, delete'))!;
      await clickEl(confirm);
      await flush(30);
      assert.deepEqual(deleted, ['m3']);
    });

    test('with a filter active a day says "N of M meals shown" and shows no totals', async () => {
      await mountMeals(baseMeals());
      await act(async () => typeInto(env.window, q('input[aria-label="Search meals by food name"]') as HTMLInputElement, 'yoghurt'));
      const h = all('section h4');
      assert.equal(h.length, 1, 'only the day that still has matches');
      const header = headerOf(h[0]);
      assert.match(header, /1 of 2 meals shown/);
      assert.doesNotMatch(header, /\d\s*cal\b|protein|carbs/);
    });

    test('calorie sort is a flat list: no day groups or totals, the date shows on each row, and a note says why', async () => {
      await mountMeals(baseMeals());
      const sort = all('button').find((b) => b.textContent?.trim() === 'Calories')!;
      await clickEl(sort);
      assert.equal(all('section').length, 0, 'no day groups');
      assert.match(all('[role="status"]').map((el) => text(el)).join(' '), /Day grouping and daily totals are off/);
      const rows = all('li');
      assert.equal(rows.length, 3);
      assert.match(text(rows[0]), /Pasta/, 'highest calories first');
      assert.ok(text(rows[0]).includes(formatShortDay(addDaysIso(todayIso, -1), todayIso)), 'date is shown inline');
      assert.doesNotMatch(text(doc().body), /860 cal/);
    });

    test('paging keeps whole days together and says how many days are on the page', async () => {
      const ten = Array.from({ length: 10 }, (_, i) => meal(`d${i}`, `Meal day ${i}`, addDaysIso(todayIso, -i), '12:00', 500, 30, 50));
      await mountMeals(ten);
      assert.equal(all('section').length, 7);
      assert.match(text(q('nav[aria-label="Pagination"]')), /Days 1–7 of 10/);
      await clickEl(byLabel('Next page'));
      assert.equal(all('section').length, 3);
      assert.match(text(q('nav[aria-label="Pagination"]')), /Days 8–10 of 10/);

      // A very busy day is never cut in half, and its totals stay the whole day's totals.
      await root0unmount();
      const busy = [
        ...Array.from({ length: 35 }, (_, i) => meal(`b${i}`, `Snack ${i}`, todayIso, `${String(i % 24).padStart(2, '0')}:00`, 10, 1, 1)),
        meal('o1', 'Other 1', addDaysIso(todayIso, -1), '12:00', 100),
        meal('o2', 'Other 2', addDaysIso(todayIso, -2), '12:00', 100),
      ];
      await mountMeals(busy);
      const sections = all('section');
      assert.equal(sections.length, 1, 'page 1 is the busy day alone');
      assert.equal(sections[0].querySelectorAll('li').length, 35);
      assert.match(headerOf(sections[0].querySelector('h4')!), /350 cal.*35 meals/);
      await clickEl(byLabel('Next page'));
      assert.equal(all('section').length, 2);
    });

    test('wide screens: aligned columns, inline icon actions, no disclosure buttons', async () => {
      setViewport(1280);
      await mountMeals(baseMeals());
      assert.equal(all('li button[aria-expanded]:not([aria-haspopup])').length, 0, 'wide rows are not disclosures');
      const columns = text(q('[aria-hidden="true"].border-b'));
      assert.match(columns, /Time.*Food.*Protein.*Carbs.*Calories/);
      const actions = byLabel('Actions for Chicken rice bowl')!;
      assert.ok(actions, 'inline actions are in the row without opening anything');
      assert.deepEqual(
        [...actions.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
        ['Copy Chicken rice bowl to form', 'Pin Chicken rice bowl to quick add', 'Edit Chicken rice bowl', 'Delete Chicken rice bowl'],
      );
      // Unknown macros read as "not logged", never as 0.
      const yoghurt = all('li').find((li) => li.textContent?.includes('Greek yoghurt'))!;
      assert.match(text(yoghurt), /carbs not logged/);
      assert.doesNotMatch(text(yoghurt), /0 g carbs/);
    });
  });

  // Small helper used above: unmount the first mounted list so a second one can start clean.
  const root0unmount = async () => {
    const root = roots.shift();
    if (root) await act(async () => root.unmount());
    env.window.document.body.innerHTML = '';
  };

  const NOTES =
    'Start:18:00 End:18:55 | 1.Bench press: W:5@20kg S1:12@40kg@18:10 S2:10@40kg S3:8@42.5kg [note: felt heavy] | 2.Pull-ups: S1:8 S2:7';
  const baseSessions = () => [
    { id: 's2', exercise: 'Morning mobility', duration: 30, date: todayIso, start_time: '07:00' },
    { id: 's1', exercise: 'Push day', duration: 55, date: todayIso, start_time: '18:00', notes: NOTES },
    { id: 's3', exercise: 'Easy jog', duration: 25, date: addDaysIso(todayIso, -10), start_time: '08:00', notes: 'Easy jog, felt great' },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountGym = (sessions: any[], props: Record<string, unknown> = {}) =>
    mount(React.createElement(GymList, { sessions, onDelete: () => {}, onEdit: () => {}, onCreateTemplate: () => {}, ...props }));

  describe('Gym', () => {
    test('groups by week, newest first, and puts the later session first on the same day', async () => {
      await mountGym(baseSessions());
      const h = all('section h4');
      assert.ok(h.length >= 2);
      assert.match(text(h[0]), /^This week · /);
      const firstWeekRows = [...h[0].closest('section')!.querySelectorAll('li')];
      assert.equal(firstWeekRows.length, 2);
      assert.match(text(firstWeekRows[0]), /Push day/, 'start 18:00 comes before start 07:00');
      assert.match(text(firstWeekRows[1]), /Morning mobility/);
      assert.match(headerOf(h[0]), /2 workouts.*1 h 25 min/);
    });

    test('collapsed summary: title, date and time range, duration, counts, volume, preview; no raw set strings', async () => {
      await mountGym(baseSessions());
      const row = disclosure('Push day')!;
      assert.equal(row.getAttribute('aria-expanded'), 'false');
      assert.equal(row.querySelector('button'), null);
      const summary = text(row);
      assert.match(summary, /18:00–18:55/);
      assert.match(summary, /55 min/);
      assert.match(summary, /2 exercises/);
      assert.match(summary, /5 sets/);
      // 12x40 + 10x40 + 8x42.5 = 1,220; the two pull-up sets have no weight, so it is "at least".
      assert.match(summary, /1,220 kg volume/);
      assert.ok(row.querySelector('[aria-hidden="true"]') && text(row).includes('≥'), 'partial volume is marked "at least"');
      assert.match(summary, /Bench press, Pull-ups/);
      assert.doesNotMatch(summary, /S1:12@40kg/);
      assert.ok(row.querySelector(`time[datetime="${todayIso}"]`));
    });

    test('expanded: exercises and sets as Set / Reps / Weight tables, notes, quiet times; then the labelled tray', async () => {
      const templated: string[] = [];
      const edited: string[] = [];
      await mountGym(baseSessions(), { onCreateTemplate: (s: { id: string }) => templated.push(s.id), onEdit: (s: { id: string }) => edited.push(s.id) });
      await clickEl(disclosure('Push day'));
      assert.equal(disclosure('Push day')!.getAttribute('aria-expanded'), 'true');
      const panel = doc().getElementById(disclosure('Push day')!.getAttribute('aria-controls')!)!;
      const bench = [...panel.querySelectorAll('table')].find((t) => t.textContent?.includes('Set 1'))!;
      assert.match(text(bench.querySelector('caption')), /Sets for Bench press/);
      assert.deepEqual([...bench.querySelectorAll('thead th')].map((th) => text(th)), ['Set', 'Reps', 'Weight', 'Time']);
      const rows = [...bench.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => text(c)));
      assert.deepEqual(rows[0], ['Warm-up', '5', '20 kg', '']);
      assert.deepEqual(rows[1], ['Set 1', '12', '40 kg', '18:10']);
      assert.deepEqual(rows[3], ['Set 3', '8', '42.5 kg', '']);
      assert.match(text(panel), /felt heavy/);
      // A set logged without a weight reads as not recorded, not as 0 kg.
      assert.match(text(panel), /no weight recorded/);
      assert.doesNotMatch(text(panel), /S1:12@40kg|W:5@20kg/);

      const tray = byLabel('Actions for Push day')!;
      assert.deepEqual(
        [...tray.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
        ['Create template from Push day', 'Edit Push day', 'Delete Push day'],
      );
      await clickEl(byLabel('Create template from Push day'));
      await clickEl(byLabel('Edit Push day'));
      assert.deepEqual(templated, ['s1']);
      assert.deepEqual(edited, ['s1']);
    });

    test('unparseable notes are shown as plain text, and no counts are invented', async () => {
      await mountGym(baseSessions());
      const row = disclosure('Easy jog')!;
      assert.doesNotMatch(text(row), /exercise|sets/);
      await clickEl(row);
      const panel = doc().getElementById(row.getAttribute('aria-controls')!)!;
      assert.match(text(panel), /Notes/);
      assert.match(text(panel), /Easy jog, felt great/);
    });

    test('delete from the tray goes through the confirmation dialog', async () => {
      const deleted: string[] = [];
      await mountGym(baseSessions(), { onDelete: (id: string) => deleted.push(id) });
      await clickEl(disclosure('Morning mobility'));
      await clickEl(byLabel('Delete Morning mobility'));
      await flush(10);
      assert.ok(q('[role="alertdialog"]'));
      assert.deepEqual(deleted, []);
      await flush(400);
      await clickEl(all('[role="alertdialog"] button').find((b) => b.textContent?.includes('Yes, delete')));
      await flush(30);
      assert.deepEqual(deleted, ['s2']);
    });

    test('filtered lists say how much of the week is shown instead of presenting a subset as the week', async () => {
      const everything = baseSessions();
      await mountGym([everything[1]], { allSessions: everything });
      assert.match(text(q('[role="status"]')), /Showing 1 of 3 workouts/);
      assert.match(headerOf(all('section h4')[0]), /1 of 2 workouts shown/);
      assert.doesNotMatch(headerOf(all('section h4')[0]), /min/);
    });

    test('empty states tell "nothing logged" apart from "nothing matches"', async () => {
      await mountGym([]);
      assert.match(text(doc().body), /No workouts logged yet/);
      await root0unmount();
      await mountGym([], { allSessions: baseSessions() });
      assert.match(text(doc().body), /No workouts match your filters/);
    });

    test('wide screens: table row with aligned stats, a disclosure only where there is something to open, inline actions', async () => {
      setViewport(1280);
      await mountGym(baseSessions());
      const columns = text(q('[aria-hidden="true"].border-b'));
      assert.match(columns, /Date.*Workout.*Time.*Duration.*Exercises.*Sets.*Volume/);
      assert.ok(disclosure('Push day'), 'a workout with notes can open');
      assert.equal(disclosure('Morning mobility'), undefined, 'a workout with no notes is a plain row');
      const actions = byLabel('Actions for Push day')!;
      assert.ok(actions, 'inline actions beside the row, outside the disclosure button');
      assert.equal(disclosure('Push day')!.contains(actions), false);
      assert.deepEqual(
        [...actions.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
        ['Create template from Push day', 'Edit Push day', 'Delete Push day'],
      );
      await clickEl(disclosure('Push day'));
      assert.equal(byLabel('Actions for Push day'), actions, 'opening details does not add a second action set');
    });
  });
});
