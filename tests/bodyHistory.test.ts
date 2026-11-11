import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChangeMap,
  countBy,
  deltaTint,
  isValidTarget,
  targetMove,
  tintOfMove,
  towardTargetTint,
  deltaTone,
  describeGap,
  formatChange,
  groupByMonth,
  groupByWeek,
  monthKey,
  monthTitle,
  netChangeOver,
  rangeOf,
  recoveryBand,
  recoveryTone,
  sleepBand,
  sleepBarPercent,
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
    assert.equal(spokenChange(changes.get('c')!, 'kilograms', 2, '27/10'), 'Up 0.4 kilograms since 27/10 (2 days earlier).');
    assert.equal(spokenChange(changes.get('b')!, 'kilograms', 2, '20/10'), 'Down 0.9 kilograms since 20/10 (7 days earlier).');
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

describe('month net change and the sleep bar', () => {
  const rows = (...values: number[]) => values.map((weight, i) => ({ weight, id: String(i) }));
  const w = (r: { weight: number }) => r.weight;
  test('net change is the newest reading minus the oldest, as a plain number', () => {
    assert.equal(netChangeOver(rows(90.2, 90.6, 90.8, 91.4, 92), w), -1.8);
    assert.equal(netChangeOver(rows(80.5, 80), w), 0.5);
  });
  test('needs two readings, and zero stays zero (never -0)', () => {
    assert.equal(netChangeOver(rows(80), w), null);
    assert.equal(netChangeOver([], w), null);
    assert.equal(Object.is(netChangeOver(rows(80, 80), w), 0), true);
    assert.equal(netChangeOver(rows(Number.NaN, 80), w), null);
  });
  test('the sleep bar is a scale from 0 to 12 hours, clamped, and says nothing about targets', () => {
    assert.equal(sleepBarPercent(0), 0);
    assert.equal(sleepBarPercent(6), 50);
    assert.equal(sleepBarPercent(7.5), 63);
    assert.equal(sleepBarPercent(14), 100);
    assert.equal(sleepBarPercent(Number.NaN), 0);
    assert.equal(sleepBarPercent(-3), 0);
  });
});

describe('body history: tile tone follows the direction of the change', () => {
  const all = sortNewestFirst([w('d', '2026-10-30', 70.4), w('c', '2026-10-29', 70.4), w('b', '2026-10-27', 70), w('a', '2026-10-20', 70.9)]);
  const changes = buildChangeMap(all, value);

  test('more than the previous entry is up, less is down, equal is flat', () => {
    assert.equal(deltaTone(changes.get('c')), 'up');
    assert.equal(deltaTone(changes.get('d')), 'flat');
    assert.equal(deltaTone(changes.get('b')), 'down');
    assert.equal(deltaTone({ delta: 0.4 }), 'up');
    assert.equal(deltaTone({ delta: -0.01 }), 'down');
  });
  test('no previous entry, or a value that is not a number, is flat', () => {
    assert.equal(deltaTone(changes.get('a')), 'flat');
    assert.equal(deltaTone(undefined), 'flat');
    assert.equal(deltaTone(null), 'flat');
    assert.equal(deltaTone({ delta: Number.NaN }), 'flat');
  });
  test('tone agrees with the printed text: "No change" is always flat, a sign is always up or down', () => {
    for (const delta of [-2.5, -0.01, 0, 0.01, 3]) {
      const text = formatChange(delta, 'kg');
      const tone = deltaTone({ delta });
      if (text === 'No change') assert.equal(tone, 'flat');
      else assert.equal(tone, text.startsWith('+') ? 'up' : 'down');
    }
  });
  test('a change that rounds to nothing at display precision is flat', () => {
    const c = buildChangeMap(sortNewestFirst([w('2', '2026-10-02', 70.201), w('1', '2026-10-01', 70.2)]), value);
    assert.equal(deltaTone(c.get('2')), 'flat');
  });
});

describe('body history: tile tint (colour) from the direction of the change', () => {
  test('default (Weight, Waist): more is red, less is green, nothing to compare is orange', () => {
    assert.equal(deltaTint({ delta: 0.4 }), 'red');
    assert.equal(deltaTint({ delta: -0.4 }), 'green');
    assert.equal(deltaTint({ delta: 0 }), 'flat');
    assert.equal(deltaTint(undefined), 'flat');
  });
  test('higherIsBetter (Sleep) inverts the colours: more is green, less is red', () => {
    assert.equal(deltaTint({ delta: 0.5 }, { higherIsBetter: true }), 'green');
    assert.equal(deltaTint({ delta: -0.5 }, { higherIsBetter: true }), 'red');
  });
  test('higherIsBetter never changes the neutral cases', () => {
    for (const change of [{ delta: 0 }, { delta: Number.NaN }, null, undefined]) {
      assert.equal(deltaTint(change, { higherIsBetter: true }), 'flat');
      assert.equal(deltaTint(change), 'flat');
    }
  });
  test('the direction (arrow and sign) is the same whichever way the colours go', () => {
    assert.equal(deltaTone({ delta: 0.5 }), 'up');
    assert.equal(deltaTone({ delta: -0.5 }), 'down');
    assert.equal(formatChange(0.5, 'h'), '+0.5 h');
  });
});

