import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StatsCards } from '../src/components/StatsCards';
import { ChartEmptyState } from '../src/components/charts/ChartEmptyState';
import { MealRemainingSummary, MEAL_DATE_TIME_NOTE } from '../src/components/MealForm';
import { readTabParam, withTabParam } from '../src/lib/urlTab';
import { hookLoadFailed, resolveListStatus } from '../src/lib/loadState';

// Corrective lane D: dashboard order + reminder links, Gym tab in the URL, honest Gym loading,
// meal form wording and phone summary, chart empty-state action, chart summary on demand.
// react-dom/server warns that useLayoutEffect (used by react-router's Link) does nothing on the server. Expected here.
const realError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  realError(...args);
};

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = (node: React.ReactElement, url = '/') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, node));
const before = (src: string, a: string, b: string) => {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  assert.ok(ia >= 0, `missing: ${a}`);
  assert.ok(ib >= 0, `missing: ${b}`);
  assert.ok(ia < ib, `${a} should come before ${b}`);
};

describe('F26/F27 dashboard order', () => {
  const src = read('src/pages/Dashboard.tsx');
  test('targets, then reminders, then the raw meal list', () => {
    before(src, '<CalorieGoalProgress', '<StatsCards');
    before(src, '<ProteinTargetCard', '<StatsCards');
    before(src, '<CarbTargetCard', '<StatsCards');
    before(src, '<StatsCards', 'Meals{mealsView');
  });
  test('the meal list stays inside the Today section, before yesterday/trends', () => {
    before(src, 'Meals{mealsView', '<YesterdayStatus');
    before(src, '<YesterdayStatus', '<PageSection title="Trends"');
  });
});

describe('F26/F27 reminder cards are real links', () => {
  const props = {
    weightMeasurementInterval: 3,
    waistMeasurementInterval: 7,
    gymSessions: [],
    weightEntries: [],
    waistEntries: [],
    whoopEntries: [],
  };
  test('each loaded tile is an <a> to its page, with an accessible destination', () => {
    const out = html(createElement(StatsCards, { ...props, loading: false }));
    for (const [href, name] of [['/gym', 'Gym'], ['/weight', 'Weight'], ['/waist', 'Waist'], ['/whoop-data', 'WHOOP data']]) {
      assert.match(out, new RegExp(`<a [^>]*href="${href}"`), href);
      assert.ok(out.includes(`Open ${name}`), name);
    }
    assert.equal((out.match(/<a /g) ?? []).length, 4);
  });
  test('tiles are not links (or buttons) while loading', () => {
    const out = html(createElement(StatsCards, { ...props, loading: true }));
    assert.equal(out.includes('<a '), false);
    assert.equal(out.includes('<button'), false);
  });
  test('links keep a visible focus ring', () => {
    assert.match(html(createElement(StatsCards, { ...props, loading: false })), /focus-visible:ring-2/);
  });
});

describe('F30 gym tab lives in the URL', () => {
  const TABS = ['log', 'templates', 'records'] as const;
  test('reads a valid tab, falls back for missing or invalid ones', () => {
    assert.equal(readTabParam('?tab=templates', TABS, 'log'), 'templates');
    assert.equal(readTabParam(new URLSearchParams('tab=records'), TABS, 'log'), 'records');
    assert.equal(readTabParam('', TABS, 'log'), 'log');
    assert.equal(readTabParam('?tab=nope', TABS, 'log'), 'log');
    assert.equal(readTabParam('?tab=', TABS, 'log'), 'log');
    assert.equal(readTabParam('?tab=constructor', TABS, 'log'), 'log');
  });
  test('writing keeps other params and removes the default tab from the address', () => {
    assert.equal(withTabParam('?x=1', 'records', 'log').toString(), 'x=1&tab=records');
    assert.equal(withTabParam('?x=1&tab=records', 'log', 'log').toString(), 'x=1');
    assert.equal(withTabParam('', 'log', 'log').toString(), '');
    assert.equal(withTabParam('?tab=templates', 'records', 'log').toString(), 'tab=records');
  });
  test('writing does not change the params object it was given', () => {
    const original = new URLSearchParams('tab=templates');
    withTabParam(original, 'log', 'log');
    assert.equal(original.toString(), 'tab=templates');
  });
  test('Gym uses the URL tab (controlled tabs, pushed history entries), not local state', () => {
    const src = read('src/pages/Gym.tsx');
    assert.match(src, /useSearchParams\(\)/);
    assert.match(src, /readTabParam<GymTab>\(searchParams, GYM_TABS, DEFAULT_GYM_TAB\)/);
    assert.match(src, /<Tabs value=\{tab\} onValueChange=\{handleTabChange\}/);
    assert.equal(/<Tabs defaultValue/.test(src), false);
    // No { replace: true }: each tab change is a history entry so Back/Forward walk the tabs.
    assert.equal(/setSearchParams\([^)]*replace/.test(src), false);
    assert.match(src, /DEFAULT_GYM_TAB: GymTab = 'log'/);
  });
});

