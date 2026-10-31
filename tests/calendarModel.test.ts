import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_TABLES,
  buildAgenda,
  buildMonthGrid,
  dayAriaLabel,
  daysInMonth,
  describeDayTotals,
  formatBriefDay,
  formatLongDay,
  formatMonthLabel,
  groupEntriesByDate,
  joinTableLabels,
  monthSubtitle,
  requiredTables,
  resolveCalendarAvailability,
  monthOf,
  monthStats,
  shiftMonth,
  splitForCell,
  stepDay,
  summarizeDay,
  toIsoDay,
  type CalendarSources,
  type CalendarTable,
  type DayEntry,
} from '../src/components/calendar/calendarModel';

const note = (over = {}) => ({ id: 'n1', user_id: 'u', date: '2026-10-30', tags: ['Headache'], severity: 3, notes: 'after lunch', created_at: '', updated_at: '', ...over });
const sources = (over: Partial<CalendarSources> = {}): CalendarSources => ({
  meals: [
    { id: 'm2', food: 'Pasta', calories: 800, protein: 30, carbs: 100, time: '19:30', date: '2026-10-30' },
    { id: 'm1', food: 'Oats', calories: 350.4, protein: null, carbs: null, time: '08:05:00', date: '2026-10-30' },
    { id: 'm3', food: 'Toast', calories: 200, time: '09:00', date: '2026-10-12' },
  ],
  sessions: [{ id: 'g1', exercise: 'Push', duration: 45, date: '2026-10-30' }],
  weight: [{ id: 'w1', weight: 70.5, date: '2026-10-30' }],
  sleep: [{ id: 's1', hours: 7.5, date: '2026-10-30' }],
  waist: [{ id: 'x1', waist: 81, date: '2026-09-30' }],
  notes: [note()],
  ...over,
});

