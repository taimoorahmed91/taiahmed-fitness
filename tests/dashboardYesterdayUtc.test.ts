import { describe, test, expect, afterAll, setSystemTime } from 'bun:test';
import { readFileSync } from 'node:fs';
import { yesterdayIso } from '../src/lib/dayLabels';
import { getMealDate } from '../src/lib/mealDateTime';

// Regression: the Dashboard used to build "yesterday" from the viewer's LOCAL calendar
// (new Date(); setDate(getDate() - 1); toISOString()). Around a daylight-saving change the local day minus one
// is not 24 hours earlier, so the result could land two UTC days back while the rest of the page used UTC days.
const originalTz = process.env.TZ;
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  setSystemTime();
});

/**
 * Switching TZ inside a long-running test process is not always picked up by the runtime. The "old code was wrong"
 * guard below only makes sense when the zone really is in effect, so it checks the offset first (minutes behind UTC).
 */
const zoneInEffect = (now: Date, offsetMinutes: number) => now.getTimezoneOffset() === offsetMinutes;

/** The old Dashboard calculation, kept here only to prove the cases below really were wrong. */
const oldLocalYesterday = (now: Date) => {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};
const todayUtc = (now: Date) => now.toISOString().split('T')[0];

describe('Dashboard yesterday is the UTC day before today, in every time zone', () => {
  test('Europe/Warsaw after the autumn fallback (2026-10-26T00:30Z)', () => {
    process.env.TZ = 'Europe/Warsaw';
    const now = new Date('2026-10-26T00:30:00Z');
    if (zoneInEffect(now, -60)) expect(oldLocalYesterday(now)).toBe('2026-10-24'); // the bug: two days back (CET = UTC+1)
    expect(yesterdayIso(todayUtc(now))).toBe('2026-10-25');
  });

  test('America/New_York after the US fallback (2026-11-02T00:30Z)', () => {
    process.env.TZ = 'America/New_York';
    const now = new Date('2026-11-02T00:30:00Z'); // 19:30 on Nov 1 local
    if (zoneInEffect(now, 300)) expect(oldLocalYesterday(now)).toBe('2026-10-31'); // the bug: two days back (EST = UTC-5)
    expect(yesterdayIso(todayUtc(now))).toBe('2026-11-01');
  });

  test('result never depends on the zone, including the ordinary Poland midnight boundary', () => {
    const now = new Date('2026-10-31T23:30:00Z');
    for (const tz of ['UTC', 'Europe/Warsaw', 'America/New_York', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      expect(yesterdayIso(getMealDate(now))).toBe('2026-10-30');
    }
  });

  test('Dashboard uses the shared helper and hands the exact day to YesterdayStatus', () => {
    const src = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
    expect(src).toContain('const yesterdayStr = yesterdayIso(todayStr);');
    expect(src).not.toMatch(/setDate\(/);
    expect(src).toMatch(/<YesterdayStatus[^>]*date=\{yesterdayStr\}/s);
  });
});
