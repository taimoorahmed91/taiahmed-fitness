import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balanceDateForCycle, buildCalorieBalanceRows } from '../src/lib/calorieBalance.ts';
import { formatChartDate, recentChartData } from '../src/lib/chartRange.ts';

const TODAY = '2026-10-30';
// Rows written in one batch (demo seed, bulk import) all share created_at; only `date` differs.
const BATCH = '2026-10-30T09:15:00.000Z';
const entry = (date: string, kilojoule: number | null = 10460, extra: Record<string, unknown> = {}) => ({ date, created_at: BATCH, kilojoule, ...extra });
const meal = (date: string, calories: number) => ({ date, calories });

describe('calorie balance source dates', () => {
  test('burn belongs to the day before the WHOOP cycle date (cycle D -> day D-1), in UTC', () => {
    assert.equal(balanceDateForCycle('2026-10-30'), '2026-10-29');
    assert.equal(balanceDateForCycle('2026-03-01'), '2026-02-28');
    assert.equal(balanceDateForCycle('2027-01-01'), '2026-12-31');
    assert.equal(balanceDateForCycle('2028-03-01'), '2028-02-29');
  });

  test('batched rows sharing created_at but with distinct entry.date give distinct tick dates', () => {
    const whoop = [entry('2026-10-30'), entry('2026-10-29'), entry('2026-10-28'), entry('2026-10-27')];
    const meals = [meal('2026-10-29', 2000), meal('2026-10-28', 1900), meal('2026-10-27', 2100), meal('2026-10-26', 1800)];
    const rows = buildCalorieBalanceRows(whoop, meals, TODAY);
    assert.deepEqual(rows.map((r) => r.date), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
    const ticks = rows.map((r) => formatChartDate(r.date));
    assert.deepEqual(ticks, ['10/26', '10/27', '10/28', '10/29']);
    assert.equal(new Set(ticks).size, rows.length);
  });

  test('a long batch with one created_at keeps every distinct day (nothing is deduped by accident)', () => {
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)); // Oct 1..30
    const whoop = days.map((d) => entry(d));
    const meals = days.map((d) => meal(d, 2000));
    const rows = buildCalorieBalanceRows(whoop, meals, TODAY);
    // cycle Oct 2..Oct 30 -> days Oct 1..Oct 29; cycle Oct 1 -> Sep 30 has no meals in the list
    assert.equal(rows.length, 29);
    assert.equal(new Set(rows.map((r) => r.date)).size, 29);
    assert.equal(rows[0].date, '2026-10-01');
    assert.equal(rows[rows.length - 1].date, '2026-10-29');
  });

  test('created_at is never used for the date', () => {
    const rows = buildCalorieBalanceRows(
      [entry('2026-10-20', 10460, { created_at: '2026-01-01T00:00:00Z' })],
      [meal('2026-10-19', 2000), meal('2025-12-31', 2000)],
      TODAY,
    );
    assert.deepEqual(rows.map((r) => r.date), ['2026-10-19']);
  });

  test('burned is kJ -> kcal and balance is burned minus consumed (deficit positive)', () => {
    const [row] = buildCalorieBalanceRows([entry('2026-10-30', 10460)], [meal('2026-10-29', 1500), meal('2026-10-29', 500)], TODAY);
    assert.deepEqual(row, { date: '2026-10-29', consumed: 2000, burned: 2500, balance: 500 });
  });

  test('entries without kilojoule, without meals, or outside the 90-day window are skipped', () => {
    const rows = buildCalorieBalanceRows(
      [entry('2026-10-30', null), entry('2026-10-29'), entry('2026-08-03'), entry('2026-08-02'), entry('2026-10-31')],
      [meal('2026-10-29', 2000), meal('2026-08-02', 2000), meal('2026-08-01', 2000), meal('2026-10-30', 2000)],
      TODAY,
    );
    // cycle 10-29 -> 10-28 (no meals) skipped; 08-03 -> 08-02 is day 90 of the window (kept); 08-02 -> 08-01 is outside; 10-31 -> 10-30 is today (kept)
    assert.deepEqual(rows.map((r) => r.date), ['2026-08-02', '2026-10-30']);
  });

  test('two rows for the same cycle date collapse to the later cycle; other dates are untouched', () => {
    const rows = buildCalorieBalanceRows(
      [
        entry('2026-10-30', 8368, { cycle_end_timestamp: '2026-10-30T06:00:00.000Z' }),
        entry('2026-10-30', 10460, { cycle_end_timestamp: '2026-10-30T07:30:00.000Z' }),
        entry('2026-10-29', 8368, { cycle_end_timestamp: '2026-10-29T06:00:00.000Z' }),
      ],
      [meal('2026-10-29', 2000), meal('2026-10-28', 2000)],
      TODAY,
    );
    assert.deepEqual(rows.map((r) => [r.date, r.burned]), [['2026-10-28', 2000], ['2026-10-29', 2500]]);
  });

  test('non-ISO entry dates are ignored rather than shifted', () => {
    assert.deepEqual(buildCalorieBalanceRows([entry('10/30')], [meal('2026-10-29', 1)], TODAY), []);
  });

  test('output is oldest first and survives the chart range filter with distinct dates', () => {
    const rows = buildCalorieBalanceRows(
      [entry('2026-10-30'), entry('2026-10-29'), entry('2026-10-28')],
      [meal('2026-10-29', 1), meal('2026-10-28', 1), meal('2026-10-27', 1)],
      TODAY,
    );
    const shown = recentChartData(rows, '7', TODAY);
    assert.deepEqual(shown.map((r) => r.date), ['2026-10-27', '2026-10-28', '2026-10-29']);
  });

  test('UTC only: the machine time zone cannot move a date', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
        process.env.TZ = tz;
        const rows = buildCalorieBalanceRows([entry('2026-03-09'), entry('2026-03-10')], [meal('2026-03-08', 1), meal('2026-03-09', 1)], '2026-03-10');
        assert.deepEqual(rows.map((r) => r.date), ['2026-03-08', '2026-03-09'], tz);
      }
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });
});

describe('dashboard wiring', () => {
  const src = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
  test('Dashboard builds balance rows through the shared helper and no longer reads created_at', () => {
    assert.match(src, /buildCalorieBalanceRows\(whoopEntries, meals, /);
    assert.doesNotMatch(src, /created_at/);
  });
});
