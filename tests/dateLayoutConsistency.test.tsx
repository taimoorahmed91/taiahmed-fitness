import { describe, test, expect, beforeAll, afterAll, setSystemTime } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { defaultFormDate, formatLongDay, yesterdayIso } from '../src/lib/dayLabels';
import { YesterdayStatus } from '../src/components/YesterdayStatus';
import { MetricOverviewCard, STAT_GRID_CLASS } from '../src/components/MetricOverviewCard';
import { PersonalRecordsList } from '../src/components/PersonalRecordsList';
import { GymOverviewCard } from '../src/components/GymOverviewCard';

// Final date/layout consistency lane. Dates follow the app's UTC calendar-day rule, never the viewer's local
// day, and the overview / records cards must reflow at 320px and 768px instead of overflowing.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const originalTz = process.env.TZ;
beforeAll(() => {
  // Poland: 00:30 on Nov 1 local is still 23:30 on Oct 31 UTC.
  process.env.TZ = 'Europe/Warsaw';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  setSystemTime();
});

describe('UTC midnight boundary (Poland vs UTC)', () => {
  const justBeforeUtcMidnight = new Date('2026-10-31T23:30:00Z');

  test('the test setup really has a local/UTC day mismatch', () => {
    expect(justBeforeUtcMidnight.getDate()).toBe(1); // local day is Nov 1
    expect(justBeforeUtcMidnight.toISOString().slice(0, 10)).toBe('2026-10-31');
  });

  test('default form date is the UTC calendar day, not the local day', () => {
    expect(defaultFormDate(justBeforeUtcMidnight)).toBe('2026-10-31');
    expect(defaultFormDate(new Date('2026-11-01T00:30:00Z'))).toBe('2026-11-01');
  });

  test('yesterday is the UTC day before, including across a DST change', () => {
    expect(yesterdayIso('2026-11-01')).toBe('2026-10-31');
    expect(yesterdayIso('2026-10-26')).toBe('2026-10-25'); // Poland leaves summer time on Oct 25
    expect(yesterdayIso('2026-03-01')).toBe('2026-02-28');
  });

  test('long day label shows the exact calendar day', () => {
    expect(formatLongDay('2026-10-30')).toBe('Friday, Oct 30');
    expect(formatLongDay('not-a-date')).toBe('not-a-date');
  });

  test('YesterdayStatus label comes from the passed UTC date', () => {
    const html = renderToStaticMarkup(createElement(YesterdayStatus, { yesterdayCalories: 1800, goal: 2000, date: '2026-10-30' }));
    expect(text(html)).toContain('Friday, Oct 30');
  });

  test('YesterdayStatus without a date uses the UTC day before now', () => {
    setSystemTime(justBeforeUtcMidnight); // UTC Oct 31, local Nov 1
    const before = text(renderToStaticMarkup(createElement(YesterdayStatus, { yesterdayCalories: 0, goal: 2000 })));
    expect(before).toContain('Friday, Oct 30'); // the old local code said "Saturday, Oct 31"
    setSystemTime(new Date('2026-11-01T00:30:00Z'));
    const after = text(renderToStaticMarkup(createElement(YesterdayStatus, { yesterdayCalories: 0, goal: 2000 })));
    expect(after).toContain('Saturday, Oct 31');
    setSystemTime();
  });

  test('Weight, Waist and Sleep default their form date through the shared UTC helper', () => {
    for (const page of ['Weight', 'Waist', 'Sleep']) {
      const src = read(`src/pages/${page}.tsx`);
      expect(src).toContain('defaultFormDate()');
      expect(src).not.toMatch(/format\(new Date\(\)/);
    }
  });
});

describe('overview stat tiles reflow in a half-width card (768px)', () => {
  const overview = renderToStaticMarkup(createElement(MetricOverviewCard, {
    title: 'Weight Overview', latestLabel: 'Latest Weight', latest: 82.4, unit: 'kg', totalEntries: 12, emptyText: 'none',
    deltas: [
      { label: 'vs Previous', value: -0.4 }, { label: '7 Days', value: 1.25 },
      { label: '15 Days', value: null }, { label: '30 Days', value: -12.34 },
    ],
  }));

  test('tiles stay 2x2 until a wide desktop, never four-across at tablet width', () => {
    expect(STAT_GRID_CLASS).toMatch(/\bgrid-cols-2\b/);
    expect(STAT_GRID_CLASS).toMatch(/\bxl:grid-cols-4\b/);
    expect(STAT_GRID_CLASS).not.toMatch(/\bsm:grid-cols-4\b|\bmd:grid-cols-4\b|\blg:grid-cols-4\b/);
    expect(overview).toContain(STAT_GRID_CLASS.replace('&>*', '&amp;&gt;*'));
  });

  test('value, arrow and unit stay together on one line with tabular numbers', () => {
    expect(overview).toMatch(/<div class="[^"]*tabular-nums[^"]*"><div class="[^"]*whitespace-nowrap/);
    expect(overview).toContain('-12.3 kg');
    expect(overview).toContain('+1.3 kg');
  });

  test('tile labels stay readable text and tiles can shrink inside the grid', () => {
    expect(overview).toContain('vs Previous');
    expect(overview).toMatch(/class="min-w-0 rounded-lg border bg-muted\/30 p-3"/);
  });

  test('overview title uses the chart role (text-lg), not the page-title size', () => {
    expect(overview).toMatch(/<h3 class="text-lg [^"]*"/);
    expect(overview).not.toContain('text-2xl');
  });

  test('Sleep overview uses the same tile and grid pieces and the same title role', () => {
    const src = read('src/pages/Sleep.tsx');
    expect(src).toContain('STAT_GRID_CLASS');
    expect(src).toContain('<StatTile');
    expect(src).toMatch(/<Card className="h-full" titleSize="chart">/);
    expect(src).not.toMatch(/grid-cols-2 gap-3 sm:grid-cols-4/);
  });
});

