import { formatDMY } from '../../src/lib/dateFormat';
import { describe, test, mock, beforeAll as before, afterAll as after, afterEach, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import * as ReactNS from 'react';
import { click, installDom, loadJsdom, sleep, typeInto } from './support/domHarness';

// Selected day: Calendar address (?date=), the shared day panel, the safe Add / Edit note flow, and the day
// entry points on Calorie History (real DOM, own process).
// Run through tests/laneBMountedRunner.test.ts, or: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/selectedDayPanel.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

const day = (iso: string, delta: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = day(TODAY, -1);
const NO_RECORDS = '2024-02-29'; // a leap day with nothing logged
const NO_RECORDS_PREV = '2024-02-28';
const LATER = '2024-03-05';

type Table = 'meals' | 'gym_sessions' | 'weight' | 'waist' | 'sleep' | 'daily_notes';
const TABLES: Table[] = ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'daily_notes'];
type Phase = 'loading' | 'ready' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: Record<string, any> = {};
const tableState = {} as Record<Table, { phase: Phase; refreshFailed: boolean }>;
const refetchCalls = {} as Record<Table, number>;
// Notes controller: what the mocked useDailyNotes hands the panel, and every save it receives.
const notesCtl = {
  userId: 'u1' as string | null,
  isDemo: false,
  saveCalls: [] as Array<{ date: string; tags: string[]; severity?: number | null; notes?: string }>,
  saveImpl: async (): Promise<boolean> => true,
};

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

const resetData = () => {
  TABLES.forEach((t) => {
    setPhase(t, 'ready');
    refetchCalls[t] = 0;
  });
  notesCtl.userId = 'u1';
  notesCtl.isDemo = false;
  notesCtl.saveCalls = [];
  notesCtl.saveImpl = async () => true;
  data.meals = [
    { id: 'm1', food: 'Oats', calories: 300, protein: 12, carbs: 50, time: '08:05', date: TODAY },
    { id: 'm2', food: 'Pasta', calories: 800, protein: 30, carbs: 100, time: '19:30', date: TODAY },
  ];
  data.gym = [{ id: 'g2', exercise: 'Push', duration: 50, date: YESTERDAY, notes: 'Start:18:00 End:18:50 | 1.Bench press: S1:12@42.5kg' }];
  data.weight = [{ id: 'w1', weight: 70.5, date: TODAY }];
  data.sleep = [];
  data.waist = [];
  data.notes = [{ id: 'n1', user_id: 'u1', date: TODAY, tags: ['Headache'], severity: 2, notes: '  mild, keep exactly  ', created_at: 'c', updated_at: 'u1', }];
};
resetData();

const rows = (table: Table, list: unknown[]) => (tableState[table].phase === 'ready' ? list : []);
const refetchFor = (table: Table) => async () => {
  refetchCalls[table] += 1;
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
mock.module('@/hooks/useMeals', () => ({ useMeals: () => (useVersion(), { meals: rows('meals', data.meals), loading: false, refetch: refetchFor('meals') }) }));
mock.module('@/hooks/useGymSessions', () => ({ useGymSessions: () => (useVersion(), { sessions: rows('gym_sessions', data.gym), loading: false, refetch: refetchFor('gym_sessions') }) }));
mock.module('@/hooks/useWeight', () => ({ useWeight: () => (useVersion(), { entries: rows('weight', data.weight), loading: false, refetch: refetchFor('weight') }) }));
mock.module('@/hooks/useSleep', () => ({ useSleep: () => (useVersion(), { entries: rows('sleep', data.sleep), refetch: refetchFor('sleep') }) }));
mock.module('@/hooks/useWaist', () => ({ useWaist: () => (useVersion(), { entries: rows('waist', data.waist), refetch: refetchFor('waist') }) }));
mock.module('@/hooks/useDailyNotes', () => ({
  SYMPTOM_TAGS: ['Headache', 'Fatigue', 'Travel'],
  useDailyNotes: () => (
    useVersion(),
    {
      notes: rows('daily_notes', data.notes),
      refetch: refetchFor('daily_notes'),
      saveNote: async (input: { date: string; tags: string[]; severity?: number | null; notes?: string }) => {
        notesCtl.saveCalls.push(input);
        return notesCtl.saveImpl();
      },
      userId: notesCtl.userId,
      isDemo: notesCtl.isDemo,
    }
  ),
}));
// Calorie History's own inputs.
const personal = { target_weight_kg: null, protein_multiplier: 1.6, protein_multiplier_max: 2, carb_multiplier: 3, carb_multiplier_max: 4, workout_days: [], workout_day_templates: {}, gym_day_calorie_target: null, gym_day_calorie_target_max: null, rest_day_calorie_target: 1800, rest_day_calorie_target_max: 2200 };
mock.module('@/hooks/useExtraActivities', () => ({ useExtraActivities: () => ({ activities: [], loading: false }) }));
mock.module('@/hooks/usePersonalData', () => ({ usePersonalData: () => ({ data: personal, loading: false }) }));
mock.module('@/hooks/useUserSettings', () => ({ useUserSettings: () => ({ settings: { daily_calorie_goal: 2000 } }) }));
mock.module('@/hooks/useWhoopData', () => ({ useWhoopData: () => ({ entries: [], loading: false }) }));

describe('mounted: selected day, Calendar address and safe notes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any, React: any, createRoot: any, act: any, TooltipProvider: any, Router: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];
  // Updated by <Probe/> on every render: where the router is, and a way to move it like Back / a link.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nav: any;
  let loc = { pathname: '', search: '' };

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    Router = await import('react-router-dom');
  });
  beforeEach(() => resetData());
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });
  after(() => env?.window.close());

  const doc = () => env.window.document as Document;
  const all = (sel: string) => [...doc().querySelectorAll<HTMLElement>(sel)];
  const q = (sel: string) => doc().querySelector<HTMLElement>(sel);
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (ms = 20) => act(async () => { await sleep(ms); });
  const clickEl = async (el: Element | null | undefined) => {
    assert.ok(el, 'element to click exists');
    await act(async () => click(env.window, el!));
  };
  const longDay = (iso: string) => formatDMY(new Date(`${iso}T00:00:00Z`), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const monthLabel = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const byLabel = (label: string) => q(`[aria-label="${label}"]`);
  const dayButtons = () => all('[role="group"][aria-label^="Days of"] button');
  const dayButton = (iso: string) => dayButtons().find((b) => (b.getAttribute('aria-label') ?? '').startsWith(longDay(iso)))!;
  const detail = () => q('[data-day-detail]')!;
  const dialog = () => q('[role="dialog"]');
  const noteButton = (verb: 'Add' | 'Edit' | 'Add or edit', iso: string) => byLabel(`${verb} note for ${longDay(iso)}`) as HTMLButtonElement | null;
  const buttonWith = (scope: ParentNode, label: string) => [...scope.querySelectorAll<HTMLElement>('button')].find((b) => text(b).includes(label));
  // Compare elements with ok(===), never assert.equal: a failing equal tries to print a whole jsdom tree and hangs.
  const same = (a: unknown, b: unknown, msg?: string) => assert.ok(a === b, msg ?? 'expected the same element');
  const press = async (key: string) => act(async () => { (doc().activeElement ?? doc().body).dispatchEvent(new env.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });

  const Probe = () => {
    nav = Router.useNavigate();
    const l = Router.useLocation();
    loc = { pathname: l.pathname, search: l.search };
    return null;
  };
  const mountApp = async (entries: string[], index?: number) => {
    const Calendar = (await import('../../src/pages/Calendar')).default;
    const { ConnectedSelectedDayPanel } = await import('../../src/components/calendar/SelectedDayPanel');
    const host = doc().createElement('div');
    doc().body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const { MemoryRouter, Routes, Route } = Router;
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={entries} initialIndex={index ?? entries.length - 1}>
          <Probe />
          <TooltipProvider>
            <Routes>
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/other" element={<ConnectedSelectedDayPanel day={{ isoDate: NO_RECORDS }} />} />
            </Routes>
          </TooltipProvider>
        </MemoryRouter>,
      ),
    );
    await settle(5);
  };
  const go = async (to: string | number) => { await act(async () => { nav(to); }); await settle(5); };

  describe('Calendar address', () => {
    test('direct load of ?date= selects that day, shows its month, and keeps unrelated parameters', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS}&view=compact`]);
      assert.equal(text(q('#calendar-month-heading')), monthLabel(NO_RECORDS));
      assert.equal(dayButton(NO_RECORDS).getAttribute('aria-pressed'), 'true');
      assert.match(text(detail().querySelector('h2')), new RegExp(longDay(NO_RECORDS)));
      assert.equal(detail().getAttribute('data-day-detail'), NO_RECORDS);
      assert.equal(loc.search, `?date=${NO_RECORDS}&view=compact`, 'the address is untouched by loading');
    });

    test('a date with no records is stated plainly and still offers a note', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      assert.match(text(detail()), /Nothing logged on this day\./);
      same(detail().querySelector('h3'), null);
      assert.ok(noteButton('Add', NO_RECORDS), 'Add note for that exact day');
    });

    test('an invalid or impossible date falls back to UTC today and leaves the address alone', async () => {
      for (const bad of ['2025-02-29', '2026-02-30', '2026-13-01', 'today', '']) {
        await mountApp([`/calendar?date=${bad}&x=1`]);
        assert.equal(dayButton(TODAY).getAttribute('aria-pressed'), 'true', bad);
        assert.equal(text(q('#calendar-month-heading')), monthLabel(TODAY), bad);
        assert.equal(loc.search, `?date=${bad}&x=1`, 'not rewritten');
        for (const root of roots) await act(async () => root.unmount());
        roots = [];
        doc().body.innerHTML = '';
      }
    });

    test('with no date at all it starts on today, and picking a day writes the date and keeps other parameters', async () => {
      await mountApp(['/calendar?view=compact']);
      assert.equal(dayButton(TODAY).getAttribute('aria-pressed'), 'true');
      const other = `${TODAY.slice(0, 7)}-01`;
      if (other === TODAY) return;
      await clickEl(dayButton(other));
      assert.equal(loc.search, `?view=compact&date=${other}`);
      assert.equal(dayButton(other).getAttribute('aria-pressed'), 'true');
      assert.match(text(detail().querySelector('h2')), new RegExp(longDay(other)));
    });

    test('ordinary selection REPLACES history (Back leaves the page), an explicit link PUSHES', async () => {
      await mountApp(['/other', '/calendar?x=1']);
      const other = `${TODAY.slice(0, 7)}-01`;
      if (other !== TODAY) await clickEl(dayButton(other));
      await clickEl(byLabel('Next day'));
      await clickEl(byLabel('Previous day'));
      await go(-1);
      assert.equal(loc.pathname, '/other', 'three selections left no history entries behind');

      // From a page that embeds the panel, "Open in Calendar" is a push: Back returns there.
      const link = all('a').find((a) => text(a).startsWith('Open in Calendar'))!;
      assert.equal(link.getAttribute('href'), `/calendar?date=${NO_RECORDS}`);
      assert.equal(link.getAttribute('aria-label'), `Open ${longDay(NO_RECORDS)} in Calendar`);
      await clickEl(link);
      assert.equal(loc.pathname, '/calendar');
      assert.equal(loc.search, `?date=${NO_RECORDS}`);
      assert.equal(dayButton(NO_RECORDS).getAttribute('aria-pressed'), 'true');
      await go(-1);
      assert.equal(loc.pathname, '/other');
    });

    test('in-app navigation, Back and Forward each land on the right day and month', async () => {
      await mountApp(['/calendar']);
      await go(`/calendar?date=${NO_RECORDS}`);
      assert.equal(text(q('#calendar-month-heading')), monthLabel(NO_RECORDS));
      await go(`/calendar?date=${LATER}`);
      assert.equal(text(q('#calendar-month-heading')), monthLabel(LATER));
      assert.match(text(detail().querySelector('h2')), new RegExp(longDay(LATER)));
      await go(-1);
      assert.equal(text(q('#calendar-month-heading')), monthLabel(NO_RECORDS));
      assert.equal(dayButton(NO_RECORDS).getAttribute('aria-pressed'), 'true');
      await go(1);
      assert.equal(dayButton(LATER).getAttribute('aria-pressed'), 'true');
      assert.equal(text(q('#calendar-month-heading')), monthLabel(LATER));
    });

    test('paging months is view state: the address does not change, and a new selection brings the month back', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      await clickEl(byLabel('Next month'));
      assert.equal(text(q('#calendar-month-heading')), monthLabel(LATER));
      assert.equal(loc.search, `?date=${NO_RECORDS}`);
      assert.match(text(detail().querySelector('h2')), new RegExp(longDay(NO_RECORDS)), 'selection unchanged');
      await clickEl(byLabel('Next day'));
      assert.equal(loc.search, `?date=2024-03-01`);
      assert.equal(text(q('#calendar-month-heading')), monthLabel(LATER));
      // Back to the leap day: the old month paging does not come back with it.
      await go(-0);
      await go(`/calendar?date=${NO_RECORDS}`);
      assert.equal(text(q('#calendar-month-heading')), monthLabel(NO_RECORDS));
    });

    test('the Today button goes to UTC today and resets the month', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      await clickEl(buttonWith(doc().body, 'Today'));
      assert.equal(loc.search, `?date=${TODAY}`);
      assert.equal(dayButton(TODAY).getAttribute('aria-pressed'), 'true');
    });
  });

  describe('instance-safe day panels', () => {
    test('two panels on one page share no id, and each is labelled by its own heading', async () => {
      const { SelectedDayPanel } = await import('../../src/components/calendar/SelectedDayPanel');
      const host = doc().createElement('div');
      doc().body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      const common = { entries: [], today: TODAY, loading: false, filter: 'all', mode: 'ready', missing: [] };
      await act(async () =>
        root.render(
          <Router.MemoryRouter>
            <TooltipProvider>
              <SelectedDayPanel day={{ isoDate: TODAY }} {...common} />
              <SelectedDayPanel day={{ isoDate: YESTERDAY }} {...common} />
            </TooltipProvider>
          </Router.MemoryRouter>,
        ),
      );
      const ids = all('[id]').map((e) => e.id);
      assert.equal(ids.length, new Set(ids).size, `duplicate ids: ${ids.join(', ')}`);
      const sections = all('[data-day-detail]');
      assert.equal(sections.length, 2);
      for (const s of sections) {
        const heading = doc().getElementById(s.getAttribute('aria-labelledby')!)!;
        assert.ok(s.contains(heading) && heading.tagName === 'H2');
      }
      assert.notEqual(sections[0].getAttribute('aria-labelledby'), sections[1].getAttribute('aria-labelledby'));
      same(doc().getElementById('calendar-day-heading'), null, 'no fixed heading id any more');
      same(doc().getElementById('calendar-day-detail'), null, 'no fixed section id any more');
    });
  });

  describe('Add / Edit note', () => {
    test('Add: prefilled for the exact selected date, saves under that date, closes on success and focus returns to the button', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      const trigger = noteButton('Add', NO_RECORDS)!;
      await clickEl(trigger);
      const d = dialog()!;
      assert.ok(d, 'dialog opens');
      assert.match(text(d.querySelector('h2')), new RegExp(`Add note.*${longDay(NO_RECORDS)}`));
      assert.equal(d.querySelector('time')!.getAttribute('datetime'), NO_RECORDS);
      assert.ok(d.contains(doc().activeElement), 'focus moved into the dialog');
      assert.equal(d.querySelector('textarea')!.value, '');
      // Save needs a tag or text.
      assert.equal(buttonWith(d, 'Save')!.getAttribute('aria-disabled'), 'true');
      assert.match(text(doc().getElementById(buttonWith(d, 'Save')!.getAttribute('aria-describedby')!)), /Pick at least one tag/, 'the reason is tied to the button');
      await clickEl(buttonWith(d, 'Save'));
      assert.equal(notesCtl.saveCalls.length, 0);

      await clickEl(buttonWith(d, 'Fatigue'));
      await act(async () => typeInto(env.window, d.querySelector('textarea')!, 'slept badly'));
      await clickEl(d.querySelector('[aria-label="Severity 3 of 5"]'));
      await clickEl(buttonWith(d, 'Save'));
      await settle();
      assert.deepEqual(notesCtl.saveCalls, [{ date: NO_RECORDS, tags: ['Fatigue'], severity: 3, notes: 'slept badly' }]);
      same(dialog(), null, 'closed after a successful save');
      same(doc().activeElement, trigger, 'focus is back on the button that opened it');
    });

    test('Edit: an existing note shows Edit, starts from its exact content, and saves it unchanged under the same date', async () => {
      await mountApp([`/calendar?date=${TODAY}`]);
      same(noteButton('Add', TODAY), null);
      const trigger = noteButton('Edit', TODAY)!;
      assert.match(text(trigger), /Edit note/);
      await clickEl(trigger);
      const d = dialog()!;
      assert.match(text(d.querySelector('h2')), /Edit note/);
      assert.equal(buttonWith(d, 'Headache')!.getAttribute('aria-pressed'), 'true');
      assert.equal(buttonWith(d, 'Fatigue')!.getAttribute('aria-pressed'), 'false');
      assert.equal(d.querySelector('[aria-label="Severity 2 of 5"]')!.getAttribute('aria-pressed'), 'true');
      assert.equal(d.querySelector('textarea')!.value, '  mild, keep exactly  ');
      await clickEl(buttonWith(d, 'Save'));
      await settle();
      assert.deepEqual(notesCtl.saveCalls, [{ date: TODAY, tags: ['Headache'], severity: 2, notes: '  mild, keep exactly  ' }]);
      same(dialog(), null);
    });

    test('the existing note is found from the notes table, not from the filtered agenda', async () => {
      await mountApp([`/calendar?date=${TODAY}`]);
      const filter = byLabel('Filter calendar entries')!;
      await clickEl(filter);
      await clickEl(all('[role="option"]').find((o) => text(o) === 'Meals only'));
      assert.ok(noteButton('Edit', TODAY), 'still Edit even though notes are filtered out of the agenda');
    });

    test('a failed save keeps the dialog open with the draft and says so; a retry that works closes it', async () => {
      notesCtl.saveImpl = async () => false;
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      await clickEl(noteButton('Add', NO_RECORDS));
      const d = dialog()!;
      await clickEl(buttonWith(d, 'Travel'));
      await act(async () => typeInto(env.window, d.querySelector('textarea')!, 'long flight'));
      await clickEl(buttonWith(d, 'Save'));
      await settle();
      assert.ok(dialog(), 'still open');
      assert.match(text(d.querySelector('[role="alert"]')), /not saved.*still here/);
      assert.equal(d.querySelector('textarea')!.value, 'long flight');
      assert.equal(buttonWith(d, 'Travel')!.getAttribute('aria-pressed'), 'true');

      notesCtl.saveImpl = async () => { throw new Error('network'); };
      await clickEl(buttonWith(d, 'Save'));
      await settle();
      assert.ok(dialog(), 'a thrown error also keeps it open');
      assert.equal(d.querySelector('textarea')!.value, 'long flight');

      notesCtl.saveImpl = async () => true;
      await clickEl(buttonWith(d, 'Save'));
      await settle();
      same(dialog(), null);
      assert.equal(notesCtl.saveCalls.length, 3);
    });

    test('save is single-flight: a double tap saves once, and the dialog can not be dismissed mid-save', async () => {
      let release: (ok: boolean) => void = () => {};
      notesCtl.saveImpl = () => new Promise<boolean>((r) => { release = r; });
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      await clickEl(noteButton('Add', NO_RECORDS));
      const d = dialog()!;
      await clickEl(buttonWith(d, 'Fatigue'));
      await act(async () => { click(env.window, buttonWith(d, 'Save')!); click(env.window, buttonWith(d, 'Save')!); });
      assert.equal(notesCtl.saveCalls.length, 1, 'one save for two taps');
      assert.equal(buttonWith(d, 'Saving')!.getAttribute('aria-busy'), 'true');
      await clickEl(buttonWith(d, 'Cancel'));
      await press('Escape');
      assert.ok(dialog(), 'Cancel and Escape are ignored while saving');
      await act(async () => { release(true); await sleep(5); });
      same(dialog(), null);
      assert.equal(notesCtl.saveCalls.length, 1);
    });

    test('Escape and Cancel close without saving, and an outside tap never discards typed text', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      const trigger = noteButton('Add', NO_RECORDS)!;
      await clickEl(trigger);
      await press('Escape');
      await settle();
      same(dialog(), null);
      same(doc().activeElement, trigger, 'focus returns after Escape');
      assert.equal(notesCtl.saveCalls.length, 0);

      await clickEl(trigger);
      const d = dialog()!;
      await act(async () => typeInto(env.window, d.querySelector('textarea')!, 'half a thought'));
      const overlay = doc().querySelector('[data-state="open"].fixed.inset-0')!;
      await act(async () => {
        overlay.dispatchEvent(new env.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
        overlay.dispatchEvent(new env.window.MouseEvent('pointerup', { bubbles: true, cancelable: true }));
        click(env.window, overlay);
      });
      await settle();
      assert.ok(dialog(), 'typed text survives an outside tap');
      await clickEl(buttonWith(dialog()!, 'Cancel'));
      await settle();
      same(dialog(), null);
      same(doc().activeElement, trigger);
      // Cancelling discarded the draft: reopening starts empty.
      await clickEl(trigger);
      assert.equal(dialog()!.querySelector('textarea')!.value, '');
    });

    test('after a first save the same button becomes Edit and keeps focus', async () => {
      notesCtl.saveImpl = async () => {
        data.notes = [...data.notes, { id: 'n9', user_id: 'u1', date: NO_RECORDS, tags: ['Fatigue'], severity: null, notes: null, created_at: 'c', updated_at: 'u9' }];
        bump();
        return true;
      };
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      const trigger = noteButton('Add', NO_RECORDS)!;
      await clickEl(trigger);
      await clickEl(buttonWith(dialog()!, 'Fatigue'));
      await clickEl(buttonWith(dialog()!, 'Save'));
      await settle();
      same(dialog(), null);
      const after = noteButton('Edit', NO_RECORDS)!;
      same(after, trigger, 'same element, so focus is not lost');
      same(doc().activeElement, trigger);
    });

    test('a note that changes under the open editor blocks Save instead of being silently replaced', async () => {
      await mountApp([`/calendar?date=${TODAY}`]);
      await clickEl(noteButton('Edit', TODAY));
      await act(async () => typeInto(env.window, dialog()!.querySelector('textarea')!, 'my edit'));
      data.notes = [{ ...data.notes[0], notes: 'changed on my phone', updated_at: 'u2' }];
      await act(async () => bump());
      const d = dialog()!;
      assert.match(text(d.querySelector('[role="alert"]')), /changed while you were editing/);
      assert.equal(buttonWith(d, 'Save')!.getAttribute('aria-disabled'), 'true');
      await clickEl(buttonWith(d, 'Save'));
      assert.equal(notesCtl.saveCalls.length, 0);
      assert.equal(d.querySelector('textarea')!.value, 'my edit', 'the draft is kept');
    });

    test('notes that failed to load are UNKNOWN: no editing, a reason, and Try again reloads only notes', async () => {
      setPhase('daily_notes', 'error');
      await mountApp([`/calendar?date=${TODAY}`]);
      const trigger = noteButton('Add or edit', TODAY)!;
      assert.ok(trigger, 'neither Add nor Edit is claimed while it is unknown');
      same(noteButton('Add', TODAY), null);
      assert.equal(trigger.getAttribute('aria-disabled'), 'true');
      const reasonId = trigger.getAttribute('aria-describedby')!;
      assert.match(text(doc().getElementById(reasonId)), /didn't load.*overwritten/);
      await clickEl(trigger);
      same(dialog(), null, 'the dialog never opens');
      assert.equal(notesCtl.saveCalls.length, 0);
      const retry = all('button').find((b) => text(b) === 'Try again' && detail().contains(b))!;
      assert.ok(retry, 'a retry inside the day panel');
      setPhase('daily_notes', 'ready');
      await clickEl(retry);
      await settle();
      assert.ok(refetchCalls.daily_notes >= 1);
      assert.ok(noteButton('Edit', TODAY), 'once loaded, the real note is there to edit');
    });

    test('while notes are still loading the button waits and says so', async () => {
      setPhase('daily_notes', 'loading');
      await mountApp([`/calendar?date=${TODAY}`]);
      const trigger = noteButton('Add or edit', TODAY)!;
      assert.equal(trigger.getAttribute('aria-disabled'), 'true');
      assert.match(text(doc().getElementById(trigger.getAttribute('aria-describedby')!)), /Checking whether this day already has a note/);
    });

    test('the demo account is view only: a clear reason, no dialog, no save', async () => {
      notesCtl.isDemo = true;
      await mountApp([`/calendar?date=${TODAY}`]);
      const trigger = noteButton('Edit', TODAY)!;
      assert.equal(trigger.getAttribute('aria-disabled'), 'true');
      assert.match(text(doc().getElementById(trigger.getAttribute('aria-describedby')!)), /demo account is view only/);
      assert.ok(trigger.querySelector('svg'), 'an icon as well as words');
      assert.ok(noteButton('Add', NO_RECORDS) === null);
      await clickEl(trigger);
      same(dialog(), null);
      assert.equal(notesCtl.saveCalls.length, 0);
    });

    test('a different account clears the open dialog and its draft', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS}`]);
      await clickEl(noteButton('Add', NO_RECORDS));
      await act(async () => typeInto(env.window, dialog()!.querySelector('textarea')!, 'private to account one'));
      notesCtl.userId = 'u2';
      await act(async () => bump());
      same(dialog(), null, 'dialog gone');
      await clickEl(noteButton('Add', NO_RECORDS));
      assert.equal(dialog()!.querySelector('textarea')!.value, '', 'no draft carried over');
      assert.equal(notesCtl.saveCalls.length, 0);
    });

    test('moving to another day (Back) closes the editor, so a draft can never be saved into the wrong day', async () => {
      await mountApp([`/calendar?date=${NO_RECORDS_PREV}`, `/calendar?date=${NO_RECORDS}`]);
      await clickEl(noteButton('Add', NO_RECORDS));
      await act(async () => typeInto(env.window, dialog()!.querySelector('textarea')!, 'for the 29th'));
      await go(-1);
      same(dialog(), null);
      assert.equal(notesCtl.saveCalls.length, 0);
      assert.match(text(detail().querySelector('h2')), new RegExp(longDay(NO_RECORDS_PREV)));
      assert.ok(noteButton('Add', NO_RECORDS_PREV));
    });
  });

  describe('day entry points', () => {
    test('adherence cells are real buttons: named with the status word, no colour-only cue, open that day', async () => {
      const { TargetAdherenceGrid } = await import('../../src/components/TargetAdherenceGrid');
      const mkRow = (date: string, calories: number) => ({ date, calories: { consumed: calories, target: { min: 1800, max: 2200 } }, protein: { consumed: 100, target: { min: 90, max: 120 } } });
      const opened: unknown[] = [];
      const host = doc().createElement('div');
      doc().body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      const rowsIn = [mkRow(TODAY, 2000), mkRow(YESTERDAY, 2600), mkRow(day(TODAY, -2), 1000)];
      await act(async () => root.render(<TargetAdherenceGrid rows={rowsIn} onOpenDay={(d: unknown) => opened.push(d)} />));
      const cells = all('li button');
      assert.equal(cells.length, 30);
      const todayCell = cells.find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${TODAY}:`))!;
      assert.equal(todayCell.getAttribute('aria-label'), `${TODAY}: On target. Open in Calendar`);
      assert.match(todayCell.className, /focus-visible:ring-2/);
      assert.match(cells.find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${YESTERDAY}:`))!.getAttribute('aria-label')!, /Over max/);
      assert.match(cells.find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${day(TODAY, -2)}:`))!.getAttribute('aria-label')!, /Under min/);
      assert.match(text(todayCell), /\d✓/, 'the day number and a glyph are drawn on the cell');
      await clickEl(todayCell);
      assert.deepEqual(opened, [{ isoDate: TODAY, origin: { kind: 'daily-aggregate', metric: 'calories', seriesKey: 'target-adherence' } }]);

      // Keyboard: a native button, so Enter / Space activate it with no extra code (a click is what the browser fires).
      assert.equal(todayCell.tagName, 'BUTTON');
      assert.equal(todayCell.getAttribute('type'), 'button');

      // Protein is a different metric in the contract.
      await clickEl(all('[role="radio"]').find((r) => text(r) === 'Protein'));
      await clickEl(all('li button').find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${TODAY}:`)));
      assert.equal((opened[1] as { origin: { metric: string } }).origin.metric, 'protein');
    });

    test('without a handler the cells stay plain (no buttons)', async () => {
      const { TargetAdherenceGrid } = await import('../../src/components/TargetAdherenceGrid');
      const host = doc().createElement('div');
      doc().body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      await act(async () => root.render(<TargetAdherenceGrid rows={[{ date: TODAY, calories: { consumed: 2000, target: { min: 1800, max: 2200 } }, protein: { consumed: 100, target: null } }]} />));
      assert.equal(all('li button').length, 0);
      assert.equal(all('ul[aria-label$="oldest first"] > li').length, 30);
    });

    test('Calorie History: the adherence grid and every day row open that day in the Calendar (push)', async () => {
      data.meals = [
        { id: 'm1', food: 'Oats', calories: 2000, protein: 100, carbs: 200, time: '08:05', date: TODAY },
        { id: 'm3', food: 'Rice', calories: 1900, protein: 90, carbs: 220, time: '12:05', date: YESTERDAY },
      ];
      data.gym = [];
      data.weight = [];
      const CalorieHistory = (await import('../../src/pages/CalorieHistory')).default;
      const host = doc().createElement('div');
      doc().body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      const { MemoryRouter, Routes, Route } = Router;
      await act(async () =>
        root.render(
          <MemoryRouter initialEntries={['/calorie-history']}>
            <Probe />
            <TooltipProvider>
              <Routes>
                <Route path="/calorie-history" element={<CalorieHistory />} />
                <Route path="/calendar" element={<div>calendar page</div>} />
              </Routes>
            </TooltipProvider>
          </MemoryRouter>,
        ),
      );
      await settle(5);
      const open = all('button').filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Open ') && /in Calendar$/.test(b.getAttribute('aria-label')!) && /Open day/.test(text(b)));
      assert.equal(open.length, 2, 'one per day row');
      assert.equal(open[0].getAttribute('aria-label'), `Open ${longDay(TODAY)} in Calendar`);
      await clickEl(open[0]);
      assert.equal(loc.pathname, '/calendar');
      assert.equal(loc.search, `?date=${TODAY}`);
      await go(-1);
      assert.equal(loc.pathname, '/calorie-history', 'Back returns to Calorie History');

      const cell = all('li button').find((b) => (b.getAttribute('aria-label') ?? '').startsWith(`${YESTERDAY}:`))!;
      assert.match(cell.getAttribute('aria-label')!, /Open in Calendar$/);
      await clickEl(cell);
      assert.equal(loc.search, `?date=${YESTERDAY}`);
    });
  });
});
