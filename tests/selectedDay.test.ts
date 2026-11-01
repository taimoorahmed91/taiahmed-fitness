import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_DATE_PARAM,
  buildCalendarHref,
  createSelectedDay,
  daysInIsoMonth,
  isLeapYear,
  isSameSelectedDay,
  isValidIsoDate,
  parseIsoDate,
  planDayNavigation,
  readCalendarDate,
  resolveCalendarDate,
  selectedDayKey,
  shouldReplaceHistory,
  utcIsoDate,
  withCalendarDate,
} from '../src/lib/selectedDay';
import { adherenceCellDay, calorieHistoryDay, openDayLabel } from '../src/lib/dayEntryAdapters';
import { readFileSync } from 'node:fs';
import { CALENDAR_PATH } from '../src/lib/routePaths';
import { ROUTES } from '../src/app/navigation';
import { formatBriefDay as libBrief, formatLongDay as libLong } from '../src/lib/dayDisplay';
import { formatBriefDay as modelBrief, formatLongDay as modelLong } from '../src/components/calendar/calendarModel';

describe('real ISO calendar dates (never rolled, never regex-only)', () => {
  test('accepts real dates, including leap days', () => {
    for (const d of ['2026-10-30', '2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01', '1000-01-01', '9999-12-31']) assert.equal(isValidIsoDate(d), true, d);
  });
  test('rejects impossible dates instead of rolling them forward', () => {
    for (const d of ['2026-02-30', '2025-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '2026-06-31', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32']) {
      assert.equal(isValidIsoDate(d), false, d);
      assert.equal(parseIsoDate(d), null, d);
    }
  });
  test('rejects anything that is not exactly YYYY-MM-DD', () => {
    for (const d of ['', ' 2026-10-30', '2026-10-30 ', '2026-1-3', '26-10-30', '2026/10/30', '2026-10-30T00:00:00Z', '2026-10-30T', '20261030', 'today', '0999-12-31', '10000-01-01', '０２０２６-10-30']) assert.equal(isValidIsoDate(d), false, JSON.stringify(d));
    for (const d of [null, undefined, 20261030, {}, ['2026-10-30']]) assert.equal(isValidIsoDate(d), false);
  });
  test('year, month and leap rules', () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(1900), false);
    assert.equal(isLeapYear(2000), true);
    assert.equal(daysInIsoMonth(2024, 2), 29);
    assert.equal(daysInIsoMonth(2025, 2), 28);
    assert.equal(daysInIsoMonth(2026, 4), 30);
    assert.equal(daysInIsoMonth(2026, 12), 31);
    assert.equal(daysInIsoMonth(2026, 13), 0);
    assert.deepEqual(parseIsoDate('2024-02-29'), { year: 2024, month: 2, day: 29 });
  });
  test('UTC today is built from the UTC day, not the local one', () => {
    assert.equal(utcIsoDate(new Date('2026-10-30T23:59:59Z')), '2026-10-30');
    assert.equal(utcIsoDate(new Date('2026-10-31T00:00:00Z')), '2026-10-31');
  });
});

