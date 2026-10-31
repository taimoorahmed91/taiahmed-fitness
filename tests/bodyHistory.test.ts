import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChangeMap,
  countBy,
  describeGap,
  formatChange,
  groupByMonth,
  groupByWeek,
  monthKey,
  monthTitle,
  rangeOf,
  recoveryBand,
  recoveryTone,
  sleepBand,
  sortNewestFirst,
  spokenChange,
} from '../src/lib/bodyHistory';
import { caloriesFromKilojoule, hoursFromMilli, summarizeWhoopWeek, whoopCore, whoopMetricGroups } from '../src/lib/whoopHistory';
import type { WhoopEntry } from '../src/hooks/useWhoopData';

const w = (id: string, date: string, weight: number) => ({ id, date, weight });
const value = (e: { weight: number }) => e.weight;

describe('body history: grouping', () => {
  test('newest first; entries on the same day keep their incoming order', () => {
    const sorted = sortNewestFirst([w('a', '2026-10-01', 1), w('b', '2026-10-03', 1), w('c', '2026-10-03', 1), w('d', '2026-09-30', 1)]);
    assert.deepEqual(sorted.map((e) => e.id), ['b', 'c', 'a', 'd']);
  });
  test('months group by calendar month and never merge a month across a year', () => {
    const groups = groupByMonth(sortNewestFirst([w('a', '2026-01-05', 1), w('b', '2025-01-20', 1), w('c', '2026-01-31', 1), w('d', '2025-12-31', 1)]));
    assert.deepEqual(groups.map((g) => [g.month, g.items.map((e) => e.id)]), [
      ['2026-01', ['c', 'a']],
      ['2025-12', ['d']],
      ['2025-01', ['b']],
    ]);
    assert.equal(monthKey('2026-10-31'), '2026-10');
  });
  test('month title is the month name and year, whatever the timezone', () => {
    assert.equal(monthTitle('2026-10'), 'October 2026');
    assert.equal(monthTitle('2025-01'), 'January 2025');
    assert.equal(monthTitle('nonsense'), 'nonsense');
    assert.equal(monthTitle('2026-13'), '2026-13');
  });
  test('weeks run Monday to Sunday', () => {
    const groups = groupByWeek(sortNewestFirst([w('sun', '2026-11-01', 1), w('mon', '2026-10-26', 1), w('next', '2026-11-02', 1), w('prev', '2026-10-25', 1)]));
    assert.deepEqual(groups.map((g) => [g.weekStart, g.items.map((e) => e.id)]), [
      ['2026-11-02', ['next']],
      ['2026-10-26', ['sun', 'mon']],
      ['2026-10-19', ['prev']],
    ]);
  });
  test('counts per key', () => {
    assert.deepEqual(countBy([w('a', '2026-10-01', 1), w('b', '2026-10-09', 1), w('c', '2026-09-09', 1)], (e) => monthKey(e.date)), { '2026-10': 2, '2026-09': 1 });
  });
});

describe('body history: change from the previous entry is a plain difference', () => {
  const all = sortNewestFirst([w('c', '2026-10-29', 70.4), w('b', '2026-10-27', 70), w('a', '2026-10-20', 70.9)]);
  const changes = buildChangeMap(all, value);

  test('each entry is compared with the one just before it in time; the oldest has none', () => {
    assert.deepEqual(changes.get('c'), { delta: 0.4, previousValue: 70, previousDate: '2026-10-27', days: 2 });
    assert.deepEqual(changes.get('b'), { delta: -0.9, previousValue: 70.9, previousDate: '2026-10-20', days: 7 });
    assert.equal(changes.has('a'), false);
  });
  test('float noise is rounded away and an equal reading is exactly "no change"', () => {
    const c = buildChangeMap(sortNewestFirst([w('2', '2026-10-02', 70.3), w('1', '2026-10-01', 70.2)]), value);
    assert.equal(c.get('2')?.delta, 0.1);
    const same = buildChangeMap(sortNewestFirst([w('2', '2026-10-02', 70.2), w('1', '2026-10-01', 70.2)]), value);
    assert.equal(same.get('2')?.delta, 0);
    assert.equal(Object.is(same.get('2')?.delta, -0), false);
  });
  test('two readings on one day: the gap is zero days', () => {
    const c = buildChangeMap(sortNewestFirst([w('pm', '2026-10-02', 70.5), w('am', '2026-10-02', 70.1)]), value);
    assert.equal(c.get('pm')?.days, 0);
  });
  test('non-numbers are skipped, never turned into a change', () => {
    const c = buildChangeMap(sortNewestFirst([w('2', '2026-10-02', Number.NaN), w('1', '2026-10-01', 70)]), value);
    assert.equal(c.size, 0);
  });
  test('wording is neutral: a sign and a number, no verdict', () => {
    assert.equal(formatChange(0.4, 'kg'), '+0.4 kg');
    assert.equal(formatChange(-0.9, 'kg'), '−0.9 kg');
    assert.equal(formatChange(0.35, 'cm'), '+0.35 cm');
    assert.equal(formatChange(0, 'kg'), 'No change');
    assert.equal(spokenChange(changes.get('c')!, 'kilograms', 2, 'Oct 27'), 'Up 0.4 kilograms since Oct 27 (2 days earlier).');
    assert.equal(spokenChange(changes.get('b')!, 'kilograms', 2, 'Oct 20'), 'Down 0.9 kilograms since Oct 20 (7 days earlier).');
    for (const text of [formatChange(0.4, 'kg'), spokenChange(changes.get('c')!, 'kilograms')]) {
      assert.doesNotMatch(text, /good|bad|better|worse|improv|gain|loss|lost|progress|goal/i);
    }
    assert.equal(describeGap(0), 'same day');
    assert.equal(describeGap(1), '1 day earlier');
    assert.equal(describeGap(null), null);
  });
});

