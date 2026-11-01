import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep } from './support/domHarness';

// Mounted behaviour of "history for this exercise" opened from an expanded saved workout (real DOM, own process).
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/exerciseHistory.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

describe('mounted: exercise history from a saved workout', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GymList: any, PersonalRecordsList: any, ExerciseHistoryDialog: any, TooltipProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  let ALIAS_KEY = '';

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ GymList } = await import('../../src/components/GymList'));
    ({ PersonalRecordsList } = await import('../../src/components/PersonalRecordsList'));
    ({ ExerciseHistoryDialog } = await import('../../src/components/ExerciseHistoryDialog'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    ({ EXERCISE_ALIAS_STORAGE_KEY: ALIAS_KEY } = await import('../../src/lib/exerciseAliases'));
  });

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
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });
  const clickEl = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click exists');
    await act(async () => click(env.window, el!));
  };
  const disclosure = (label: string) => all('li button[aria-expanded]:not([aria-haspopup])').find((b) => b.textContent?.includes(label));
  const historyButton = (name: string) => q(`button[aria-label="Show history for ${name}"]`);
  const dialog = () => q('[role="dialog"]');
  const pressEscape = async () => {
    await act(async () => {
      (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await flush(20);
  };

  const PUSH = '1.Bench press: W:5@20kg S1:12@40kg@18:10 S2:10@40kg | 2.Pull-ups: S1:8 S2:7 | 3.Seated Row: S1:10@60kg | 4.Plank: W:1@5kg';
  const mkSession = (id: string, date: string, notes: string, extra: Record<string, unknown> = {}) => ({ id, exercise: 'Push day', duration: 50, date, notes, ...extra });
  const sessionsFixture = () => [
    mkSession('new', '2026-10-15', PUSH, { start_time: '18:00' }),
    mkSession('mid-a', '2026-10-08', '1.Bench press: S1:10@45kg', { start_time: '07:00' }),
    mkSession('mid-b', '2026-10-08', '1.Bench press: S1:5@60kg', { start_time: '19:00', exercise: 'Evening push' }),
    mkSession('old', '2026-10-01', '1.Seated Row: S1:10@50kg | 2.Cable Row: S1:8@52.5kg'),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mountGym = (sessions: any[], props: Record<string, unknown> = {}) =>
    mount(React.createElement(GymList, { sessions, onDelete: () => {}, onEdit: () => {}, onCreateTemplate: () => {}, ...props }));
  const expand = async (label: string) => {
    await clickEl(disclosure(label));
    assert.equal(disclosure(label)!.getAttribute('aria-expanded'), 'true');
  };
  const marked = () => all('[role="dialog"] li[aria-current="true"]');

  for (const [width, label] of [[390, 'phone'], [1280, 'desktop']] as const) {
    test(`${label}: weighted exercises are buttons; unweighted and warm-up-only ones are plain text; none sit inside the disclosure button`, async () => {
      setViewport(width);
      await mountGym(sessionsFixture());
      await expand('Push day');
      const buttons = all('button[aria-label^="Show history for"]');
      assert.deepEqual(buttons.map((b) => b.getAttribute('aria-label')), ['Show history for Bench press', 'Show history for Seated Row']);
      for (const b of buttons) {
        assert.equal(b.getAttribute('aria-haspopup'), 'dialog');
        assert.equal(b.closest('button[aria-expanded]'), null, 'not nested in a button');
        assert.match(b.className, /min-h-11/, '44px touch target');
        assert.ok(text(b).includes('History'));
      }
      assert.equal(all('button').filter((b) => /Pull-ups|Plank/.test(b.getAttribute('aria-label') ?? '')).length, 0);
      // The names are still in the saved order, with their numbers.
      const names = all('table caption').map((c) => text(c));
      assert.deepEqual(names, ['Sets for Bench press', 'Sets for Pull-ups', 'Sets for Seated Row', 'Sets for Plank']);
      // Disclosure itself still holds no nested button.
      assert.equal(disclosure('Push day')!.querySelector('button'), null);
    });
  }

  test('click opens the dialog with all history, marks this exact workout in text, and Escape returns focus to the exercise button', async () => {
    const all4 = sessionsFixture();
    // Filtered list shows only the newest workout; history still reads every saved workout.
    await mountGym([all4[0]], { allSessions: all4 });
    await expand('Push day');
    const opener = historyButton('Bench press')!;
    opener.focus();
    await clickEl(opener);
    await flush(10);
    const d = dialog();
    assert.ok(d, 'dialog is open');
    assert.match(text(d!.querySelector('h2')), /^Bench press$/);
    const items = all('[role="dialog"] ol li');
    assert.equal(items.length, 3, 'three workouts have Bench press sets: newest first');
    assert.match(text(items[0]), /2026-10-15/);
    assert.match(text(items[0]), /This workout/);
    assert.match(text(items[0]), /S1: 12 @ 40kg · S2: 10 @ 40kg/);
    assert.doesNotMatch(text(items[1]) + text(items[2]), /This workout/);
    assert.equal(marked().length, 1);
    assert.equal(items[0].getAttribute('aria-current'), 'true');
    assert.match(text(d!), /Shows only sets saved under exactly this name/);
    assert.match(text(d!), /kept on this device only, not in your account/);
    // Visible/accessible summary of the same data.
    assert.ok(d!.querySelector('figure'), 'uses the shared chart figure');
    assert.match(text(d!.querySelector('[data-chart-summary]')), /Chart summary/);
    assert.match(d!.querySelector('figure')!.textContent ?? '', /This workout, 2026-10-15/);
    await pressEscape();
    assert.equal(dialog(), null, 'Escape closes');
    assert.equal(doc().activeElement, historyButton('Bench press'), 'focus returns to the exercise button');
  });

  test('two workouts on the same date: only the session it was opened from is marked', async () => {
    const list = sessionsFixture();
    await mountGym(list);
    await expand('Evening push');
    await clickEl(historyButton('Bench press'));
    await flush(10);
    const items = all('[role="dialog"] ol li');
    assert.equal(marked().length, 1);
    const mark = marked()[0];
    assert.match(text(mark), /2026-10-08/);
    assert.match(text(mark), /Evening push/);
    assert.match(text(mark), /5 @ 60kg/);
    const other = items.find((li) => /10 @ 45kg/.test(text(li)))!;
    assert.doesNotMatch(text(other), /This workout/);
    await pressEscape();
  });

  test('the close button also closes and returns focus', async () => {
    await mountGym(sessionsFixture());
    await expand('Push day');
    await clickEl(historyButton('Seated Row'));
    await flush(10);
    await clickEl(q('button[aria-label="Close exercise history"]'));
    await flush(20);
    assert.equal(dialog(), null);
    assert.equal(doc().activeElement, historyButton('Seated Row'));
  });

  test('merged names: history includes the other name, says so, and follows a merge made elsewhere', async () => {
    const list = sessionsFixture();
    await mountGym(list);
    await expand('Push day');
    await clickEl(historyButton('Seated Row'));
    await flush(10);
    // No merge yet: only sets saved as "Seated Row".
    assert.equal(all('[role="dialog"] ol li').length, 2);
    assert.match(text(dialog()), /Shows only sets saved under exactly this name/);
    await pressEscape();
    // Another tab merges the names: the storage event reaches the open list, no reload.
    env.window.localStorage.setItem(ALIAS_KEY, JSON.stringify({ 'Seated Row': 'Cable Row' }));
    await act(async () => { env.window.dispatchEvent(new env.window.StorageEvent('storage', { key: ALIAS_KEY })); });
    await clickEl(historyButton('Seated Row'));
    await flush(10);
    const d = dialog()!;
    assert.match(text(d.querySelector('h2')), /^Cable Row$/);
    assert.match(text(d), /Seated Row is merged into Cable Row on this device/);
    assert.match(text(d), /Includes sets saved as Seated Row/);
    assert.equal(all('[role="dialog"] ol li').length, 2);
    assert.equal(marked().length, 1);
  });

  test('a merge made on the Records tab is used by the workout detail (one storage path)', async () => {
    const list = [
      mkSession('a', '2026-10-01', '1.Seated Row: S1:10@60kg'),
      mkSession('b', '2026-10-05', '1.Cable Row: S1:8@55kg'),
    ];
    await mount(React.createElement(React.Fragment, null,
      React.createElement(PersonalRecordsList, { sessions: list, templates: [] }),
      React.createElement(GymList, { sessions: list, onDelete: () => {}, onEdit: () => {} }),
    ));
    const mergeBtn = all('button').find((b) => /Merge names/.test(text(b)));
    await clickEl(mergeBtn);
    await clickEl(all('button').find((b) => text(b) === 'Cable Row'));
    await clickEl(all('button').find((b) => text(b) === 'Seated Row'));
    await clickEl(all('button').find((b) => /^Merge 2/.test(text(b))));
    assert.deepEqual(JSON.parse(env.window.localStorage.getItem(ALIAS_KEY)!), { 'Seated Row': 'Cable Row' });
    await expand('Push day');
    // The first workout in the list is the newest (b, Cable Row); expand it and open its history.
    await clickEl(historyButton('Cable Row'));
    await flush(10);
    assert.equal(all('[role="dialog"] ol li').length, 2, 'both names are one history');
    assert.match(text(dialog()), /Includes sets saved as Seated Row/);
  });

  test('a workout with only bodyweight sets has no history buttons at all', async () => {
    await mountGym([mkSession('bw', '2026-10-01', '1.Pull-ups: S1:8 S2:7 | 2.Push-ups: S1:20')]);
    await expand('Push day');
    assert.equal(all('button[aria-label^="Show history for"]').length, 0);
    assert.ok(q('table'), 'sets still shown');
  });

  test('read only: opening and closing history changes no data and calls no callbacks', async () => {
    const calls: string[] = [];
    const list = sessionsFixture();
    const before = JSON.stringify(list);
    await mountGym(list, { onDelete: () => calls.push('delete'), onEdit: () => calls.push('edit'), onCreateTemplate: () => calls.push('template') });
    await expand('Push day');
    await clickEl(historyButton('Bench press'));
    await flush(10);
    await pressEscape();
    assert.deepEqual(calls, []);
    assert.equal(JSON.stringify(list), before);
    assert.equal(env.window.localStorage.getItem(ALIAS_KEY), null);
  });

  test('dialog with no weighted history says so and still states the device limit', async () => {
    await mount(React.createElement(ExerciseHistoryDialog, { exercise: 'Deadlift', sessions: sessionsFixture(), aliases: {}, onClose: () => {} }));
    await flush(10);
    const d = dialog()!;
    assert.match(text(d), /No weighted sets logged yet/);
    assert.match(text(d), /Looked for: Deadlift/);
    assert.match(text(d), /not in your account/);
    assert.equal(d.querySelector('figure'), null);
    assert.equal(marked().length, 0);
  });
});