describe('SelectedDay contract identity', () => {
  test('a day alone is just its date; a bad date is refused', () => {
    assert.deepEqual(createSelectedDay('2026-10-30'), { isoDate: '2026-10-30' });
    assert.equal(createSelectedDay('2026-02-30'), null);
    assert.equal(createSelectedDay(undefined), null);
  });
  test('the three origin kinds are accepted, with their optional fields', () => {
    assert.deepEqual(createSelectedDay('2026-10-30', { kind: 'record', metric: 'weight', recordId: 'w1' }), { isoDate: '2026-10-30', origin: { kind: 'record', metric: 'weight', recordId: 'w1' } });
    assert.deepEqual(createSelectedDay('2026-10-30', { kind: 'daily-aggregate', metric: 'calories', seriesKey: 'intake' })!.origin, { kind: 'daily-aggregate', metric: 'calories', seriesKey: 'intake' });
    assert.equal(createSelectedDay('2026-10-30', { kind: 'period-aggregate', metric: 'sleep' })!.origin!.kind, 'period-aggregate');
  });
  test('a malformed origin is refused, not silently dropped', () => {
    for (const bad of [null, 'record', {}, { kind: 'point', metric: 'weight' }, { kind: 'record' }, { kind: 'record', metric: '' }, { kind: 'record', metric: 'weight', recordId: '' }, { kind: 'record', metric: 'weight', recordId: 7 }, { kind: 'record', metric: 'weight', seriesKey: ' ' }]) {
      assert.equal(createSelectedDay('2026-10-30', bad), null, JSON.stringify(bad));
    }
  });
  test('labels and indexes can not become part of the identity', () => {
    const a = createSelectedDay('2026-10-30', { kind: 'record', metric: 'weight', recordId: 'w1', label: 'Oct 30', index: 4 })!;
    const b = createSelectedDay('2026-10-30', { kind: 'record', metric: 'weight', recordId: 'w1', label: '30 Oct', index: 9 })!;
    assert.deepEqual(a.origin, { kind: 'record', metric: 'weight', recordId: 'w1' });
    assert.equal(selectedDayKey(a), selectedDayKey(b));
    assert.equal(isSameSelectedDay(a, b), true);
  });
  test('identity is date + kind + metric + recordId + seriesKey', () => {
    const base = createSelectedDay('2026-10-30', { kind: 'record', metric: 'weight', recordId: 'w1' })!;
    const variants = [
      createSelectedDay('2026-10-31', { kind: 'record', metric: 'weight', recordId: 'w1' }),
      createSelectedDay('2026-10-30', { kind: 'record', metric: 'sleep', recordId: 'w1' }),
      createSelectedDay('2026-10-30', { kind: 'record', metric: 'weight', recordId: 'w2' }),
      createSelectedDay('2026-10-30', { kind: 'daily-aggregate', metric: 'weight', recordId: 'w1' }),
      createSelectedDay('2026-10-30', { kind: 'record', metric: 'weight', recordId: 'w1', seriesKey: 's' }),
      createSelectedDay('2026-10-30'),
    ];
    for (const v of variants) assert.equal(isSameSelectedDay(base, v), false, JSON.stringify(v));
    assert.equal(isSameSelectedDay(base, createSelectedDay('2026-10-30', { seriesKey: undefined, kind: 'record', metric: 'weight', recordId: 'w1' })), true);
    assert.equal(isSameSelectedDay(null, null), true);
    assert.equal(isSameSelectedDay(base, null), false);
  });
  test('the key can not be forged by separators inside a value', () => {
    const a = createSelectedDay('2026-10-30', { kind: 'record', metric: 'a|b', recordId: 'c' })!;
    const b = createSelectedDay('2026-10-30', { kind: 'record', metric: 'a', recordId: 'b|c' })!;
    assert.notEqual(selectedDayKey(a), selectedDayKey(b));
  });
});

describe('the Calendar address', () => {
  const TODAY = '2026-11-01';
  test('reads a real date, and only the first `date`', () => {
    assert.equal(readCalendarDate('?date=2024-02-29'), '2024-02-29');
    assert.equal(readCalendarDate(new URLSearchParams('x=1&date=2026-10-30')), '2026-10-30');
    assert.equal(readCalendarDate('date=2026-10-30&date=2026-10-31'), '2026-10-30');
    assert.equal(readCalendarDate('date=2026-02-30&date=2026-10-31'), null);
  });
  test('missing or invalid falls back to UTC today, and says whether it was invalid', () => {
    assert.deepEqual(resolveCalendarDate('', TODAY), { isoDate: TODAY, invalid: false, fromUrl: false });
    assert.deepEqual(resolveCalendarDate('?date=', TODAY), { isoDate: TODAY, invalid: true, fromUrl: false });
    for (const bad of ['2026-02-30', '2025-02-29', 'tomorrow', '2026-1-1', '2026-10-30T10:00']) {
      assert.deepEqual(resolveCalendarDate(`?date=${encodeURIComponent(bad)}`, TODAY), { isoDate: TODAY, invalid: true, fromUrl: false }, bad);
    }
    assert.deepEqual(resolveCalendarDate('?date=2026-10-30', TODAY), { isoDate: '2026-10-30', invalid: false, fromUrl: true });
  });
  test('writing the date keeps every other parameter, and a bad date writes nothing', () => {
    assert.equal(withCalendarDate('?filter=meals&x=1', '2026-10-30').toString(), 'filter=meals&x=1&date=2026-10-30');
    assert.equal(withCalendarDate('date=2026-10-01&x=1', '2026-10-30').toString(), 'date=2026-10-30&x=1');
    assert.equal(withCalendarDate('x=1', '2026-02-30').toString(), 'x=1');
    assert.equal(withCalendarDate('date=2026-10-30&date=2026-10-31', '2026-11-02').getAll(CALENDAR_DATE_PARAM).length, 1);
  });
  test('links open the Calendar on that day', () => {
    assert.equal(buildCalendarHref('2026-10-30'), '/calendar?date=2026-10-30');
    assert.equal(buildCalendarHref('2026-10-30', 'x=1'), '/calendar?x=1&date=2026-10-30');
    assert.equal(buildCalendarHref('nonsense'), '/calendar');
  });
});

