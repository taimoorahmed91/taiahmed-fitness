import { describe, test, beforeAll as before, afterAll as after, afterEach, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep, typeInto } from './support/domHarness';

// Mounted behaviour of the grouped Weight / Waist / Sleep and WHOOP history (real DOM, own process), plus the
// WHOOP edit dialog. Run through tests/laneBMountedRunner.test.ts, or:
//   JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/bodyHistoryLists.dom.tsx
const JSDOM = await loadJsdom();
if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

describe('mounted: body and WHOOP history', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let MetricHistoryList: any, WhoopHistoryList: any, TooltipProvider: any, EditWhoopEntryDialog: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sleepBand: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
    ({ MetricHistoryList } = await import('../../src/components/history/MetricHistoryList'));
    ({ WhoopHistoryList } = await import('../../src/components/history/WhoopHistoryList'));
    ({ TooltipProvider } = await import('../../src/components/ui/tooltip'));
    ({ EditWhoopEntryDialog } = await import('../../src/components/EditWhoopEntryDialog'));
    ({ sleepBand } = await import('../../src/lib/bodyHistory'));
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
  beforeEach(() => setViewport(390));
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

  // ---------------------------------------------------------------- Weight / Waist / Sleep
  type W = { id: string; date: string; weight: number; notes?: string };
  const weights: W[] = [
    { id: 'w4', date: '2026-10-29', weight: 70.4, notes: 'After a long walk' },
    { id: 'w3', date: '2026-10-27', weight: 70 },
    { id: 'w2', date: '2026-10-20', weight: 70.9 },
    { id: 'w1', date: '2026-09-30', weight: 71.2 },
  ];
  const getWeight = (e: W) => e.weight;
  const monthFacts = (items: W[]) => {
    const values = items.map((e) => e.weight);
    return items.length >= 2 ? [`Range ${Math.min(...values)}–${Math.max(...values)} kg`] : [];
  };

  const mountWeight = (props: Record<string, unknown> = {}) =>
    mount(
      React.createElement(MetricHistoryList, {
        entries: weights, allEntries: weights, sortOrder: null, sortName: 'weight', getValue: getWeight,
        valueLabel: 'Weight', unit: 'kg', spokenUnit: 'kilograms', entryNoun: 'weight entry',
        countNoun: { one: 'entry', many: 'entries' }, showChange: true, monthFacts,
        deleteTitle: 'Delete weight entry?', deleteDescription: (e: W) => `Delete ${e.weight} kg on ${e.date}?`,
        onEdit: () => {}, onDelete: () => {}, ...props,
      }),
    );

  describe('Weight (shared metric list)', () => {
    test('groups by month, newest first, with a <time> month and plain facts', async () => {
      await mountWeight();
      const h = headings();
      assert.deepEqual(h, ['October 2026', 'September 2026']);
      assert.ok(q('section h4 time[datetime="2026-10"]'));
      const [oct, sep] = all('section h4');
      assert.match(headerOf(oct), /3 entries/);
      assert.match(headerOf(oct), /Range 70–70\.9 kg/);
      assert.match(headerOf(sep), /1 entry/);
      assert.doesNotMatch(headerOf(sep), /Range/);
    });

    test('phone row: date-led, big right-aligned value, neutral change, notes; one disclosure button, no nested buttons', async () => {
      await mountWeight();
      const row = disclosure('70.4')!;
      assert.ok(row);
      assert.equal(row.getAttribute('aria-expanded'), 'false');
      assert.equal(row.querySelector('button'), null);
      const summary = text(row);
      assert.match(summary, /29/);
      assert.match(summary, /\+0\.4 kg since Oct 27/);
      assert.match(summary, /After a long walk/);
      assert.ok(row.querySelector('time[datetime="2026-10-29"]'), 'semantic <time> with the real date');
      // No colour carries a verdict on the change: nothing in the row uses a chart or destructive colour.
      assert.equal(row.querySelector('[class*="text-chart"], [class*="text-destructive"], [class*="bg-chart"]'), null);
    });

    test('opening a row explains the change in words and shows the labelled Edit / Delete tray', async () => {
      const edited: string[] = [];
      await mountWeight({ onEdit: (e: W) => edited.push(e.id) });
      await clickEl(disclosure('70.4'));
      const panel = doc().getElementById(disclosure('70.4')!.getAttribute('aria-controls')!)!;
      assert.match(text(panel), /Up 0\.4 kilograms since Oct 27 \(2 days earlier\)\./);
      const tray = byLabel('Actions for weight entry from 2026-10-29')!;
      assert.deepEqual(
        [...tray.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
        ['Edit weight entry from 2026-10-29', 'Delete weight entry from 2026-10-29'],
      );
      await clickEl(byLabel('Edit weight entry from 2026-10-29'));
      assert.deepEqual(edited, ['w4']);
    });

    test('delete from the tray goes through the ConfirmDeleteButton dialog', async () => {
      const deleted: string[] = [];
      await mountWeight({ onDelete: (id: string) => deleted.push(id) });
      await clickEl(disclosure('70.4'));
      await clickEl(byLabel('Delete weight entry from 2026-10-29'));
      await flush(10);
      assert.ok(q('[role="alertdialog"]'));
      assert.deepEqual(deleted, []);
      await flush(400);
      await clickEl(all('[role="alertdialog"] button').find((b) => b.textContent?.includes('Yes, delete')));
      await flush(30);
      assert.deepEqual(deleted, ['w4']);
    });

    test('the oldest entry says "First entry"; a change is measured against ALL entries even when a filter hides some', async () => {
      await mountWeight();
      assert.match(text(disclosure('71.2')), /First entry/);
      await root0unmount();
      await mountWeight({ entries: [weights[0]] });
      const row = disclosure('70.4')!;
      assert.match(text(row), /\+0\.4 kg since Oct 27/, 'still compared with the real previous entry');
      const [oct] = all('section h4');
      assert.match(headerOf(oct), /1 of 3 entries shown/);
      assert.doesNotMatch(headerOf(oct), /Range/, 'no subset facts presented as the month');
    });

    test('value sort is a flat list with the month on each row and a note saying why', async () => {
      await mountWeight({ sortOrder: 'desc' });
      assert.equal(all('section').length, 0);
      assert.match(all('[role="status"]').map((e) => text(e)).join(' '), /Sorted by weight \(highest first\)\. Month grouping is off/);
      const rows = all('li');
      assert.equal(rows.length, 4);
      assert.match(text(rows[0]), /71\.2/);
      assert.match(text(rows[0]), /Sep/);
    });

    test('months are paged whole: three per page, and the pager says which months', async () => {
      const many: W[] = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, date: `2026-0${5 - i}-10`, weight: 70 + i }));
      await mountWeight({ entries: many, allEntries: many });
      assert.equal(all('section').length, 3);
      assert.match(text(q('nav[aria-label="Pagination"]')), /Months 1–3 of 5/);
      await clickEl(byLabel('Next page'));
      assert.equal(all('section').length, 2);
      assert.match(text(q('nav[aria-label="Pagination"]')), /Months 4–5 of 5/);
    });

    test('dates never shift: the last day of a month stays in its month and keeps its number', async () => {
      const edge: W[] = [{ id: 'e1', date: '2026-10-31', weight: 70 }, { id: 'e2', date: '2026-11-01', weight: 71 }];
      await mountWeight({ entries: edge, allEntries: edge });
      assert.deepEqual(headings(), ['November 2026', 'October 2026']);
      const oct31 = disclosure('70')!;
      assert.ok(oct31.querySelector('time[datetime="2026-10-31"]'));
      assert.match(text(oct31.querySelector('time')), /^31Sat/);
    });

    test('wide screens: aligned Date / Weight / Change / Notes columns, inline actions, a disclosure only for long notes', async () => {
      setViewport(1280);
      const long = 'x'.repeat(120);
      const data: W[] = [{ id: 'a', date: '2026-10-29', weight: 70.4, notes: long }, { id: 'b', date: '2026-10-27', weight: 70, notes: 'short' }];
      await mountWeight({ entries: data, allEntries: data });
      assert.match(text(q('[aria-hidden="true"].border-y')), /DateWeightChangeNotes/);
      const actions = byLabel('Actions for weight entry from 2026-10-29')!;
      assert.ok(actions, 'inline actions without opening anything');
      assert.deepEqual(
        [...actions.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
        ['Edit weight entry from 2026-10-29', 'Delete weight entry from 2026-10-29'],
      );
      assert.ok(disclosure('xxxx'), 'long notes can be opened to read in full');
      assert.equal(disclosure('short'), undefined, 'short notes sit in the row');
      assert.equal(disclosure('xxxx')!.contains(actions), false, 'actions are outside the disclosure button');
      assert.match(text(all('li')[0]), /\+0\.4 kg/);
      assert.match(text(all('li')[1]), /First entry/);
    });
  });

  const root0unmount = async () => {
    const root = roots.shift();
    if (root) await act(async () => root.unmount());
    env.window.document.body.innerHTML = '';
  };

  describe('Sleep (shared metric list with bands)', () => {
    type S = { id: string; date: string; hours: number; notes?: string };
    const nights: S[] = [
      { id: 's3', date: '2026-10-29', hours: 7.5 },
      { id: 's2', date: '2026-10-28', hours: 6.5, notes: 'Woke twice' },
      { id: 's1', date: '2026-10-27', hours: 5 },
    ];
    const getHours = (e: S) => e.hours;
    const mountSleep = (props: Record<string, unknown> = {}) =>
      mount(
        React.createElement(MetricHistoryList, {
          entries: nights, allEntries: nights, sortOrder: null, sortName: 'hours', getValue: getHours,
          valueLabel: 'Hours', unit: 'h', spokenUnit: 'hours', entryNoun: 'sleep entry', countNoun: { one: 'night', many: 'nights' },
          band: (e: S) => sleepBand(e.hours),
          monthFacts: (items: S[]) => (items.length >= 3 ? [`Avg ${(items.reduce((s, e) => s + e.hours, 0) / items.length).toFixed(1)} h per night`] : []),
          deleteTitle: 'Delete sleep entry?', deleteDescription: () => 'Delete?', onEdit: () => {}, onDelete: () => {}, ...props,
        }),
      );

    test('every row carries its quality as a WORD (plus dot and border), and no change line', async () => {
      await mountSleep();
      const rows = all('li button[aria-expanded]:not([aria-haspopup])');
      assert.match(text(rows[0]), /Good/);
      assert.match(text(rows[1]), /Fair/);
      assert.match(text(rows[2]), /Poor/);
      for (const row of all('li button[aria-expanded]:not([aria-haspopup])')) {
        assert.doesNotMatch(text(row), /since/);
        const chip = row.querySelector('span.rounded-full')!;
        assert.ok(chip.querySelector('[aria-hidden="true"]'), 'dot is decorative');
        assert.match(chip.className, /border-chart-/);
        assert.match(chip.className, /text-foreground/);
      }
    });

    test('the band rule and its limits are written out when a row opens; the month average needs three nights', async () => {
      await mountSleep();
      const [oct] = all('section h4');
      assert.match(headerOf(oct), /3 nights/);
      assert.match(headerOf(oct), /Avg 6\.3 h per night/);
      await clickEl(disclosure('6.5'));
      const panel = doc().getElementById(disclosure('6.5')!.getAttribute('aria-controls')!)!;
      assert.match(text(panel), /Fair: 6 to under 7 hours\. Bands go by hours slept only\./);
      assert.ok(byLabel('Actions for sleep entry from 2026-10-28'));
      await root0unmount();
      await mountSleep({ entries: nights.slice(0, 2), allEntries: nights.slice(0, 2) });
      assert.doesNotMatch(headerOf(all('section h4')[0]), /Avg/, 'two nights are not an average');
    });

    test('wide screens: a Quality column with the word', async () => {
      setViewport(1280);
      await mountSleep();
      assert.match(text(q('[aria-hidden="true"].border-y')), /DateHoursQualityNotes/);
      assert.match(text(all('li')[0]), /Good/);
    });
  });

  describe('Sleep and Waist looks (variants)', () => {
    type S = { id: string; date: string; hours: number; notes?: string };
    const nights: S[] = [
      { id: 's3', date: '2026-10-29', hours: 7.5 },
      { id: 's2', date: '2026-10-28', hours: 6, notes: 'Woke twice' },
      { id: 's1', date: '2026-10-27', hours: 9.5 },
    ];
    const mountVariant = (variant: 'sleep' | 'measurement', props: Record<string, unknown> = {}) =>
      mount(
        React.createElement(MetricHistoryList, {
          entries: nights, allEntries: nights, sortOrder: null, sortName: 'hours', getValue: (e: S) => e.hours,
          valueLabel: 'Hours', unit: variant === 'sleep' ? 'h' : 'cm', spokenUnit: 'hours', entryNoun: 'entry',
          countNoun: { one: 'night', many: 'nights' }, variant,
          deleteTitle: 'Delete?', deleteDescription: () => 'Delete?', onEdit: () => {}, onDelete: () => {}, ...props,
        }),
      );

    test('a month stat sits on the band with a label, and only when the page supplies one for a month shown in full', async () => {
      const monthStat = (items: S[]) => (items.length >= 3 ? { value: '7.7', unit: 'h', label: 'avg per night' } : null);
      await mountVariant('sleep', { band: (e: S) => sleepBand(e.hours), monthStat });
      assert.match(headerOf(all('section h4')[0]), /7\.7 h avg per night/);
      await root0unmount();
      // A filter that hides part of the month removes the number rather than describing a subset.
      await mountVariant('sleep', { band: (e: S) => sleepBand(e.hours), monthStat, entries: nights.slice(0, 2) });
      assert.doesNotMatch(headerOf(all('section h4')[0]), /avg per night/);
      assert.match(headerOf(all('section h4')[0]), /2 of 3 nights shown/);
    });

    test('sleep rows draw a duration bar that is decoration only (hidden from screen readers, no text)', async () => {
      await mountVariant('sleep', { band: (e: S) => sleepBand(e.hours) });
      const bars = all('li [aria-hidden="true"].overflow-hidden');
      assert.equal(bars.length, 3);
      assert.deepEqual(bars.map((b) => (b.firstElementChild as HTMLElement).style.width), ['63%', '50%', '79%']);
      for (const bar of bars) assert.equal(text(bar), '');
    });

    test('a long night is "Long", never worded as poor, and keeps its word on the row', async () => {
      await mountVariant('sleep', { band: (e: S) => sleepBand(e.hours) });
      assert.match(text(disclosure('9.5')), /Long/);
    });

    test('measurement rows: the change is a neutral chip with an arrow and words, and no colour for good or bad', async () => {
      await mountVariant('measurement', { showChange: true });
      const row = disclosure('7.5')!;
      assert.match(text(row), /\+1\.5 cm since Oct 28/);
      assert.equal(row.querySelector('[class*="text-chart"], [class*="bg-chart"], [class*="text-destructive"], [class*="text-primary"]'), null);
      assert.ok(row.querySelector('svg[aria-hidden="true"]'), 'the arrow is decorative');
    });

    test('measurement groups draw a ruler axis made of decoration only', async () => {
      await mountVariant('measurement', { showChange: true });
      const slots = all('li [aria-hidden="true"].relative');
      assert.equal(slots.length, 3);
      for (const slot of slots) assert.equal(text(slot), '');
      assert.equal(all('li').length, 3);
    });

    test('a value-sorted measurement list is flat: no months and no axis', async () => {
      await mountVariant('measurement', { showChange: true, sortOrder: 'desc' });
      assert.equal(all('section').length, 0);
      assert.equal(all('li [aria-hidden="true"].relative').length, 0);
    });
  });

  // ---------------------------------------------------------------- WHOOP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whoop = (date: string, over: Record<string, unknown> = {}): any => ({
    id: `id-${date}`, date, created_at: '', cycle_end_timestamp: null,
    recovery_score: 78, hrv_rmssd_milli: 62, resting_heart_rate: 51, spo2_percentage: 96.5, skin_temp_celsius: 33.4,
    sleep_performance_percentage: 91, sleep_efficiency_percentage: 88, total_in_bed_hours: 8.1,
    total_rem_sleep_milli: 7_200_000, total_deep_sleep_milli: 5_400_000, total_light_sleep_milli: 14_400_000, total_awake_time_milli: 1_800_000,
    respiratory_rate: 15.2, disturbance_count: 3, sleep_cycle_count: 5, strain: 12.44, kilojoule: 8368,
    average_heart_rate: 68, max_heart_rate: 171, ...over,
  });
  // Week of Oct 26 (Mon) has 4 days, the week before has 2.
  const whoopEntries = [
    whoop('2026-10-29', { recovery_score: 78 }),
    whoop('2026-10-28', { recovery_score: 40, spo2_percentage: null }),
    whoop('2026-10-27', { recovery_score: 20 }),
    whoop('2026-10-26', { recovery_score: 60 }),
    whoop('2026-10-25', { recovery_score: 50 }),
    whoop('2026-10-24', { recovery_score: 90 }),
  ];
  const mountWhoop = (props: Record<string, unknown> = {}) =>
    mount(React.createElement(WhoopHistoryList, { entries: whoopEntries, onEdit: () => {}, onDelete: () => {}, ...props }));

  describe('WHOOP history', () => {
    test('weeks, newest first; averages only with 3+ days and always with their coverage; no band-less numbers', async () => {
      await mountWhoop();
      const h = all('section h4');
      assert.equal(h.length, 2);
      assert.match(text(h[0]), /^(This week|Last week|Week of Oct 26) · /);
      assert.ok(h[0].querySelector('time[datetime="2026-W44"]'));
      const first = headerOf(h[0]);
      assert.match(first, /4 days/);
      assert.match(first, /Avg recovery 50%/); // (78 + 40 + 20 + 60) / 4
      assert.match(first, /Avg HRV 62 ms/);
      assert.match(first, /Avg strain 12\.4/);
      const second = headerOf(h[1]);
      assert.match(second, /2 days/);
      assert.doesNotMatch(second, /Avg/, 'two days is not an average');
    });

    test('phone row: five core readings stay visible, with the recovery band as a word; secondary readings are tucked away', async () => {
      await mountWhoop();
      const row = disclosure('78')!;
      assert.equal(row.getAttribute('aria-expanded'), 'false');
      assert.equal(row.querySelector('button'), null);
      const summary = text(row);
      assert.match(summary, /Recovery78%/);
      assert.match(summary, /High/);
      assert.match(summary, /HRV62 ms/);
      assert.match(summary, /Sleep91%/);
      assert.match(summary, /Strain12\.4/);
      assert.doesNotMatch(summary, /SpO2|REM|Deep|Disturbances|Max HR/);
      assert.match(text(disclosure('40')), /Medium/);
      assert.match(text(disclosure('20')), /Low/);
      assert.ok(row.querySelector('time[datetime="2026-10-29"]'));
    });

    test('opening a row shows every one of the 19 readings, grouped, with unknown as "not recorded"; then the Edit / Delete tray', async () => {
      const edited: string[] = [];
      await mountWhoop({ onEdit: (e: { id: string }) => edited.push(e.id) });
      await clickEl(disclosure('40'));
      const panel = doc().getElementById(disclosure('40')!.getAttribute('aria-controls')!)!;
      assert.deepEqual(
        [...panel.querySelectorAll('[role="group"][aria-label]')].map((g) => g.getAttribute('aria-label')).filter((l) => /Recovery and body|^Sleep$|^Activity$/.test(l ?? '')),
        ['Recovery and body', 'Sleep', 'Activity'],
      );
      assert.equal(panel.querySelectorAll('dl dt').length, 19);
      const dt = (label: string) => [...panel.querySelectorAll('dt')].find((d) => d.textContent === label)!;
      assert.equal(text(dt('REM').nextElementSibling), '2.0 h');
      assert.equal(text(dt('Calories').nextElementSibling), '2000 cal');
      assert.equal(text(dt('Max HR').nextElementSibling), '171 bpm');
      assert.match(text(dt('SpO2').nextElementSibling), /SpO2 not recorded/);
      await clickEl(byLabel('Edit WHOOP entry from 2026-10-28'));
      assert.deepEqual(edited, ['id-2026-10-28']);
    });

    test('delete goes through the ConfirmDeleteButton dialog and keeps its wording', async () => {
      const deleted: string[] = [];
      await mountWhoop({ onDelete: (id: string) => deleted.push(id) });
      await clickEl(disclosure('40'));
      await clickEl(byLabel('Delete WHOOP entry from 2026-10-28'));
      await flush(10);
      assert.match(text(q('[role="alertdialog"]')), /delete all WHOOP measurements for 2026-10-28/);
      await flush(400);
      await clickEl(all('[role="alertdialog"] button').find((b) => b.textContent?.includes('Yes, delete')));
      await flush(30);
      assert.deepEqual(deleted, ['id-2026-10-28']);
    });

    test('wide screens: aligned core columns, every row opens to the full grid, actions sit outside the disclosure', async () => {
      setViewport(1280);
      await mountWhoop();
      assert.match(text(q('[aria-hidden="true"].border-y')), /DateRecoveryHRVResting HRSleepStrain/);
      const rows = all('li button[aria-expanded]:not([aria-haspopup])');
      assert.equal(rows.length, 6);
      const actions = byLabel('Actions for WHOOP entry from 2026-10-29')!;
      assert.ok(actions);
      assert.equal(rows[0].contains(actions), false);
      assert.match(text(rows[0]), /High/);
      assert.match(text(rows[0]), /51 bpm/);
      await clickEl(rows[0]);
      assert.equal(doc().getElementById(rows[0].getAttribute('aria-controls')!)!.querySelectorAll('dl dt').length, 19);
      assert.equal(byLabel('Actions for WHOOP entry from 2026-10-29'), actions, 'no second set of actions');
    });

    test('weeks are paged whole: four per page', async () => {
      const weeks = ['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21'].map((d) => whoop(d));
      await mountWhoop({ entries: weeks });
      assert.equal(all('section').length, 4);
      assert.match(text(q('nav[aria-label="Pagination"]')), /Weeks 1–4 of 6/);
      await clickEl(byLabel('Next page'));
      assert.equal(all('section').length, 2);
    });
  });

  describe('WHOOP edit dialog', () => {
    test('opens filled with the entry (it used to open empty), labels are tied to their fields, and Save sends numbers', async () => {
      const saved: unknown[] = [];
      let closed = 0;
      const entry = whoop('2026-10-29');
      await mount(
        React.createElement(EditWhoopEntryDialog, {
          entry, open: true, onOpenChange: (o: boolean) => { if (!o) closed++; },
          onSave: async (id: string, updates: unknown) => { saved.push({ id, updates }); },
        }),
      );
      await flush(10);
      const recovery = q('#whoop-edit-recovery_score') as HTMLInputElement;
      assert.equal(recovery.value, '78');
      assert.equal((q('#whoop-edit-date') as HTMLInputElement).value, '2026-10-29');
      assert.equal(q('label[for="whoop-edit-recovery_score"]')?.textContent, 'Recovery (%)');
      await act(async () => typeInto(env.window, recovery, '80'));
      await clickEl(all('button').find((b) => b.textContent === 'Save'));
      await flush(10);
      assert.equal(saved.length, 1);
      const sent = saved[0] as { id: string; updates: Record<string, unknown> };
      assert.equal(sent.id, entry.id);
      assert.equal(sent.updates.recovery_score, 80);
      assert.equal(sent.updates.hrv_rmssd_milli, 62, 'untouched readings are sent unchanged, not blanked');
      assert.equal(sent.updates.date, '2026-10-29');
      assert.equal(closed, 1);
    });
  });
});