describe('body history: Weight tile colour relative to a target weight', () => {
  // Build the change the way the list does, then ask for the tint.
  const tint = (prev: number, cur: number, target: number | null | undefined) => {
    const all = sortNewestFirst([w('2', '2026-10-02', cur), w('1', '2026-10-01', prev)]);
    return towardTargetTint(buildChangeMap(all, value).get('2'), cur, target);
  };
  const move = (prev: number, cur: number, target: number | null | undefined) => {
    const all = sortNewestFirst([w('2', '2026-10-02', cur), w('1', '2026-10-01', prev)]);
    return targetMove(buildChangeMap(all, value).get('2'), cur, target);
  };

  test('the examples with a target of 85', () => {
    assert.equal(tint(92, 91, 85), 'green', '92 to 91: closer, same side');
    assert.equal(tint(84, 83, 85), 'red', '84 to 83: farther, same side');
    assert.equal(tint(85, 83, 85), 'red', 'was exactly on target, moved off');
    assert.equal(tint(94, 85, 85), 'green', 'arrived exactly on target');
    assert.equal(tint(84, 86, 85), 'red', 'crossed to the other side');
    assert.equal(tint(88, 84, 85), 'red', 'crossed past it, even though 84 is close');
  });
  test('the same moves in the other direction (below the target)', () => {
    assert.equal(tint(80, 82, 85), 'green', 'closer from below');
    assert.equal(tint(80, 79, 85), 'red', 'farther below');
    assert.equal(tint(80, 85, 85), 'green', 'arrived from below');
    assert.equal(tint(82, 88, 85), 'red', 'crossed upward');
    assert.equal(tint(86, 90, 85), 'red', 'farther above');
  });
  test('no change is orange, and so is a first entry', () => {
    assert.equal(tint(90, 90, 85), 'flat');
    assert.equal(tint(85, 85, 85), 'flat');
    assert.equal(towardTargetTint(undefined, 90, 85), 'flat');
    assert.equal(towardTargetTint(null, 90, 85), 'flat');
  });
  test('the move says why, for the words on the tile', () => {
    assert.equal(move(92, 91, 85), 'toward');
    assert.equal(move(94, 85, 85), 'reached');
    assert.equal(move(84, 83, 85), 'away');
    assert.equal(move(85, 83, 85), 'away');
    assert.equal(move(84, 86, 85), 'crossed');
    assert.equal(move(90, 90, 85), 'none');
    assert.equal(tintOfMove('toward'), 'green');
    assert.equal(tintOfMove('reached'), 'green');
    assert.equal(tintOfMove('away'), 'red');
    assert.equal(tintOfMove('crossed'), 'red');
    assert.equal(tintOfMove('none'), 'flat');
  });
  test('no target, or one that is not a valid number, gives no move so the caller falls back to up = red, down = green', () => {
    for (const bad of [null, undefined, Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      assert.equal(isValidTarget(bad), false);
      assert.equal(move(92, 91, bad), 'none');
      assert.equal(tint(92, 91, bad), 'flat');
    }
    assert.equal(isValidTarget(85), true);
    assert.equal(isValidTarget(85.5), true);
    const all = sortNewestFirst([w('2', '2026-10-02', 91), w('1', '2026-10-01', 92)]);
    assert.equal(deltaTint(buildChangeMap(all, value).get('2')), 'green', 'the fallback: down is green');
    assert.equal(deltaTint({ delta: 1 }), 'red', 'the fallback: up is red');
  });
  test('rounded numbers decide, the same ones the tile prints', () => {
    // 85.004 shows as 85 (on target); 85.006 shows as 85.01 (off it).
    assert.equal(move(86, 85.004, 85), 'reached');
    assert.equal(move(86, 85.006, 85), 'toward');
    // The change rounds to nothing, so the chip says "No change" and the tile is orange.
    assert.equal(tint(90.001, 90.002, 85), 'flat');
    // Previous value of 85.004 is exactly on target once rounded, so moving off it is red.
    assert.equal(tint(85.004, 83, 85), 'red');
    // Target is rounded too.
    assert.equal(move(92, 91, 85.001), 'toward');
  });
  test('the arrow and sign stay truthful: a decrease past the target is red but still a minus', () => {
    assert.equal(formatChange(-4, 'kg'), '−4 kg');
    assert.equal(deltaTone({ delta: -4 }), 'down');
    assert.equal(tint(88, 84, 85), 'red');
  });
});