describe('body history: statistics and bands', () => {
  test('range ignores missing values and is null when there are none', () => {
    assert.deepEqual(rangeOf([70, null, 72, undefined, 71]), { count: 3, min: 70, max: 72, mean: 71 });
    assert.equal(rangeOf([null, undefined]), null);
    assert.equal(rangeOf([]), null);
  });
  test('sleep bands cut at 6 / 7 / 9 hours and carry a rule in words', () => {
    assert.equal(sleepBand(5.99).label, 'Poor');
    assert.equal(sleepBand(6).label, 'Fair');
    assert.equal(sleepBand(6.99).label, 'Fair');
    assert.equal(sleepBand(7).label, 'Good');
    assert.equal(sleepBand(9).label, 'Good');
    assert.equal(sleepBand(9.01).label, 'Long', 'a long night is long, not "poor"');
    assert.equal(sleepBand(11).label, 'Long');
    assert.equal(sleepBand(0).label, 'Poor');
    assert.match(sleepBand(7.5).rule, /7 to 9 hours/);
  });
  test('recovery bands use WHOOP cut-offs and unknown has no band', () => {
    assert.deepEqual([67, 66, 34, 33, 100, 0].map(recoveryBand), ['High', 'Medium', 'Medium', 'Low', 'High', 'Low']);
    assert.equal(recoveryBand(null), null);
    assert.equal(recoveryBand(undefined), null);
    assert.deepEqual((['High', 'Medium', 'Low'] as const).map(recoveryTone), ['good', 'fair', 'poor']);
  });
});

const whoop = (over: Partial<WhoopEntry> = {}): WhoopEntry => ({
  id: 'w', date: '2026-10-29', created_at: '', cycle_end_timestamp: null,
  recovery_score: null, hrv_rmssd_milli: null, resting_heart_rate: null, spo2_percentage: null, skin_temp_celsius: null,
  sleep_performance_percentage: null, sleep_efficiency_percentage: null, total_in_bed_hours: null,
  total_rem_sleep_milli: null, total_deep_sleep_milli: null, total_light_sleep_milli: null, total_awake_time_milli: null,
  respiratory_rate: null, disturbance_count: null, sleep_cycle_count: null, strain: null, kilojoule: null,
  average_heart_rate: null, max_heart_rate: null, ...over,
});

describe('WHOOP history helpers', () => {
  test('the opened grid keeps every one of the 19 readings the old table showed', () => {
    const labels = whoopMetricGroups(whoop()).flatMap((g) => g.cells.map((c) => c.label));
    assert.equal(labels.length, 19);
    assert.deepEqual(whoopMetricGroups(whoop()).map((g) => g.key), ['recovery', 'sleep', 'activity']);
    assert.equal(new Set(labels).size, 19);
  });
  test('unknown is a dash and "not recorded", a real zero is a zero', () => {
    const empty = whoopMetricGroups(whoop()).flatMap((g) => g.cells);
    assert.ok(empty.every((c) => c.value === '—' && !c.recorded));
    const zero = whoopMetricGroups(whoop({ disturbance_count: 0 })).flatMap((g) => g.cells).find((c) => c.key === 'dist')!;
    assert.deepEqual([zero.value, zero.recorded], ['0', true]);
  });
  test('units and conversions match the old table', () => {
    assert.equal(hoursFromMilli(27_000_000), '7.5');
    assert.equal(caloriesFromKilojoule(8368), 2000);
    const core = whoopCore(whoop({ recovery_score: 78, hrv_rmssd_milli: 62, resting_heart_rate: 51, sleep_performance_percentage: 91, strain: 12.44 }));
    assert.deepEqual([core.recovery.value, core.band, core.hrv.value, core.rhr.value, core.sleep.value, core.strain.value], ['78', 'High', '62', '51', '91', '12.4']);
  });
  test('weekly averages need three days with the reading and report their coverage', () => {
    const days = [
      whoop({ id: '1', recovery_score: 60, strain: 10 }),
      whoop({ id: '2', recovery_score: 70, strain: 12 }),
      whoop({ id: '3', recovery_score: 80 }),
    ];
    const week = summarizeWhoopWeek(days);
    assert.equal(week.days, 3);
    assert.deepEqual(week.recovery, { mean: 70, days: 3 });
    assert.equal(week.strain, null, 'two days of strain is not an average');
    assert.equal(week.hrv, null);
    assert.equal(summarizeWhoopWeek(days.slice(0, 2)).recovery, null);
  });
});
