import type { SharedTableState } from '@/lib/sharedData';
import { combineViews, joinLabels, summarizeTables, tableView, type NamedTableState, type TableView } from './tableView';

/** The shared tables the Dashboard reads. */
export const DASHBOARD_TABLES = [
  'meals',
  'gym_sessions',
  'weight',
  'waist',
  'sleep',
  'whoop',
  'extra_activities',
  'daily_notes',
] as const;
export type DashboardTable = (typeof DASHBOARD_TABLES)[number];

/**
 * Inputs the Dashboard also needs that are NOT shared tables (they have their own hooks).
 * The page tells us where each one is as a plain view: loading, error or ready.
 */
export const DASHBOARD_EXTRA_SOURCES = ['settings', 'personal'] as const;
export type DashboardExtraSource = (typeof DASHBOARD_EXTRA_SOURCES)[number];
export type DashboardSource = DashboardTable | DashboardExtraSource;

/** Plain words for people, used in the notice and in paused sections. */
export const DASHBOARD_LABELS: Record<DashboardSource, string> = {
  meals: 'meals',
  gym_sessions: 'workouts',
  weight: 'weight',
  waist: 'waist',
  sleep: 'sleep',
  whoop: 'WHOOP data',
  extra_activities: 'extra activities',
  daily_notes: 'daily notes',
  settings: 'settings',
  personal: 'personal targets',
};

/**
 * What each block of the Dashboard is computed from. A block draws numbers only when ALL of its
 * sources loaded (or a refresh failed over rows that did load). A source that never loaded would
 * otherwise look like zero calories, "no meals", "no workout today" or a default target.
 */
export const DASHBOARD_SECTION_SOURCES = {
  calorieToday: ['meals', 'gym_sessions', 'extra_activities', 'settings', 'personal'],
  measurementSettings: ['settings'],
  proteinTarget: ['meals', 'weight', 'personal'],
  carbTarget: ['meals', 'weight', 'personal'],
  reminderWorkout: ['gym_sessions', 'personal'],
  reminderWeight: ['weight', 'settings'],
  reminderWaist: ['waist', 'settings'],
  reminderWhoop: ['whoop'],
  mealsToday: ['meals'],
  yesterday: ['meals', 'gym_sessions', 'extra_activities', 'settings', 'personal'],
  mealTiming: ['meals'],
  recovery: ['whoop'],
  macroTrends: ['meals', 'gym_sessions', 'extra_activities', 'weight', 'settings', 'personal'],
  workoutTrend: ['gym_sessions'],
  calorieBalance: ['meals', 'whoop'],
  weightTrend: ['weight', 'daily_notes'],
  waistTrend: ['waist', 'daily_notes'],
  sleepTrend: ['sleep', 'whoop', 'daily_notes'],
  insights: ['meals', 'gym_sessions', 'sleep', 'whoop', 'weight', 'waist'],
} as const satisfies Record<string, readonly DashboardSource[]>;

export type DashboardSection = keyof typeof DASHBOARD_SECTION_SOURCES;

export interface DashboardSectionState {
  view: TableView;
  /** Labels of this block's sources whose first load failed (empty unless `view` is 'error'). */
  missing: string[];
}

export interface DashboardDataState {
  sections: Record<DashboardSection, DashboardSectionState>;
  /** Sources whose first load failed (nothing to show for them). */
  failed: DashboardSource[];
  /** Tables whose refresh failed over rows that did load (still shown, may be out of date). */
  stale: DashboardTable[];
  /** Any source still on its first load. */
  loading: boolean;
}

const sourceView = (
  source: DashboardSource,
  states: Record<DashboardTable, SharedTableState>,
  extras: Record<DashboardExtraSource, TableView>,
): TableView =>
  (DASHBOARD_TABLES as readonly string[]).includes(source)
    ? tableView(states[source as DashboardTable])
    : extras[source as DashboardExtraSource];

export const resolveDashboardData = (
  states: Record<DashboardTable, SharedTableState>,
  extras: Record<DashboardExtraSource, TableView>,
): DashboardDataState => {
  const named: NamedTableState<DashboardTable>[] = DASHBOARD_TABLES.map((key) => ({
    key,
    label: DASHBOARD_LABELS[key],
    state: states[key],
  }));
  const summary = summarizeTables(named);

  const sections = {} as Record<DashboardSection, DashboardSectionState>;
  for (const section of Object.keys(DASHBOARD_SECTION_SOURCES) as DashboardSection[]) {
    const needs: readonly DashboardSource[] = DASHBOARD_SECTION_SOURCES[section];
    const views = needs.map((s) => sourceView(s, states, extras));
    sections[section] = {
      view: combineViews(views),
      missing: needs.filter((s) => sourceView(s, states, extras) === 'error').map((s) => DASHBOARD_LABELS[s]),
    };
  }

  const failedExtras = DASHBOARD_EXTRA_SOURCES.filter((s) => extras[s] === 'error');
  const loadingExtras = DASHBOARD_EXTRA_SOURCES.some((s) => extras[s] === 'loading');
  return {
    sections,
    failed: [...summary.failed.map((t) => t.key), ...failedExtras],
    stale: summary.stale.map((t) => t.key),
    loading: summary.loading.length > 0 || loadingExtras,
  };
};

/** Plain sentence for a block that cannot be drawn because some of its data never loaded. */
export const dashboardPausedText = (missing: readonly string[]): string => {
  return `Needs your ${joinLabels(missing) || 'data'}, which didn't load. Use Try again at the top of the page.`;
};
