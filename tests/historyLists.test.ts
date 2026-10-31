import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  addDaysIso,
  dayDiff,
  formatClock,
  formatDay,
  formatShortDay,
  formatWeekRange,
  isValidIsoDay,
  isoDayToMs,
  isoWeekString,
  relativeDayLabel,
  weekStartIso,
  weekTitle,
} from '../src/lib/historyDates';
import { clampPage, packGroupsIntoPages, pageGroupRange } from '../src/lib/historyPaging';
import {
  countMealsByDate,
  describeMacroTotal,
  describeMealDay,
  groupMealsByDate,
  sortMealsByCalories,
  sortMealsNewestFirst,
  summarizeMealDay,
} from '../src/lib/mealHistory';
import {
  countSessionsByWeek,
  describeTrainedDays,
  trainedDays,
  formatKg,
  formatMinutes,
  groupSessionsByWeek,
  sortSessionsNewestFirst,
  summarizeSession,
  summarizeWeek,
} from '../src/lib/workoutHistory';
import type { GymSession, Meal } from '../src/types';

const meal = (id: string, date: string, time: string, calories: number, protein?: number | null, carbs?: number | null): Meal => ({
  id, food: `Food ${id}`, calories, protein, carbs, date, time,
});
const session = (id: string, date: string, extra: Partial<GymSession> = {}): GymSession => ({
  id, exercise: `Workout ${id}`, duration: 45, date, ...extra,
});

describe('history dates: calendar days never shift', () => {
  test('a YYYY-MM-DD day formats as that same day', () => {
    assert.equal(formatDay('2026-10-30', '2026-10-30'), 'Fri, Oct 30');
    assert.equal(formatShortDay('2026-01-01', '2026-06-01'), 'Jan 1');
    assert.equal(formatDay('2026-03-01', '2026-03-01'), 'Sun, Mar 1');
  });
  test('the year shows only when it is not the current year', () => {
    assert.equal(formatDay('2025-12-31', '2026-01-02'), 'Wed, Dec 31, 2025');
    assert.equal(formatShortDay('2025-12-31', '2026-01-02'), 'Dec 31, 2025');
  });
  test('does not shift the day in a timezone west of UTC (the new Date("YYYY-MM-DD") bug)', () => {
    for (const tz of ['America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Kiritimati', 'Europe/Warsaw']) {
      const out = spawnSync(
        process.execPath,
        ['-e', "import { formatDay, weekStartIso } from './src/lib/historyDates.ts'; console.log(formatDay('2026-10-30', '2026-10-30') + '|' + weekStartIso('2026-11-01'))"],
        { cwd: new URL('../', import.meta.url).pathname, env: { ...process.env, TZ: tz }, encoding: 'utf8' },
      );
      assert.equal(out.stdout.trim(), 'Fri, Oct 30|2026-10-26', `${tz}: ${out.stdout}${out.stderr}`);
    }
  });
  test('invalid days are reported, not guessed', () => {
    assert.equal(isValidIsoDay('2026-02-30'), false);
    assert.equal(isValidIsoDay('not a date'), false);
    assert.equal(isoDayToMs(''), null);
    assert.equal(formatDay('garbage', '2026-01-01'), 'garbage');
    assert.equal(dayDiff('2026-01-01', 'nope'), null);
  });
  test('Today / Yesterday only for those two days', () => {
    assert.equal(relativeDayLabel('2026-10-30', '2026-10-30'), 'Today');
    assert.equal(relativeDayLabel('2026-10-29', '2026-10-30'), 'Yesterday');
    assert.equal(relativeDayLabel('2026-10-28', '2026-10-30'), null);
    assert.equal(relativeDayLabel('2026-10-31', '2026-10-30'), null);
  });
  test('addDaysIso crosses month and year ends', () => {
    assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
    assert.equal(addDaysIso('2026-03-01', -1), '2026-02-28');
    assert.equal(addDaysIso('2024-03-01', -1), '2024-02-29');
  });
});

describe('history dates: weeks run Monday to Sunday', () => {
  test('week start', () => {
    assert.equal(weekStartIso('2026-10-26'), '2026-10-26'); // Monday
    assert.equal(weekStartIso('2026-10-30'), '2026-10-26'); // Friday
    assert.equal(weekStartIso('2026-11-01'), '2026-10-26'); // Sunday belongs to the week before Monday 2 Nov
    assert.equal(weekStartIso('2026-11-02'), '2026-11-02');
  });
  test('ISO week string for <time dateTime>', () => {
    assert.equal(isoWeekString('2026-10-26'), '2026-W44');
    assert.equal(isoWeekString('2024-12-30'), '2025-W01');
    assert.equal(isoWeekString('2021-01-04'), '2021-W01');
    assert.equal(isoWeekString('2020-12-28'), '2020-W53');
  });
  test('titles and ranges', () => {
    assert.equal(weekTitle('2026-10-26', '2026-10-30'), 'This week');
    assert.equal(weekTitle('2026-10-19', '2026-10-30'), 'Last week');
    assert.equal(weekTitle('2026-10-05', '2026-10-30'), 'Week of Oct 5');
    assert.equal(formatWeekRange('2026-10-26', '2026-10-30'), 'Oct 26 – Nov 1');
    assert.equal(formatWeekRange('2026-12-28', '2026-12-30'), 'Dec 28, 2026 – Jan 3, 2027');
  });
});

