import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveChartStatus, type ChartSource } from '../src/lib/chartSourceStatus';
import { canExportCsv, csvFilename } from '../src/lib/chartCsv';
import { createChartDataset } from '../src/lib/chartViewerData';
import { selectableChartPoints } from '../src/lib/chartSelection';
import { deriveSharedTableState } from '../src/lib/sharedData';
import { DASHBOARD_SECTION_SOURCES, DASHBOARD_TABLES, resolveDashboardData, type DashboardTable } from '../src/components/feedback/dashboardSections';
import { REPORT_CHART_TABLES, REPORT_TABLES, reportChartStatus, type ReportTable } from '../src/components/feedback/reportSections';
import type { SharedTableState } from '../src/lib/sharedData';

// Chart source status: which tables a chart is computed from, and what the viewer / CSV say when one of them is stale
// or never loaded. Mounted behaviour: tests/mounted/chartSourceStatus.dom.tsx.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const OK: SharedTableState = { phase: 'ready', loadFailed: false, refreshFailed: false, error: null };
const STALE: SharedTableState = { phase: 'ready', loadFailed: false, refreshFailed: true, error: new Error('x') };
const FAILED: SharedTableState = { phase: 'error', loadFailed: true, refreshFailed: false, error: new Error('x') };
const LOADING: SharedTableState = { phase: 'loading', loadFailed: false, refreshFailed: false, error: null };

const dashboard = (overrides: Partial<Record<DashboardTable, SharedTableState>> = {}, extras: { settings?: 'loading' | 'error' | 'ready'; personal?: 'loading' | 'error' | 'ready' } = {}) =>
  resolveDashboardData(
    Object.fromEntries(DASHBOARD_TABLES.map((t) => [t, overrides[t] ?? OK])) as Record<DashboardTable, SharedTableState>,
    { settings: extras.settings ?? 'ready', personal: extras.personal ?? 'ready' },
  );
const reportStates = (overrides: Partial<Record<ReportTable, SharedTableState>> = {}) =>
  Object.fromEntries(REPORT_TABLES.map((t) => [t, overrides[t] ?? OK])) as Record<ReportTable, SharedTableState>;

const src = (label: string, view: ChartSource['view'], refreshFailed = false): ChartSource => ({ label, view, refreshFailed });

describe('deriveChartStatus', () => {
  test('everything loaded and current: no status (a chart makes no claim)', () => {
    assert.equal(deriveChartStatus([src('meals', 'ready'), src('weight', 'ready')]), undefined);
    assert.equal(deriveChartStatus([]), undefined);
  });

  test('a refresh that failed over kept rows is stale, and it names every source that failed', () => {
    const status = deriveChartStatus([src('meals', 'ready', true), src('weight', 'ready'), src('workouts', 'ready', true)]);
    assert.deepEqual(Object.keys(status!), ['stale']);
    assert.equal(status!.stale!.reason, 'The latest refresh of your meals and workouts failed, so this shows the last data that loaded.');
    assert.equal(status!.stale!.asOf, undefined, 'no time is invented');
  });

  test('a first load that failed is unavailable, and wins over stale', () => {
    const status = deriveChartStatus([src('meals', 'ready', true), src('weight', 'error'), src('sleep', 'error')]);
    assert.deepEqual(Object.keys(status!), ['unavailable']);
    assert.equal(status!.unavailable!.reason, "Your weight and sleep didn't load.");
  });

  test('still loading is not a claim (the page shows a skeleton); a failed refresh on a loading source is ignored', () => {
    assert.equal(deriveChartStatus([src('meals', 'ready'), src('weight', 'loading')]), undefined);
    assert.equal(deriveChartStatus([src('weight', 'loading', true)]), undefined);
  });

  test('the same status is the same object, so a memoised dataset is not rebuilt on every page render', () => {
    const a = deriveChartStatus([src('meals', 'ready', true)]);
    const b = deriveChartStatus([src('meals', 'ready', true)]);
    assert.ok(a === b);
  });

  test('a successful refresh clears stale: the status is derived from the live table state, never remembered', () => {
    const failedRefresh = deriveSharedTableState({ signedIn: true, authLoading: false, query: { status: 'error', data: [{ id: 'a' }], error: new Error('net') } });
    assert.equal(failedRefresh.refreshFailed, true);
    const asSource = (s: SharedTableState): ChartSource => ({ label: 'weight', view: s.phase === 'ready' ? 'ready' : s.phase === 'error' ? 'error' : 'loading', refreshFailed: s.refreshFailed });
    assert.ok(deriveChartStatus([asSource(failedRefresh)])?.stale);
    const recovered = deriveSharedTableState({ signedIn: true, authLoading: false, query: { status: 'success', data: [{ id: 'a' }], error: null } });
    assert.equal(deriveChartStatus([asSource(recovered)]), undefined);
  });
});

