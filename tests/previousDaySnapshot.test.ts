import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BASIS_NOTE, buildPreviousDaySnapshot, type LoggedSnapshot, type PreviousDaySnapshotInput } from '../src/lib/previousDaySnapshot';
import { PreviousDaySnapshot } from '../src/components/PreviousDaySnapshot';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const base: PreviousDaySnapshotInput = { date: '2026-11-05', mealCount: 2, calories: 2100, goal: 2000, goalMax: 2200, dayType: 'rest' };
const logged = (over: Partial<PreviousDaySnapshotInput> = {}) => buildPreviousDaySnapshot({ ...base, ...over }) as LoggedSnapshot;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('previous day snapshot: no data vs data', () => {
  test('no meals is "No data" with no calories and no status, even if a total were passed', () => {
    for (const calories of [0, 1800]) {
      const s = buildPreviousDaySnapshot({ ...base, mealCount: 0, calories });
      expect(s.kind).toBe('no-data');
      if (s.kind === 'no-data') {
        expect(s.headline).toBe('No data');
        expect(s.detail).toBe('No meals logged');
        expect(s.dateLabel).toBe('Thursday, Nov 5');
      }
      expect(JSON.stringify(s)).not.toMatch(/target|under|over|on target/i);
    }
  });

  test('meals that add up to 0 cal are still data (a count decides, not the total)', () => {
    const s = logged({ mealCount: 1, calories: 0 });
    expect(s.kind).toBe('logged');
    expect(s.caloriesText).toBe('0');
    expect(s.status).toBe('under');
    expect(s.mealsText).toBe('1 meal logged');
  });
});

describe('previous day snapshot: status against yesterday\'s range', () => {
  test('under, on target and over use the shared status words, with the edges counted as on target', () => {
    expect(logged({ calories: 1500 })).toMatchObject({ status: 'under', statusLabel: 'Under min', statusText: '500 cal under your minimum', glyph: '\u2193' });
    expect(logged({ calories: 2100 })).toMatchObject({ status: 'within', statusLabel: 'On target', statusText: 'On target', glyph: '\u2713' });
    expect(logged({ calories: 2000 }).status).toBe('within');
    expect(logged({ calories: 2200 }).status).toBe('within');
    expect(logged({ calories: 2600 })).toMatchObject({ status: 'over', statusLabel: 'Over max', statusText: '400 cal over your maximum', glyph: '\u2191' });
  });

  test('a single daily goal (no max) is a one-number target', () => {
    const s = logged({ goalMax: undefined, dayType: undefined, calories: 2000 });
    expect(s.rangeText).toBe('2,000');
    expect(s.targetLine).toBe('Target 2,000 cal');
    expect(s.dayTypeLabel).toBeNull();
    expect(s.status).toBe('within');
  });

  test('the range line names the day type and the extra-activity note appears only when there was some', () => {
    expect(logged({ dayType: 'rest' }).targetLine).toBe('Target 2,000\u20132,200 cal \u00b7 Rest day');
    expect(logged({ dayType: 'gym', goal: 2500, goalMax: 2800 }).targetLine).toBe('Target 2,500\u20132,800 cal \u00b7 Gym day');
    expect(logged({ extraCalories: 0 }).extraNote).toBeNull();
    expect(logged({ extraCalories: 250 }).extraNote).toBe('Includes +250 cal for extra activity.');
  });

  test('the details say the base numbers are the current settings', () => {
    expect(logged().basisNote).toBe(BASIS_NOTE);
    expect(BASIS_NOTE).toContain('current target settings');
  });
});

describe('previous day snapshot: honest wording and markup', () => {
  const states = [
    createElement(PreviousDaySnapshot, { ...base, mealCount: 0, calories: 0 }),
    createElement(PreviousDaySnapshot, base),
    createElement(PreviousDaySnapshot, { ...base, calories: 1500, extraCalories: 250 }),
    createElement(PreviousDaySnapshot, { ...base, calories: 2600 }),
  ];

  test('never claims a day is complete or fully logged, in the logic, the component or the markup', () => {
    const bad = /complete|fully logged|all meals|missed/i;
    expect(read('src/lib/previousDaySnapshot.ts')).not.toMatch(bad);
    expect(read('src/components/PreviousDaySnapshot.tsx')).not.toMatch(bad);
    for (const el of states) expect(text(renderToStaticMarkup(el))).not.toMatch(bad);
  });

  test('no data never shows 0 cal or a status, and has no details button', () => {
    const out = text(renderToStaticMarkup(states[0]));
    expect(out).toContain('Thursday, Nov 5');
    expect(out).toContain('No data');
    expect(out).toContain('No meals logged');
    expect(out).not.toMatch(/\b0\b|cal|target/i);
    expect(renderToStaticMarkup(states[0])).not.toContain('Details');
  });

  test('data shows calories, status in words (not only colour) and the labelled range', () => {
    const html = renderToStaticMarkup(states[2]);
    const out = text(html);
    expect(out).toContain('Yesterday');
    expect(out).toContain('under your minimum');
    expect(out).toContain('Target 2,000\u20132,200 cal \u00b7 Rest day');
    expect(html).toContain('aria-hidden="true">\u2193');
    expect(html).toContain('text-chart-warn');
    expect(html).toContain('aria-label="Details for yesterday"');
    expect(html).toContain('aria-label="Previous day, Thursday, Nov 5"');
    expect(renderToStaticMarkup(states[3])).toContain('text-chart-max');
  });

  test('the Dashboard hands over the meal COUNT, from the same date rule as the calories', () => {
    const dash = read('src/pages/Dashboard.tsx');
    expect(dash).toContain('const yesterdayMeals = useMemo(() => meals.filter((meal) => meal.date === yesterdayStr)');
    expect(dash).toContain('mealCount={yesterdayMealCount}');
    expect(dash).not.toContain('YesterdayStatus');
  });
});