describe('history dates: clock text', () => {
  test('clock strings are normalised', () => {
    assert.equal(formatClock('9:05'), '09:05');
    assert.equal(formatClock('09:30:00'), '09:30');
    assert.equal(formatClock(''), null);
    assert.equal(formatClock(undefined), null);
    assert.equal(formatClock('soon'), null);
  });
  test('a stored end timestamp is shown as wall-clock time in the given zone', () => {
    assert.equal(formatClock('2026-10-30T09:15:00.000Z', 'UTC'), '09:15');
    assert.equal(formatClock('2026-10-30T09:15:00.000Z', 'Europe/Warsaw'), '10:15');
  });
});

describe('history paging never splits a group', () => {
  const group = (key: string, n: number) => ({ key, items: Array.from({ length: n }, (_, i) => i) });
  test('closes a page at maxGroups', () => {
    const pages = packGroupsIntoPages(Array.from({ length: 10 }, (_, i) => group(`g${i}`, 1)), { maxGroups: 7, targetItems: 100 });
    assert.deepEqual(pages.map((p) => p.length), [7, 3]);
  });
  test('closes a page once the row target is reached, keeping the big group whole', () => {
    const pages = packGroupsIntoPages([group('a', 2), group('b', 40), group('c', 1)], { maxGroups: 7, targetItems: 30 });
    assert.deepEqual(pages.map((p) => p.map((g) => g.key)), [['a', 'b'], ['c']]);
    assert.equal(pages[0][1].items.length, 40);
  });
  test('empty input gives no pages and an empty range', () => {
    assert.deepEqual(packGroupsIntoPages([], { maxGroups: 7, targetItems: 30 }), []);
    assert.deepEqual(pageGroupRange([], 1), { from: 0, to: 0, total: 0 });
  });
  test('range counts groups across pages and clamps the page', () => {
    const pages = packGroupsIntoPages(Array.from({ length: 10 }, (_, i) => group(`g${i}`, 1)), { maxGroups: 7, targetItems: 100 });
    assert.deepEqual(pageGroupRange(pages, 2), { from: 8, to: 10, total: 10 });
    assert.deepEqual(pageGroupRange(pages, 99), { from: 8, to: 10, total: 10 });
    assert.equal(clampPage(0, 3), 1);
    assert.equal(clampPage(9, 3), 3);
    assert.equal(clampPage(Number.NaN, 3), 1);
  });
});

describe('meal day grouping and totals', () => {
  const meals = [
    meal('a', '2026-10-29', '08:00', 300, 20, 30),
    meal('b', '2026-10-30', '09:00', 400, 25, null),
    meal('c', '2026-10-30', '13:30', 600, null, null),
    meal('d', '2026-10-30', '13:30', 100, 0, 5),
  ];
  test('newest day first, latest time first within a day', () => {
    const sorted = sortMealsNewestFirst(meals);
    assert.deepEqual(sorted.map((m) => m.id), ['c', 'd', 'b', 'a']);
  });
  test('groups by calendar date and counts per date', () => {
    const groups = groupMealsByDate(sortMealsNewestFirst(meals));
    assert.deepEqual(groups.map((g) => [g.date, g.items.length]), [['2026-10-30', 3], ['2026-10-29', 1]]);
    assert.deepEqual(countMealsByDate(meals), { '2026-10-29': 1, '2026-10-30': 3 });
  });
  test('missing macros are unknown, not zero; zero that was logged counts as logged', () => {
    const totals = summarizeMealDay(meals.filter((m) => m.date === '2026-10-30'));
    assert.equal(totals.calories, 1100);
    assert.deepEqual(totals.protein, { total: 25, logged: 2, of: 3, complete: false });
    assert.deepEqual(totals.carbs, { total: 5, logged: 1, of: 3, complete: false });
    assert.equal(describeMacroTotal('protein', totals.protein), '25 g protein (2 of 3 meals)');
  });
  test('a fully logged macro is a plain total; a macro nobody logged is hidden', () => {
    const day = summarizeMealDay([meal('x', '2026-10-01', '08:00', 100, 10.25, null), meal('y', '2026-10-01', '09:00', 100, 20, null)]);
    assert.equal(describeMacroTotal('protein', day.protein), '30.3 g protein');
    assert.equal(describeMacroTotal('carbs', day.carbs), null);
    assert.equal(describeMacroTotal('protein', summarizeMealDay([]).protein), null);
  });
  test('with filters active a day is described as "N of M shown", never as totals', () => {
    const shown = [meals[1]];
    assert.deepEqual(describeMealDay(shown, 3, true), { kind: 'filtered', shown: 1, ofDay: 3 });
    assert.equal(describeMealDay(shown, 1, false).kind, 'totals');
  });
  test('calorie sort is flat and orders by calories', () => {
    assert.deepEqual(sortMealsByCalories(meals, 'desc').map((m) => m.id), ['c', 'b', 'a', 'd']);
    assert.deepEqual(sortMealsByCalories(meals, 'asc').map((m) => m.id), ['d', 'a', 'b', 'c']);
  });
});