describe('Dashboard: each chart uses exactly the sources its section needs', () => {
  test('all fine: no chart has a status', () => {
    const { sections } = dashboard();
    for (const [name, s] of Object.entries(sections)) assert.equal(s.chartStatus, undefined, name);
  });

  test('stale if ANY dependency refresh failed; a source the chart does not use does not matter', () => {
    const { sections } = dashboard({ meals: STALE });
    for (const [name, needs] of Object.entries(DASHBOARD_SECTION_SOURCES)) {
      const uses = (needs as readonly string[]).includes('meals');
      assert.equal(!!sections[name as keyof typeof sections].chartStatus?.stale, uses, `${name} ${uses ? 'uses' : 'does not use'} meals`);
    }
    // Spot checks with the chart names people know.
    assert.ok(sections.mealTiming.chartStatus?.stale && sections.macroTrends.chartStatus?.stale && sections.calorieBalance.chartStatus?.stale);
    assert.equal(sections.workoutTrend.chartStatus, undefined, 'Workout Duration reads workouts only');
    assert.equal(sections.recovery.chartStatus, undefined, 'WHOOP Recovery reads WHOOP only');
    assert.equal(sections.weightTrend.chartStatus, undefined);
  });

  test('multi-source charts: Calorie Balance is stale when WHOOP (not meals) failed its refresh, and the reason names it', () => {
    const { sections } = dashboard({ whoop: STALE });
    assert.equal(sections.calorieBalance.chartStatus?.stale?.reason, 'The latest refresh of your WHOOP data failed, so this shows the last data that loaded.');
    assert.ok(sections.sleepTrend.chartStatus?.stale, 'Sleep also reads WHOOP');
    assert.ok(sections.recovery.chartStatus?.stale);
  });

  test('unavailable only for a first-load failure of a source the chart needs; cached sources keep their rows', () => {
    const { sections } = dashboard({ weight: FAILED, meals: STALE });
    assert.equal(sections.weightTrend.chartStatus?.unavailable?.reason, "Your weight didn't load.");
    assert.equal(sections.mealTiming.chartStatus?.stale !== undefined && sections.mealTiming.chartStatus?.unavailable === undefined, true, 'meals kept their rows: stale, not unavailable');
    assert.equal(sections.macroTrends.chartStatus?.unavailable?.reason, "Your weight didn't load.");
    assert.equal(sections.workoutTrend.chartStatus, undefined);
  });

  test('settings / personal targets (not shared tables) can make a chart unavailable but never "stale"', () => {
    assert.equal(dashboard({}, { personal: 'error' }).sections.macroTrends.chartStatus?.unavailable?.reason, "Your personal targets didn't load.");
    assert.equal(dashboard({}, { settings: 'ready', personal: 'ready' }).sections.macroTrends.chartStatus, undefined);
  });

  test('a successful refresh clears every stale status on the next render', () => {
    assert.ok(dashboard({ meals: STALE, gym_sessions: STALE }).sections.macroTrends.chartStatus?.stale);
    const after = dashboard({ meals: OK, gym_sessions: OK });
    for (const s of Object.values(after.sections)) assert.equal(s.chartStatus, undefined);
  });

  test('still loading: no status', () => {
    assert.equal(dashboard({ meals: LOADING }).sections.mealTiming.chartStatus, undefined);
  });

  test('Dashboard hands every chart its section status', () => {
    const page = read('src/pages/Dashboard.tsx');
    for (const [component, section] of [
      ['MealTimeChart', 'mealTiming'], ['RecoveryChart', 'recovery'], ['WorkoutDurationChart', 'workoutTrend'], ['CalorieBalanceChart', 'calorieBalance'],
      ['WeightChart', 'weightTrend'], ['WaistChart', 'waistTrend'], ['SleepChart', 'sleepTrend'],
    ]) assert.match(page, new RegExp(`<${component}[^>]*sections\\.${section}\\.chartStatus`), `${component} <- ${section}`);
    assert.equal((page.match(/<MacroTargetChart status=\{sections\.macroTrends\.chartStatus\}/g) ?? []).length, 3);
  });
});