describe('F59 honest Gym loading / error / empty', () => {
  test('resolveListStatus never calls a loading or failed list empty', () => {
    assert.equal(resolveListStatus({ loading: true, failed: false, count: 0 }), 'loading');
    assert.equal(resolveListStatus({ loading: true, failed: true, count: 0 }), 'loading');
    assert.equal(resolveListStatus({ loading: false, failed: true, count: 0 }), 'error');
    assert.equal(resolveListStatus({ loading: false, failed: false, count: 0 }), 'empty');
    assert.equal(resolveListStatus({ loading: false, failed: false, count: 3 }), 'ready');
    // Rows we already have stay visible when only a refresh failed.
    assert.equal(resolveListStatus({ loading: false, failed: true, count: 3 }), 'ready');
  });
  test('hookLoadFailed feature-detects whichever failure field a hook has, and defaults to "no failure"', () => {
    assert.equal(hookLoadFailed({ loading: false, sessions: [] }), false);
    assert.equal(hookLoadFailed({ error: null }), false);
    assert.equal(hookLoadFailed({ error: new Error('x') }), true);
    assert.equal(hookLoadFailed({ isError: true }), true);
    assert.equal(hookLoadFailed({ loadError: 'x' }), true);
    assert.equal(hookLoadFailed({ isError: false, error: false }), false);
  });
  test('Gym reads the real gym_sessions table state and shows paused parts (with one page-level retry) instead of an empty list', () => {
    const src = read('src/pages/Gym.tsx');
    assert.match(src, /useSharedTableState\('gym_sessions'\)/);
    assert.doesNotMatch(src, /hookLoadFailed|resolveListStatus/);
    assert.match(src, /sections\.history\.view === 'loading' \? \(\s*<div className="space-y-6" aria-hidden="true">/);
    assert.match(src, /sections\.history\.view === 'error' \? \(\s*<SectionUnavailable/);
    assert.match(src, /<PartialDataNotice[\s\S]*onRetry=\{retryGym\}/);
    assert.match(src, /<LoadingAnnouncement loading=\{sessionsLoading \|\| templatesLoading\} label="Loading workouts"/);
    // GymList (with its own empty text) only renders after the loading and error branches.
    before(src, "sections.history.view === 'loading' ? (", '<GymList');
    before(src, "sections.history.view === 'error' ? (", '<GymList');
    // "Already done today" is not claimed before sessions AND templates have loaded.
    assert.match(src, /if \(sections\.today\.view !== 'ready'\) return null;/);
  });
  test('Gym does not touch the active-workout flow', () => {
    const src = read('src/pages/Gym.tsx');
    assert.match(src, /<ActiveWorkoutModal\s+template=\{activeTemplate\}/);
    assert.match(src, /historySessions=\{sessions\}/);
  });
});

describe('F47 date/time wording', () => {
  test('the note says local time, UTC day, the 00:00 UTC reset and the near-midnight effect', () => {
    assert.match(MEAL_DATE_TIME_NOTE, /local time/i);
    assert.match(MEAL_DATE_TIME_NOTE, /UTC/);
    assert.match(MEAL_DATE_TIME_NOTE, /00:00 UTC/);
    assert.match(MEAL_DATE_TIME_NOTE, /previous day/i);
    assert.ok(MEAL_DATE_TIME_NOTE.length < 220, 'stays concise');
  });
  test('time and date fields point at the note; the add form and edit dialog both show it', () => {
    const form = read('src/components/MealForm.tsx');
    assert.equal((form.match(/describedBy="meal-datetime-note"/g) ?? []).length, 2);
    assert.match(form, /<MealDateTimeNote id="meal-datetime-note" \/>/);
    assert.match(form, /aria-describedby=\{\[error \? errorId : null, describedBy \?\? null\]/);
    const page = read('src/pages/Meals.tsx');
    assert.equal((page.match(/describedBy="edit-meal-datetime-note"/g) ?? []).length, 2);
    assert.match(page, /<MealDateTimeNote id="edit-meal-datetime-note" \/>/);
  });
  test('stored semantics are unchanged (still the UTC day helper)', () => {
    const lib = read('src/lib/mealDateTime.ts');
    assert.match(lib, /toISOString\(\)\.slice\(0, 10\)/);
  });
});

describe('F50 phone calorie summary above the meal form', () => {
  test('summary renders remaining, over-budget and is a labelled group', () => {
    const left = renderToStaticMarkup(createElement(MealRemainingSummary, { eaten: 1200, max: 2000 }));
    assert.match(left, /aria-label="Calories left today"/);
    assert.match(left, /Left today/);
    assert.match(left, /800/);
    assert.match(left, /1,200<\/span> of 2,000 cal eaten/);
    const over = renderToStaticMarkup(createElement(MealRemainingSummary, { eaten: 2150, max: 2000 }));
    assert.match(over, /Over today&#x27;s max by/);
    assert.match(over, /150/);
    assert.match(over, /text-chart-max/);
  });
  test('on Meals it comes before the form and is hidden from lg up (no second summary beside the full card)', () => {
    const src = read('src/pages/Meals.tsx');
    before(src, '<MealRemainingSummary', '<MealForm onSubmit');
    before(src, '<MealForm onSubmit', '<MealsTodayCard');
    assert.match(src, /<MealRemainingSummary[^>]*className="lg:hidden"/);
    assert.equal((src.match(/<MealRemainingSummary/g) ?? []).length, 1);
  });
});

describe('F55 chart empty-state action contract', () => {
  test('without an action there is no link and no button', () => {
    const out = html(createElement(ChartEmptyState, null, 'No meals yet.'));
    assert.match(out, /role="status"/);
    assert.equal(out.includes('<a '), false);
    assert.equal(out.includes('<button'), false);
  });
  test('with an action it is a real link to the given page', () => {
    const out = html(createElement(ChartEmptyState, { action: { label: 'Log a meal', to: '/meals' } }, 'No meals yet.'));
    assert.match(out, /<a [^>]*href="\/meals"[^>]*>Log a meal<\/a>/);
    assert.equal(out.includes('<button'), false);
  });
  test('the contract is typed (label and to are both required) and documented', () => {
    const src = read('src/components/charts/ChartEmptyState.tsx');
    assert.match(src, /interface ChartEmptyAction \{\s*[\s\S]*label: string;[\s\S]*to: string;/);
    assert.match(src, /action\?: ChartEmptyAction/);
  });
});

describe('F21 chart summary visible on demand', () => {
  const src = read('src/components/charts/ChartFigure.tsx');
  test('summary sits in a closed <details> that is also the aria-describedby target', () => {
    assert.match(src, /<details data-chart-summary/);
    assert.equal(/<details[^>]*\bopen\b/.test(src), false);
    assert.match(src, /<summary [^>]*>\s*Chart summary\s*<\/summary>/);
    assert.match(src, /<p id=\{`\$\{id\}-summary`\}[^>]*>\{summary\}<\/p>/);
    assert.match(src, /aria-describedby=\{`\$\{id\}-summary`\}/);
  });
  test('the summary toggle meets the 44px touch target and is left out of PDFs', () => {
    assert.match(src, /\[@media\(pointer:coarse\)\]:min-h-11/);
    assert.match(src, /<details data-chart-summary data-html2canvas-ignore="true"/);
  });
  test('the screen-reader data table is kept and the full table is not dumped on screen', () => {
    assert.match(src, /<div className="sr-only" data-html2canvas-ignore="true">\s*<table>/);
  });
});

describe('PDF button sizing', () => {
  const src = read('src/components/ChartPdfButton.tsx');
  test('uses the shared sm button size (which already guarantees 44px on touch) with no height overrides', () => {
    assert.match(src, /size="sm"/);
    assert.equal(/\bh-[78]\b/.test(src), false);
    assert.equal(/pointer:coarse/.test(src), false);
    assert.match(read('src/components/ui/button.tsx'), /sm: "h-9 rounded-md px-3 \[@media\(pointer:coarse\)\]:min-h-11"/);
  });
});