describe('calendar: dates are built from numbers, never from local time', () => {
  test('ISO keys are zero padded', () => {
    assert.equal(toIsoDay(2026, 3, 4), '2026-03-04');
    assert.equal(toIsoDay(2026, 12, 31), '2026-12-31');
    assert.equal(monthOf('2026-10-30'), '2026-10');
  });
  test('month arithmetic crosses year ends both ways', () => {
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2027-01', -1), '2026-12');
    assert.equal(shiftMonth('2026-10', 0), '2026-10');
    assert.equal(shiftMonth('2026-10', 14), '2027-12');
    assert.equal(shiftMonth('nope', 1), 'nope');
  });
  test('month lengths, including leap years', () => {
    assert.equal(daysInMonth('2026-10'), 31);
    assert.equal(daysInMonth('2026-02'), 28);
    assert.equal(daysInMonth('2028-02'), 29);
    assert.equal(daysInMonth('2026-04'), 30);
  });
  test('labels name the right day in any process time zone', () => {
    const before = process.env.TZ;
    try {
      for (const tz of ['Pacific/Honolulu', 'UTC', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        assert.equal(formatLongDay('2026-10-30'), 'Friday, October 30, 2026', tz);
        assert.equal(formatBriefDay('2026-03-01'), 'Sun, Mar 1', tz);
        assert.equal(formatMonthLabel('2026-10'), 'October 2026', tz);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
  test('stepping a day crosses month and year ends', () => {
    assert.equal(stepDay('2026-10-31', 1), '2026-11-01');
    assert.equal(stepDay('2026-01-01', -1), '2025-12-31');
    assert.equal(stepDay('2028-02-28', 1), '2028-02-29');
  });
});

describe('calendar: the month grid', () => {
  test('October 2026 starts on a Thursday: four blank cells when weeks start on Sunday', () => {
    const g = buildMonthGrid('2026-10');
    assert.equal(g.leading, 4);
    assert.equal(g.trailing, 0);
    assert.equal((g.leading + g.days.length + g.trailing) % 7, 0);
    assert.equal(g.days.length, 31);
    assert.equal(g.days[0], '2026-10-01');
    assert.equal(g.days[30], '2026-10-31');
  });
  test('Monday-first moves the blanks', () => {
    assert.equal(buildMonthGrid('2026-10', 1).leading, 3);
    // November 2026 starts on a Sunday.
    assert.equal(buildMonthGrid('2026-11', 0).leading, 0);
    assert.equal(buildMonthGrid('2026-11', 1).leading, 6);
  });
  test('blanks around the days always make whole weeks of seven', () => {
    for (const month of ['2026-02', '2028-02', '2026-09', '2026-10', '2026-11', '2027-05']) {
      for (const start of [0, 1] as const) {
        const g = buildMonthGrid(month, start);
        assert.equal((g.leading + g.days.length + g.trailing) % 7, 0, `${month}/${start}`);
        assert.ok(g.trailing >= 0 && g.trailing < 7);
      }
    }
    // February 2026 is exactly four Sunday-first weeks.
    assert.deepEqual([buildMonthGrid('2026-02').leading, buildMonthGrid('2026-02').trailing], [0, 0]);
    assert.equal(buildMonthGrid('2026-09').leading, 2);
    assert.equal(buildMonthGrid('2026-09').trailing, 3);
  });
  test('every day key is a real, unique, ordered ISO day', () => {
    for (const month of ['2026-02', '2028-02', '2026-12', '2027-01']) {
      const g = buildMonthGrid(month);
      assert.equal(new Set(g.days).size, g.days.length);
      assert.deepEqual([...g.days].sort(), g.days);
      for (const d of g.days) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(g.days.every((d) => d.startsWith(month)));
    }
  });
  test('an invalid month yields an empty grid', () => {
    assert.deepEqual(buildMonthGrid('2026-13'), { leading: 0, days: [], trailing: 0 });
  });
});

describe('calendar: records by day', () => {
  test('all kinds land on their own date, in the saved order', () => {
    const map = groupEntriesByDate(sources(), 'all');
    assert.deepEqual(map.get('2026-10-30')!.map((e) => e.type), ['meal', 'meal', 'gym', 'weight', 'sleep', 'note']);
    assert.deepEqual(map.get('2026-10-12')!.map((e) => e.type), ['meal']);
    assert.deepEqual(map.get('2026-09-30')!.map((e) => e.type), ['waist']);
  });
  test('the filter limits which kinds appear', () => {
    assert.deepEqual([...groupEntriesByDate(sources(), 'gym').keys()], ['2026-10-30']);
    assert.deepEqual(groupEntriesByDate(sources(), 'waist').get('2026-09-30')!.map((e) => e.type), ['waist']);
    assert.equal(groupEntriesByDate(sources(), 'waist').has('2026-10-30'), false);
    assert.deepEqual(groupEntriesByDate(sources(), 'notes').get('2026-10-30')!.map((e) => e.type), ['note']);
  });
});

describe('calendar: day summaries only add up what was logged', () => {
  const day = (over?: Partial<CalendarSources>): DayEntry[] => groupEntriesByDate(sources(over), 'all').get('2026-10-30')!;

  test('five areas in a fixed order with short and long text', () => {
    const s = summarizeDay(day());
    assert.equal(s.total, 6);
    assert.deepEqual(s.groups.map((g) => g.group), ['meals', 'workouts', 'body', 'recovery', 'notes']);
    assert.deepEqual(s.groups.map((g) => g.short), ['1,150 cal', '45 min', '70.5 kg', '7.5 h', '1 note']);
    assert.equal(s.groups[0].long, '2 meals, 1,150 cal logged');
    assert.equal(s.groups[0].count, 2);
    assert.equal(s.groups[2].long, 'weight 70.5 kg');
  });
  test('an empty day has no groups', () => {
    assert.deepEqual(summarizeDay([]), { total: 0, groups: [] });
  });
  test('several weigh-ins are counted, not averaged or picked from', () => {
    const s = summarizeDay(day({ weight: [{ id: 'a', weight: 70, date: '2026-10-30' }, { id: 'b', weight: 71, date: '2026-10-30' }] }));
    const body = s.groups.find((g) => g.group === 'body')!;
    assert.equal(body.short, '2 logs');
    assert.equal(body.long, '2 weigh-ins');
  });
  test('weight and waist together keep weight as the short value', () => {
    const s = summarizeDay(day({ waist: [{ id: 'x', waist: 80.5, date: '2026-10-30' }] }));
    const body = s.groups.find((g) => g.group === 'body')!;
    assert.equal(body.short, '70.5 kg');
    assert.equal(body.long, 'weight 70.5 kg, waist 80.5 cm');
    assert.equal(body.count, 2);
  });
  test('a waist-only day shows the waist value', () => {
    const s = summarizeDay(groupEntriesByDate(sources(), 'waist').get('2026-09-30')!);
    assert.equal(s.groups[0].short, '81 cm');
  });
  test('two sleep logs are added and named as two logs', () => {
    const s = summarizeDay(day({ sleep: [{ id: 'a', hours: 6.5, date: '2026-10-30' }, { id: 'b', hours: 1.25, date: '2026-10-30' }] }));
    const r = s.groups.find((g) => g.group === 'recovery')!;
    assert.equal(r.short, '7.75 h');
    assert.equal(r.long, 'sleep 7.75 hours in 2 logs');
  });
  test('a non-number never becomes NaN in the text', () => {
    const s = summarizeDay([{ type: 'meal', data: { id: 'm', food: 'x', calories: Number.NaN, time: '12:00', date: '2026-10-30' } }]);
    assert.equal(s.groups[0].short, '0 cal');
    assert.equal(/NaN/.test(JSON.stringify(s)), false);
  });
});

describe('calendar: day button names and cell lines', () => {
  const entries = groupEntriesByDate(sources(), 'all').get('2026-10-30')!;
  test('weekday, date, today, then what was logged', () => {
    assert.equal(
      dayAriaLabel('2026-10-30', summarizeDay(entries), { today: '2026-10-30' }),
      'Friday, October 30, 2026, today, 6 entries: 2 meals, 1,150 cal logged; 1 workout, 45 min; weight 70.5 kg; sleep 7.5 hours; 1 note',
    );
  });
  test('an empty day says nothing was logged, but only once loaded', () => {
    assert.equal(dayAriaLabel('2026-10-29', summarizeDay([]), { today: '2026-10-30' }), 'Thursday, October 29, 2026, nothing logged');
    assert.equal(dayAriaLabel('2026-10-29', summarizeDay([]), { today: '2026-10-30', loading: true }), 'Thursday, October 29, 2026');
  });
  test('one entry is "1 entry"', () => {
    assert.match(dayAriaLabel('2026-10-12', summarizeDay(groupEntriesByDate(sources(), 'all').get('2026-10-12')!), { today: '2026-10-30' }), /1 entry: 1 meal, 200 cal logged$/);
  });
  test('a cell shows up to four lines; more collapses into "+N more" and still fits four lines', () => {
    const s = summarizeDay(entries);
    const { shown, more } = splitForCell(s);
    assert.equal(shown.length + (more > 0 ? 1 : 0), 4);
    assert.deepEqual(shown.map((g) => g.group), ['meals', 'workouts', 'body']);
    assert.equal(more, 2);
    // Exactly four areas fit without a "+N more" line.
    const four = splitForCell({ ...s, groups: s.groups.slice(0, 4) });
    assert.equal(four.more, 0);
    assert.equal(four.shown.length, 4);
    const few = splitForCell(summarizeDay(groupEntriesByDate(sources(), 'gym').get('2026-10-30')!));
    assert.equal(few.more, 0);
    assert.equal(few.shown.length, 1);
  });
});

describe('calendar: month numbers', () => {
  test('counts match what the old tiles counted', () => {
    const s = monthStats('2026-10', sources());
    assert.deepEqual(s, { daysLogged: 2, daysWithMeals: 2, workouts: 1, weighIns: 1, sleepLogs: 1, waistLogs: 0, notes: 1 });
  });
  test('days with meals counts days, not meals', () => {
    assert.equal(monthStats('2026-10', sources()).daysWithMeals, 2);
  });
  test('only that month counts (and December does not match "2026-1")', () => {
    assert.equal(monthStats('2026-09', sources()).waistLogs, 1);
    assert.equal(monthStats('2026-09', sources()).daysLogged, 1);
    assert.equal(monthStats('2026-12', sources()).daysLogged, 0);
  });
});

describe('calendar: the daily agenda', () => {
  const entries = groupEntriesByDate(sources(), 'all').get('2026-10-30')!;
  test('one section per area, in a fixed order, with totals as facts', () => {
    const sections = buildAgenda(entries);
    assert.deepEqual(sections.map((s) => s.heading), ['Meals', 'Workouts', 'Body', 'Recovery', 'Notes']);
    assert.deepEqual(sections[0].facts, ['2 meals, 1,150 cal logged']);
  });
  test('meals run in clock order whatever order they were saved in', () => {
    const meals = buildAgenda(entries)[0].items;
    assert.deepEqual(meals.map((m) => m.time), ['08:05', '19:30']);
    assert.deepEqual(meals.map((m) => m.title), ['Oats', 'Pasta']);
    assert.deepEqual(meals[1].details, ['800 cal', '30 g protein', '100 g carbs']);
    // Macros that were not logged are left out, not shown as 0.
    assert.deepEqual(meals[0].details, ['350.4 cal']);
  });
  test('a meal with no time goes last', () => {
    const e: DayEntry[] = [
      { type: 'meal', data: { id: 'a', food: 'A', calories: 1, time: '', date: 'd' } },
      { type: 'meal', data: { id: 'b', food: 'B', calories: 1, time: '07:00', date: 'd' } },
    ];
    assert.deepEqual(buildAgenda(e)[0].items.map((i) => i.title), ['B', 'A']);
  });
  test('notes show tags, severity and text; sleep, weight and waist show their units', () => {
    const sections = buildAgenda(entries);
    const notes = sections.find((s) => s.group === 'notes')!.items[0];
    assert.equal(notes.title, 'Headache');
    assert.deepEqual(notes.details, ['Severity 3/5', 'after lunch']);
    assert.equal(sections.find((s) => s.group === 'recovery')!.items[0].title, '7.5 hours');
    assert.equal(sections.find((s) => s.group === 'body')!.items[0].title, '70.5 kg');
    const waist = buildAgenda(groupEntriesByDate(sources(), 'waist').get('2026-09-30')!)[0].items[0];
    assert.equal(waist.title, 'Waist 81 cm');
  });
  test('a note with no tags still has a name', () => {
    const e: DayEntry[] = [{ type: 'note', data: note({ tags: [], severity: null, notes: null }) }];
    const item = buildAgenda(e)[0].items[0];
    assert.equal(item.title, 'Daily note');
    assert.deepEqual(item.details, []);
  });
  test('item keys are unique within a day', () => {
    const keys = buildAgenda(entries).flatMap((s) => s.items.map((i) => i.key));
    assert.equal(new Set(keys).size, keys.length);
  });
  test('an empty day has no sections', () => {
    assert.deepEqual(buildAgenda([]), []);
  });
});

describe('calendar: day sentence never claims too much', () => {
  test('loading is not "nothing logged"', () => {
    assert.equal(describeDayTotals(summarizeDay([]), true, 'all'), 'Loading entries…');
  });
  test('empty, filtered and populated', () => {
    assert.equal(describeDayTotals(summarizeDay([]), false, 'all'), 'Nothing logged on this day.');
    assert.equal(describeDayTotals(summarizeDay([]), false, 'gym'), 'No workout entries on this day.');
    const entries = groupEntriesByDate(sources(), 'all').get('2026-10-30')!;
    assert.equal(describeDayTotals(summarizeDay(entries), false, 'all'), '6 entries across 5 areas.');
    assert.equal(describeDayTotals(summarizeDay(groupEntriesByDate(sources(), 'gym').get('2026-10-30')!), false, 'gym'), '1 entry across 1 area.');
  });
});

const st = (phase: 'loading' | 'ready' | 'error', refreshFailed = false) => ({ phase, loadFailed: phase === 'error', refreshFailed, error: null }) as const;
const states = (over: Partial<Record<CalendarTable, ReturnType<typeof st>>> = {}) =>
  Object.fromEntries(CALENDAR_TABLES.map((t) => [t, over[t] ?? st('ready')])) as Record<CalendarTable, ReturnType<typeof st>>;

describe('calendar: loading vs failure vs empty vs stale', () => {
  test('every table loaded: ready, nothing missing (a day can then really be empty)', () => {
    const a = resolveCalendarAvailability('all', states());
    assert.deepEqual([a.mode, a.failed, a.loading, a.stale, a.missing], ['ready', [], [], [], []]);
  });
  test('a first load still running is "loading", not empty and not an error', () => {
    const a = resolveCalendarAvailability('all', states({ meals: st('loading'), sleep: st('loading') }));
    assert.equal(a.mode, 'loading');
    assert.deepEqual(a.missing, ['meals', 'sleep']);
  });
  test('every needed table failed: unavailable (grid, totals and agenda are paused)', () => {
    const all = Object.fromEntries(CALENDAR_TABLES.map((t) => [t, st('error')]));
    const a = resolveCalendarAvailability('all', states(all));
    assert.equal(a.mode, 'unavailable');
    assert.deepEqual(a.failed, [...CALENDAR_TABLES]);
  });
  test('failed plus still loading with nothing ready is also unavailable: an error wins at once', () => {
    const a = resolveCalendarAvailability('all', states({ meals: st('error'), gym_sessions: st('loading'), weight: st('loading'), waist: st('loading'), sleep: st('loading'), daily_notes: st('loading') }));
    assert.equal(a.mode, 'unavailable');
  });
  test('some failed, some loaded: partial, naming exactly the missing areas', () => {
    const a = resolveCalendarAvailability('all', states({ sleep: st('error'), daily_notes: st('error') }));
    assert.equal(a.mode, 'partial');
    assert.deepEqual(a.failed, ['sleep', 'daily_notes']);
    assert.equal(joinTableLabels(a.failed), 'sleep logs and notes');
    assert.equal(joinTableLabels(['meals']), 'meals');
    assert.equal(joinTableLabels(['meals', 'weight', 'daily_notes']), 'meals, weigh-ins and notes');
  });
  test('a failed refresh over loaded rows is stale and stays ready (rows kept)', () => {
    const a = resolveCalendarAvailability('all', states({ meals: st('ready', true) }));
    assert.equal(a.mode, 'ready');
    assert.deepEqual(a.stale, ['meals']);
    assert.deepEqual(a.missing, []);
  });
  test('a filter only needs its own table: other areas failing does not matter', () => {
    assert.deepEqual(requiredTables('all'), [...CALENDAR_TABLES]);
    assert.deepEqual(requiredTables('gym'), ['gym_sessions']);
    assert.deepEqual(requiredTables('notes'), ['daily_notes']);
    assert.deepEqual(requiredTables('waist'), ['waist']);
    const broken = states({ meals: st('error'), sleep: st('error') });
    assert.equal(resolveCalendarAvailability('gym', broken).mode, 'ready');
    assert.equal(resolveCalendarAvailability('meals', broken).mode, 'unavailable');
    assert.equal(resolveCalendarAvailability('all', broken).mode, 'partial');
  });
  test('the month line never states a count that is not true yet', () => {
    const subtitle = (m: Parameters<typeof states>[0]) => monthSubtitle(resolveCalendarAvailability('all', states(m)), 0);
    assert.equal(subtitle({ meals: st('loading') }), 'Loading…');
    assert.equal(subtitle(Object.fromEntries(CALENDAR_TABLES.map((t) => [t, st('error')]))), "Couldn't load your entries");
    assert.equal(subtitle({ sleep: st('error') }), 'Some entries are missing');
    assert.equal(subtitle({}), '0 days with entries');
    assert.equal(monthSubtitle(resolveCalendarAvailability('all', states()), 1), '1 day with entries');
  });
  test('a day with nothing in the loaded data is never called "nothing logged" while a table is missing', () => {
    const empty = summarizeDay([]);
    assert.equal(dayAriaLabel('2026-10-29', empty, { today: '2026-10-30', missing: ['sleep'] }), 'Thursday, October 29, 2026, no entries in the data that loaded');
    assert.equal(dayAriaLabel('2026-10-29', empty, { today: '2026-10-30', missing: [] }), 'Thursday, October 29, 2026, nothing logged');
    assert.equal(describeDayTotals(empty, false, 'all', ['sleep', 'daily_notes']), "Nothing found in the data that loaded. Couldn't load your sleep logs and notes.");
    assert.equal(/nothing logged/i.test(describeDayTotals(empty, false, 'all', ['sleep'])), false);
    assert.equal(describeDayTotals(empty, false, 'all', []), 'Nothing logged on this day.');
  });
  test('a day with entries still reports them and names what is missing', () => {
    const entries = groupEntriesByDate(sources(), 'all').get('2026-10-30')!;
    assert.equal(describeDayTotals(summarizeDay(entries), false, 'all', ['sleep']), "6 entries across 5 areas. Couldn't load your sleep logs.");
  });
});
