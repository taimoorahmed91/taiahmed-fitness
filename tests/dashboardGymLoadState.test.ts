import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StatsCards } from '../src/components/StatsCards';
import {
  DASHBOARD_SECTION_SOURCES,
  DASHBOARD_TABLES,
  dashboardPausedText,
  resolveDashboardData,
  type DashboardTable,
} from '../src/components/feedback/dashboardSections';
import { GYM_SECTION_SOURCES, resolveGymData, resolveTemplatesState, sourceFromTable } from '../src/components/feedback/gymLoadState';
import type { TableView } from '../src/components/feedback/tableView';
import type { SharedTableState } from '../src/lib/sharedData';

// Dashboard + Gym readiness: loading vs first-load failure vs kept rows after a failed refresh vs a true empty table.
const realError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
  realError(...args);
};
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = (node: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/'] }, node));
const unescape = (s: string) => s.replace(/&#x27;/g, "'");

const state = (phase: SharedTableState['phase'], refreshFailed = false): SharedTableState => ({
  phase,
  loadFailed: phase === 'error',
  refreshFailed,
  error: phase === 'error' || refreshFailed ? new Error('Failed to fetch') : null,
});
const tables = (s: SharedTableState): Record<DashboardTable, SharedTableState> =>
  Object.fromEntries(DASHBOARD_TABLES.map((t) => [t, s])) as Record<DashboardTable, SharedTableState>;
const extras = (v: TableView = 'ready') => ({ settings: v, personal: v });

describe('Dashboard readiness', () => {
  test('everything loading: every block loading, nothing failed, nothing stale', () => {
    const d = resolveDashboardData(tables(state('loading')), extras('loading'));
    assert.ok(Object.values(d.sections).every((s) => s.view === 'loading'));
    assert.equal(d.loading, true);
    assert.deepEqual(d.failed, []);
    assert.deepEqual(d.stale, []);
  });

  test('everything loaded (even if every table is empty): every block ready, no notice', () => {
    const d = resolveDashboardData(tables(state('ready')), extras());
    assert.ok(Object.values(d.sections).every((s) => s.view === 'ready'));
    assert.deepEqual([d.failed, d.stale, d.loading], [[], [], false]);
  });

  test('every shared table the Dashboard reads gates at least one block, and a failure of it pauses exactly those blocks', () => {
    for (const table of DASHBOARD_TABLES) {
      const d = resolveDashboardData({ ...tables(state('ready')), [table]: state('error') }, extras());
      const blocked = Object.entries(DASHBOARD_SECTION_SOURCES).filter(([, needs]) => (needs as readonly string[]).includes(table)).map(([name]) => name);
      assert.ok(blocked.length > 0, `${table} gates nothing`);
      for (const [name, section] of Object.entries(d.sections)) {
        assert.equal(section.view, blocked.includes(name) ? 'error' : 'ready', `${table} -> ${name}`);
      }
      assert.deepEqual(d.failed, [table]);
    }
  });

  test('numbers built from meals, workouts, extra activities, settings or targets never draw when any of them failed', () => {
    const calorieBlocks = ['calorieToday', 'yesterday', 'macroTrends'] as const;
    for (const source of ['meals', 'gym_sessions', 'extra_activities'] as const) {
      const d = resolveDashboardData({ ...tables(state('ready')), [source]: state('error') }, extras());
      for (const b of calorieBlocks) assert.equal(d.sections[b].view, 'error', `${source} -> ${b}`);
    }
    for (const source of ['settings', 'personal'] as const) {
      const d = resolveDashboardData(tables(state('ready')), { ...extras(), [source]: 'error' });
      for (const b of calorieBlocks) assert.equal(d.sections[b].view, 'error', `${source} -> ${b}`);
      assert.deepEqual(d.failed, [source]);
    }
  });

  test('cross-metric insights need meals, workouts, sleep, WHOOP, weight and waist', () => {
    assert.deepEqual([...DASHBOARD_SECTION_SOURCES.insights].sort(), ['gym_sessions', 'meals', 'sleep', 'waist', 'weight', 'whoop']);
  });

  test('an error shows at once, even while other sources still load', () => {
    const d = resolveDashboardData({ ...tables(state('loading')), meals: state('error') }, extras('loading'));
    assert.equal(d.sections.mealsToday.view, 'error');
    assert.equal(d.sections.calorieToday.view, 'error');
    assert.equal(d.sections.recovery.view, 'loading');
  });

  test('a failed refresh over kept rows keeps every block ready and is reported as stale', () => {
    const d = resolveDashboardData({ ...tables(state('ready')), meals: state('ready', true), weight: state('ready', true) }, extras());
    assert.ok(Object.values(d.sections).every((s) => s.view === 'ready'));
    assert.deepEqual(d.stale, ['meals', 'weight']);
    assert.deepEqual(d.failed, []);
  });

  test('missing labels are plain words', () => {
    const d = resolveDashboardData({ ...tables(state('ready')), gym_sessions: state('error'), whoop: state('error') }, extras());
    assert.deepEqual(d.sections.insights.missing, ['workouts', 'WHOOP data']);
    assert.equal(dashboardPausedText(['workouts', 'WHOOP data']), "Needs your workouts and WHOOP data, which didn't load. Use Try again at the top of the page.");
  });
});

describe('StatsCards reminders', () => {
  const props = { weightMeasurementInterval: 3, waistMeasurementInterval: 7, gymSessions: [], weightEntries: [], waistEntries: [], whoopEntries: [], workoutDays: [0, 1, 2, 3, 4, 5, 6] };

  test('a tile whose data never loaded makes no claim, no link and says the reminder is paused', () => {
    const out = unescape(html(createElement(StatsCards, { ...props, tileStatus: { workout: 'error', weight: 'error', waist: 'error', whoop: 'error' } })));
    assert.equal(out.includes('<a '), false);
    assert.equal(out.includes('<button'), false);
    assert.equal((out.match(/Reminder paused/g) ?? []).length, 4);
    for (const claim of ['Rest day', 'workout day', 'Get moving', 'Measure your weight', 'Measure your waist', 'Next measurement', 'Not synced yet', 'Data synced', 'On track', 'All good']) {
      assert.equal(out.includes(claim), false, claim);
    }
    assert.ok(out.includes("Couldn't load your workouts"));
    assert.ok(out.includes("Couldn't load your weight entries"));
    assert.ok(out.includes("Couldn't load your waist entries"));
    assert.ok(out.includes("Couldn't load your WHOOP data"));
  });

  test('tiles are independent: one paused tile does not pause or unlink the others', () => {
    const out = html(createElement(StatsCards, { ...props, tileStatus: { workout: 'ready', weight: 'error', waist: 'loading', whoop: 'ready' } }));
    assert.match(out, /<a [^>]*href="\/gym"/);
    assert.match(out, /<a [^>]*href="\/whoop-data"/);
    assert.equal(/<a [^>]*href="\/weight"/.test(out), false);
    assert.equal(/<a [^>]*href="\/waist"/.test(out), false);
    assert.equal((out.match(/<a /g) ?? []).length, 2);
    assert.equal((out.match(/Reminder paused/g) ?? []).length, 1);
  });

  test('loading tiles are skeletons, not paused and not claims', () => {
    const out = html(createElement(StatsCards, { ...props, tileStatus: { workout: 'loading', weight: 'loading', waist: 'loading', whoop: 'loading' } }));
    assert.equal(out.includes('<a '), false);
    assert.equal(out.includes('Reminder paused'), false);
    assert.equal(out.includes('Measure your'), false);
  });

  test('without tileStatus the old `loading` prop still decides', () => {
    assert.equal(html(createElement(StatsCards, { ...props, loading: true })).includes('<a '), false);
    assert.equal((html(createElement(StatsCards, { ...props, loading: false })).match(/<a /g) ?? []).length, 4);
  });
});

describe('Gym readiness', () => {
  const sessionsReady = sourceFromTable(state('ready'));

  test('templates: loading, a failed first load, and kept rows after a failed refresh are different', () => {
    assert.deepEqual(resolveTemplatesState({ loading: true, count: 0 }), { view: 'loading', refreshFailed: false });
    assert.deepEqual(resolveTemplatesState({ loading: true, loadFailed: true, count: 0 }), { view: 'loading', refreshFailed: false });
    assert.deepEqual(resolveTemplatesState({ loading: false, loadFailed: true, error: new Error('x'), count: 0 }), { view: 'error', refreshFailed: false });
    assert.deepEqual(resolveTemplatesState({ loading: false, refreshFailed: true, error: new Error('x'), count: 3 }), { view: 'ready', refreshFailed: true });
    // A failure flag over rows we hold never hides them.
    assert.deepEqual(resolveTemplatesState({ loading: false, loadFailed: true, count: 2 }), { view: 'ready', refreshFailed: true });
    // A known-empty list whose refresh failed is still a (stale) empty list, not an error.
    assert.deepEqual(resolveTemplatesState({ loading: false, refreshFailed: true, count: 0 }), { view: 'ready', refreshFailed: true });
    // A hook that only exposes `error`: no rows + error is unknown, never empty.
    assert.deepEqual(resolveTemplatesState({ loading: false, error: new Error('x'), count: 0 }), { view: 'error', refreshFailed: false });
    assert.deepEqual(resolveTemplatesState({ loading: false, error: null, loadFailed: false, refreshFailed: false, count: 0 }), { view: 'ready', refreshFailed: false });
  });

  test('sessions come from the real shared table state', () => {
    assert.deepEqual(sourceFromTable(state('loading')), { view: 'loading', refreshFailed: false });
    assert.deepEqual(sourceFromTable(state('error')), { view: 'error', refreshFailed: false });
    assert.deepEqual(sourceFromTable(state('ready', true)), { view: 'ready', refreshFailed: true });
  });

  test('a failed sessions load pauses history, templates (their run counts), records and Today; templates failing pauses all but history', () => {
    const noSessions = resolveGymData({ sessions: sourceFromTable(state('error')), templates: { view: 'ready', refreshFailed: false } });
    for (const part of ['history', 'templates', 'records', 'today'] as const) assert.equal(noSessions.sections[part].view, 'error', part);
    assert.deepEqual(noSessions.failed, ['sessions']);
    const noTemplates = resolveGymData({ sessions: sessionsReady, templates: { view: 'error', refreshFailed: false } });
    assert.equal(noTemplates.sections.history.view, 'ready');
    for (const part of ['templates', 'records', 'today'] as const) assert.equal(noTemplates.sections[part].view, 'error', part);
    assert.deepEqual(noTemplates.sections.templates.missing, ['workout templates']);
    assert.deepEqual(GYM_SECTION_SOURCES.history, ['sessions']);
  });

  test('kept rows after a failed refresh stay ready and are listed as stale', () => {
    const d = resolveGymData({ sessions: sourceFromTable(state('ready', true)), templates: { view: 'ready', refreshFailed: true } });
    assert.ok(Object.values(d.sections).every((s) => s.view === 'ready'));
    assert.deepEqual(d.stale, ['sessions', 'templates']);
    assert.deepEqual(d.failed, []);
  });

  test('loading anywhere keeps the dependent parts on placeholders', () => {
    const d = resolveGymData({ sessions: sessionsReady, templates: { view: 'loading', refreshFailed: false } });
    assert.equal(d.sections.history.view, 'ready');
    for (const part of ['templates', 'records', 'today'] as const) assert.equal(d.sections[part].view, 'loading', part);
    assert.equal(d.loading, true);
  });
});

describe('page wiring (source)', () => {
  const dash = read('src/pages/Dashboard.tsx');
  const gym = read('src/pages/Gym.tsx');

  test('Dashboard reads the real state of all eight shared tables and the shared notice/unavailable primitives', () => {
    for (const table of DASHBOARD_TABLES) assert.match(dash, new RegExp(`useSharedTableState\\('${table}'\\)`), table);
    assert.match(dash, /<PartialDataNotice/);
    assert.match(dash, /<SectionUnavailable/);
    assert.match(dash, /<StatsCards[\s\S]*tileStatus=\{tileStatus\}/);
  });

  test('Dashboard no longer decides readiness from loading flags alone, and the insights card is gated', () => {
    assert.equal(/todayReady|targetsReady/.test(dash), false);
    assert.match(dash, /gate\('insights'[\s\S]*<CrossMetricSummaryCard \/>/);
    // The only place CrossMetricSummaryCard renders is inside that gate.
    assert.equal((dash.match(/<CrossMetricSummaryCard/g) ?? []).length, 1);
  });

  test('Dashboard retry is the single-flight batch, not a second fetch path', () => {
    assert.match(dash, /refetchAll\(\)/);
    // The header freshness retry and the page notice share the one retry.
    assert.equal((dash.match(/onRetry=\{retryDashboard\}/g) ?? []).length, 2);
    assert.equal(/onRetry=\{refetchAll\}/.test(dash), false);
  });

  test('Gym reads gym_sessions through the table state, not by probing optional hook properties', () => {
    assert.match(gym, /useSharedTableState\('gym_sessions'\)/);
    assert.equal(/hookLoadFailed|resolveListStatus/.test(gym), false);
  });

  test('Gym keeps URL-tab and paused-workout behaviour', () => {
    assert.match(gym, /readTabParam<GymTab>\(searchParams, GYM_TABS, DEFAULT_GYM_TAB\)/);
    assert.match(gym, /<Tabs value=\{tab\} onValueChange=\{handleTabChange\}/);
    assert.match(gym, /resolveDraft\(/);
    assert.match(gym, /<ActiveWorkoutModal\s+template=\{activeTemplate\}/);
    assert.match(gym, /historySessions=\{sessions\}/);
  });
});