describe('Gym: Personal Records header and dates', () => {
  const sessions = [
    { id: 's1', exercise: 'Push Day', duration: 50, date: '2026-10-30', notes: '1.Bench Press: S1:5@100kg | 2.Row: S1:8@60kg' },
    { id: 's2', exercise: 'Pull Day', duration: 40, date: '2025-01-05', notes: '1.Deadlift: S1:3@140kg' },
  ];
  setSystemTime(new Date('2026-10-31T12:00:00Z'));
  const records = renderToStaticMarkup(createElement(PersonalRecordsList, { sessions, templates: [] }));
  const overview = renderToStaticMarkup(createElement(GymOverviewCard, { sessions, workoutDays: [1, 3, 5] }));
  setSystemTime();

  test('title and Merge names control share a wrapping row inside the card', () => {
    expect(records).toMatch(/<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"><h3 class="[^"]*flex min-w-0 flex-wrap/);
    // The button is no longer inside the heading.
    const heading = records.slice(records.indexOf('<h3'), records.indexOf('</h3>'));
    expect(heading).not.toContain('Merge names');
    expect(records).toContain('Merge names');
  });

  test('Merge names keeps a 44px coarse-pointer target', () => {
    const btn = records.match(/<button[^>]*class="([^"]*)"[^>]*>(?:(?!<\/button>).)*Merge names/s);
    expect(btn).not.toBeNull();
    expect(btn![1]).toContain('[@media(pointer:coarse)]:min-h-11');
  });

  test('alias chips and the source keep the 44px coarse target and reflow', () => {
    const src = read('src/components/PersonalRecordsList.tsx');
    expect(src).toContain('[@media(pointer:coarse)]:min-h-11');
    expect(src).toContain('flex flex-wrap items-center gap-1');
  });

  test('"Set on" shows a human UTC date, not raw ISO', () => {
    expect(text(records)).toContain('Set on Fri, Oct 30 (yesterday)');
    expect(text(records)).toContain('Set on Sun, Jan 5, 2025');
    expect(records).not.toMatch(/Set on\s*2026-/);
  });

  test('"Last workout" shows a human UTC date, not raw ISO', () => {
    expect(text(overview)).toContain('Fri, Oct 30');
    expect(overview).not.toMatch(/>\s*2026-10-30/);
    expect(overview).not.toContain('title="2026-');
  });

  test('Gym page formats the WHOOP recovery date and uses the UTC weekday for the planned workout', () => {
    const src = read('src/pages/Gym.tsx');
    expect(src).toContain('formatDay(latest.date, today)');
    expect(src).toContain('getUTCDay()');
    expect(src).not.toContain('new Date().getDay()');
  });
});
