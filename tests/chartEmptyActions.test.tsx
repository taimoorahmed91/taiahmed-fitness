import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ROUTES } from '../src/app/navigation';
import { ChartEmptyState, NO_DATA, TREND_NO_DATA } from '../src/components/charts/ChartEmptyState';
import { TrendChart } from '../src/components/TrendChart';
import { MacroTargetChart } from '../src/components/MacroTargetChart';
import { MealTimeChart } from '../src/components/MealTimeChart';
import { BodyRecompositionCard } from '../src/components/BodyRecompositionCard';
import { ReportCharts } from '../src/components/ReportCharts';
import { WeeklyBarChart } from '../src/components/charts/WeeklyBarChart';
import { DeltaChart } from '../src/components/charts/DeltaChart';

// F55: an empty chart links to the page that fixes it ONLY when nothing is logged at all.
// When data exists but sits outside the chosen range, the answer is a wider range, never a link.

const html = (node: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const links = (out: string) => [...out.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
const icon = createElement('span');
const series = [{ key: 'v', label: 'V', color: '#000' }];
const trend = (id: string, data: { date: string; [k: string]: string | number }[], extra: Record<string, unknown> = {}) =>
  html(createElement(TrendChart, { id, title: id, icon, data, series, unit: 'x', empty: 'Nothing in range. Try a wider date range.', ...extra }));

describe('ChartEmptyState with two links', () => {
  test('renders both links, primary first', () => {
    const out = html(createElement(ChartEmptyState, { action: { label: 'A', to: '/a' }, secondaryAction: { label: 'B', to: '/b' } }, 'Empty'));
    assert.deepEqual(links(out), [['/a', 'A'], ['/b', 'B']]);
  });
  test('a secondary action alone renders nothing (primary is required)', () => {
    const out = html(createElement(ChartEmptyState, { secondaryAction: { label: 'B', to: '/b' } }, 'Empty'));
    assert.deepEqual(links(out), []);
  });
});

describe('trend charts', () => {
  const cases: [string, string, string][] = [
    ['weight', ROUTES.weight, 'Add a weigh-in'],
    ['waist', ROUTES.waist, 'Add a measurement'],
    ['sleep', ROUTES.sleep, 'Log last night'],
    ['workout_duration', ROUTES.gym, 'Open Gym'],
    ['recovery', ROUTES.whoopData, 'Open WHOOP data'],
  ];
  for (const [id, to, label] of cases) {
    test(`${id}: no data at all links to ${to} and drops the misleading "wider range" advice`, () => {
      const out = trend(id, []);
      assert.deepEqual(links(out), [[to, label]]);
      assert.equal(out.includes('wider date range'), false);
    });
    test(`${id}: data outside the range keeps the range message and has no link`, () => {
      const out = trend(id, [{ date: '2001-01-01', v: 1 }]);
      assert.match(out, /Try a wider date range/);
      assert.deepEqual(links(out), []);
    });
  }
  test('calorie balance needs meals AND WHOOP, so it has no single honest link', () => {
    assert.equal('calorie_balance' in TREND_NO_DATA, false);
    const out = trend('calorie_balance', []);
    assert.deepEqual(links(out), []);
    assert.match(out, /Try a wider date range/);
  });
  test('noData={null} opts out and an explicit noData overrides the id default', () => {
    assert.deepEqual(links(trend('weight', [], { noData: null })), []);
    const custom = trend('weight', [], { noData: { message: 'Custom.', action: { label: 'Go', to: '/x' } } });
    assert.deepEqual(links(custom), [['/x', 'Go']]);
    assert.match(custom, /Custom\./);
  });
});

describe('intake charts link to Meals', () => {
  const week = (v: number) => Array.from({ length: 7 }, (_, i) => ({ date: `D${i}`, fullDate: `2001-01-0${i + 1}`, calories: v }));
  const weekly = (data: ReturnType<typeof week>, extra: Record<string, unknown> = {}) =>
    html(createElement(WeeklyBarChart, { title: 'Weekly Calories', icon, data, valueKey: 'calories', label: 'Calories', unit: 'kcal', color: '#000', ...extra }));

  test('weekly intake chart: empty last 7 days -> Log a meal, keeps its fixed-window message', () => {
    const out = weekly(week(0));
    assert.deepEqual(links(out), [[ROUTES.meals, 'Log a meal']]);
    assert.match(out, /No calories logged in the last 7 days\./);
  });
  test('weekly intake chart: emptyAction={null} removes the link', () => {
    assert.deepEqual(links(weekly(week(0), { emptyAction: null })), []);
  });
  test('macro target chart: no rows at all -> Log a meal; rows outside the range -> wider range, no link', () => {
    const props = { title: 'Calories', unit: 'cal' };
    assert.deepEqual(links(html(createElement(MacroTargetChart, { ...props, data: [] }))), [[ROUTES.meals, 'Log a meal']]);
    const stale = html(createElement(MacroTargetChart, { ...props, data: [{ date: '2001-01-01', actual: 1, min: null, max: null }] }));
    assert.deepEqual(links(stale), []);
    assert.match(stale, /Try a wider date range/);
  });
  test('meal time chart: nothing in 90 days -> Log a meal; meals only in a longer window -> wider range, no link', () => {
    const none: { name: string; calories: number; count: number }[] = [];
    const some = [{ name: 'Morning', calories: 300, count: 1 }];
    const mount = (d7: typeof none, d90: typeof none) => html(createElement(MealTimeChart, { data7: d7, data14: d7, data30: d7, data90: d90 }));
    assert.deepEqual(links(mount(none, none)), [[ROUTES.meals, 'Log a meal']]);
    const widerOnly = mount(none, some);
    assert.deepEqual(links(widerOnly), []);
    assert.match(widerOnly, /Try a wider date range/);
  });
});

describe('body charts link to Weight and Waist', () => {
  test('recomposition: nothing logged -> both pages; one logged but out of range -> range message only', () => {
    const none = html(createElement(BodyRecompositionCard, { weight: [], waist: [] }));
    assert.deepEqual(links(none), [[ROUTES.weight, 'Add a weigh-in'], [ROUTES.waist, 'Add a measurement']]);
    const stale = html(createElement(BodyRecompositionCard, { weight: [{ date: '2001-01-01', value: 80 }], waist: [] }));
    assert.deepEqual(links(stale), []);
    assert.match(stale, /Try a wider date range/);
  });
  test('delta charts: logging is the fix, so kg -> Weight, cm -> Waist, other units none, null opts out', () => {
    const delta = (unit: string, extra: Record<string, unknown> = {}) =>
      html(createElement(DeltaChart, { title: 'Change', icon, unit, entries: [], emptyText: 'Log two entries.', ...extra }));
    assert.deepEqual(links(delta('kg')), [[ROUTES.weight, NO_DATA.weight.action.label]]);
    assert.deepEqual(links(delta('cm')), [[ROUTES.waist, NO_DATA.waist.action.label]]);
    assert.deepEqual(links(delta('bpm')), []);
    assert.deepEqual(links(delta('kg', { emptyAction: null })), []);
  });
});

describe('report charts stay link-free', () => {
  test('the report period is the remedy and the data mixes meals, workouts and sleep', () => {
    const out = html(createElement(ReportCharts, { data: [] }));
    assert.deepEqual(links(out), []);
    assert.match(out, /No data in the selected report period\./);
  });
});