describe('workout week grouping and summaries', () => {
  test('same-day sessions: latest start first; no start time sorts last; ties keep their order', () => {
    const sorted = sortSessionsNewestFirst([
      session('early', '2026-10-30', { start_time: '07:00' }),
      session('none', '2026-10-30'),
      session('late', '2026-10-30', { start_time: '18:30:00' }),
      session('older', '2026-10-29', { start_time: '23:00' }),
      session('none2', '2026-10-30'),
    ]);
    assert.deepEqual(sorted.map((s) => s.id), ['late', 'early', 'none', 'none2', 'older']);
  });
  test('groups by Monday-to-Sunday week, newest first', () => {
    const groups = groupSessionsByWeek(sortSessionsNewestFirst([
      session('sun', '2026-11-01'),
      session('mon', '2026-10-26'),
      session('next', '2026-11-02'),
      session('prev', '2026-10-25'),
    ]));
    assert.deepEqual(groups.map((g) => [g.weekStart, g.items.map((s) => s.id)]), [
      ['2026-11-02', ['next']],
      ['2026-10-26', ['sun', 'mon']],
      ['2026-10-19', ['prev']],
    ]);
    assert.deepEqual(countSessionsByWeek([session('a', '2026-10-26'), session('b', '2026-10-31')]), { '2026-10-26': 2 });
  });
  test('summary uses saved times, end timestamp, then times inside the notes', () => {
    const withTimes = summarizeSession(session('1', '2026-10-30', { start_time: '09:30', end_time: '2026-10-30T09:15:00Z', notes: '1.Bench: S1:10@40kg' }));
    assert.match(withTimes.timeRange ?? '', /^09:30–\d{2}:\d{2}$/);
    const fromNotes = summarizeSession(session('2', '2026-10-30', { notes: 'Start:09:30 End:10:15 | 1.Bench: S1:10@40kg' }));
    assert.equal(fromNotes.timeRange, '09:30–10:15');
    assert.equal(summarizeSession(session('3', '2026-10-30', { start_time: '07:05:00' })).timeRange, '07:05');
    assert.equal(summarizeSession(session('4', '2026-10-30')).timeRange, null);
  });
  test('duration of 0 is unknown, not "0 min"', () => {
    assert.equal(summarizeSession(session('z', '2026-10-30', { duration: 0 })).minutes, null);
  });
  test('formatting', () => {
    assert.equal(formatMinutes(45), '45 min');
    assert.equal(formatMinutes(120), '2 h');
    assert.equal(formatMinutes(135), '2 h 15 min');
    assert.equal(formatKg(8450), '8,450 kg');
    assert.equal(formatKg(52.5), '52.5 kg');
    assert.deepEqual(summarizeWeek([session('a', '2026-10-26', { duration: 40 }), session('b', '2026-10-27', { duration: 35 })]), { count: 2, minutes: 75 });
    assert.deepEqual(summarizeWeek([session('a', '2026-10-26', { duration: 0 })]), { count: 1, minutes: null });
  });
});

describe('workout week pattern', () => {
  test('marks the days of a Monday-to-Sunday week that have a workout; two workouts on one day count once', () => {
    const days = trainedDays(
      [session('a', '2026-10-26'), session('b', '2026-10-28'), session('c', '2026-10-28'), session('d', '2026-11-01')],
      '2026-10-26',
    );
    assert.deepEqual(days, [true, false, true, false, false, false, true]);
  });
  test('ignores sessions that fall outside the week and bad dates', () => {
    assert.deepEqual(trainedDays([session('a', '2026-10-25'), session('b', '2026-11-02'), session('c', 'nope')], '2026-10-26'), [false, false, false, false, false, false, false]);
  });
  test('describes the days in words for screen readers', () => {
    assert.equal(describeTrainedDays([true, false, true, false, true, false, false]), 'Monday, Wednesday and Friday');
    assert.equal(describeTrainedDays([false, false, false, false, false, false, true]), 'Sunday');
    assert.equal(describeTrainedDays([false, false, false, false, false, false, false]), null);
  });
});