describe('history: ordinary selection replaces, an explicit open pushes', () => {
  test('replace vs push by intent', () => {
    assert.equal(shouldReplaceHistory('select'), true);
    assert.equal(shouldReplaceHistory('step'), true);
    assert.equal(shouldReplaceHistory('today'), true);
    assert.equal(shouldReplaceHistory('open-in-calendar'), false);
  });
  test('a plan keeps unrelated parameters and carries the replace decision', () => {
    const select = planDayNavigation({ search: '?filter=meals', selected: '2026-11-01', target: '2026-10-30', intent: 'select' });
    assert.deepEqual(select, { navigate: true, replace: true, search: 'filter=meals&date=2026-10-30' });
    const open = planDayNavigation({ search: 'filter=meals&date=2026-10-01', selected: '2026-10-01', target: '2026-10-30', intent: 'open-in-calendar' });
    assert.deepEqual(open, { navigate: true, replace: false, search: 'filter=meals&date=2026-10-30' });
  });
  test('the same day, or an unreal day, changes nothing (no duplicate history entries)', () => {
    for (const intent of ['select', 'step', 'today', 'open-in-calendar'] as const) {
      assert.equal(planDayNavigation({ search: 'date=2026-10-30', selected: '2026-10-30', target: '2026-10-30', intent }).navigate, false);
      assert.equal(planDayNavigation({ search: '', selected: '2026-10-30', target: '2026-02-30', intent }).navigate, false);
    }
  });
});

describe('day-entry adapters', () => {
  test('adherence cells and Calorie History rows become daily-aggregate selections', () => {
    assert.deepEqual(adherenceCellDay('2026-10-30', 'protein'), { isoDate: '2026-10-30', origin: { kind: 'daily-aggregate', metric: 'protein', seriesKey: 'target-adherence' } });
    assert.deepEqual(calorieHistoryDay('2026-10-30'), { isoDate: '2026-10-30', origin: { kind: 'daily-aggregate', metric: 'calories', seriesKey: 'daily-record' } });
    assert.equal(adherenceCellDay('2026-02-30', 'calories'), null);
    assert.equal(calorieHistoryDay('nope'), null);
  });
  test('the open label names the day in words', () => {
    assert.equal(openDayLabel('2026-10-30'), 'Open Friday, October 30, 2026 in Calendar');
    assert.equal(openDayLabel('bad'), 'Open bad in Calendar');
  });
});

describe('pure lib layering (selected day contract)', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  test('selectedDay.ts, dayEntryAdapters.ts and dayDisplay.ts import nothing from the app shell or from components', () => {
    for (const file of ['src/lib/selectedDay.ts', 'src/lib/dayEntryAdapters.ts', 'src/lib/dayDisplay.ts', 'src/lib/routePaths.ts']) {
      const imports = [...read(file).matchAll(/^import[^;]*from '([^']+)'/gm)].map((m) => m[1]);
      for (const spec of imports) {
        assert.doesNotMatch(spec, /^@\/(app|components|pages|hooks|contexts)\b/, `${file} imports ${spec}`);
        assert.doesNotMatch(spec, /react|lucide|router/, `${file} imports ${spec}`);
      }
    }
  });

  test('the Calendar route string is injected from a pure place and equals the app route', () => {
    assert.equal(CALENDAR_PATH, ROUTES.calendar);
    assert.equal(buildCalendarHref('2026-10-30'), `${ROUTES.calendar}?date=2026-10-30`);
    assert.equal(buildCalendarHref('nope'), ROUTES.calendar);
  });

  test('dayDisplay writes days exactly like the Calendar model, and returns bad dates unchanged', () => {
    for (const iso of ['2026-10-30', '2024-02-29', '2026-01-01', '2026-12-31']) {
      assert.equal(libLong(iso), modelLong(iso), iso);
      assert.equal(libBrief(iso), modelBrief(iso), iso);
    }
    assert.equal(libLong('2026-10-30'), 'Friday, October 30, 2026');
    assert.equal(libBrief('2026-10-30'), 'Fri, Oct 30');
    for (const bad of ['2026-02-30', '10/30', '', 'banana']) {
      assert.equal(libLong(bad), bad);
      assert.equal(libBrief(bad), bad);
    }
    assert.equal(openDayLabel('2026-10-30'), 'Open Friday, October 30, 2026 in Calendar');
  });
});