describe('Reports: each chart uses exactly its own tables', () => {
  test('Calories & Workout reads meals + workouts; Sleep reads sleep; Recomposition reads weight + waist', () => {
    assert.deepEqual([...REPORT_CHART_TABLES.caloriesWorkout], ['meals', 'gym_sessions']);
    assert.deepEqual([...REPORT_CHART_TABLES.sleep], ['sleep']);
    assert.deepEqual([...REPORT_CHART_TABLES.recomposition], ['weight', 'waist']);
  });

  test('stale / unavailable follow only those tables', () => {
    const states = reportStates({ sleep: STALE, waist: FAILED, gym_sessions: STALE });
    assert.equal(reportChartStatus(states, REPORT_CHART_TABLES.sleep)?.stale?.reason, 'The latest refresh of your sleep failed, so this shows the last data that loaded.');
    assert.equal(reportChartStatus(states, REPORT_CHART_TABLES.caloriesWorkout)?.stale?.reason, 'The latest refresh of your workouts failed, so this shows the last data that loaded.');
    assert.equal(reportChartStatus(states, REPORT_CHART_TABLES.recomposition)?.unavailable?.reason, "Your waist didn't load.");
    assert.equal(reportChartStatus(reportStates(), REPORT_CHART_TABLES.sleep), undefined, 'refresh worked: cleared');
  });

  test('Reports hands each chart its status', () => {
    const page = read('src/pages/Reports.tsx');
    assert.match(page, /<ReportCharts data=\{chartData\} status=\{\{ caloriesWorkout: chartStatus\.caloriesWorkout, sleep: chartStatus\.sleep \}\}/);
    assert.match(page, /<BodyRecompositionCard [\s\S]*?status=\{chartStatus\.recomposition\}/);
  });
});

describe('what a status does to a dataset', () => {
  const rows = [{ date: '2026-10-28', weight: 80 }, { date: '2026-10-29', weight: 81 }];
  const make = (status?: ReturnType<typeof deriveChartStatus>) =>
    createChartDataset({ name: 'Weight Trend', period: 'Last 7 days', rows, columns: [{ key: 'date', label: 'Date' }, { key: 'weight', label: 'Weight' }], status, selection: { metric: 'weight', valueKeys: ['weight'] } });

  test('stale keeps the rows, marks the CSV name and still allows export and selection', () => {
    const stale = make(deriveChartStatus([src('weight', 'ready', true)]));
    assert.match(csvFilename(stale), /_2-rows_stale\.csv$/);
    assert.equal(canExportCsv(stale), true);
    assert.equal(selectableChartPoints(stale).length, 2);
    assert.doesNotMatch(csvFilename(make()), /stale/);
  });

  test('unavailable can not export and nothing is selectable', () => {
    const unavailable = make(deriveChartStatus([src('weight', 'error')]));
    assert.equal(canExportCsv(unavailable), false);
    assert.deepEqual(selectableChartPoints(unavailable), []);
  });

  test('every chart that takes a status passes it into createChartDataset', () => {
    for (const file of ['TrendChart', 'MacroTargetChart', 'MealTimeChart', 'BodyRecompositionCard']) {
      assert.match(read(`src/components/${file}.tsx`), /status\??[,:}]|status,/, file);
      assert.match(read(`src/components/${file}.tsx`), /status\?: ChartDatasetStatus/, file);
    }
    const reports = read('src/components/ReportCharts.tsx');
    assert.match(reports, /status: status\?\.caloriesWorkout/);
    assert.match(reports, /status: status\?\.sleep/);
    for (const file of ['WeightChart', 'WaistChart', 'SleepChart', 'RecoveryChart', 'WorkoutDurationChart', 'CalorieBalanceChart']) {
      assert.match(read(`src/components/${file}.tsx`), /<TrendChart status=\{status\}/, file);
    }
  });
});
