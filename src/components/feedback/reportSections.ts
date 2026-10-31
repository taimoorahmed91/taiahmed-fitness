import type { SharedTableState } from '@/lib/sharedData';
import { combineViews, summarizeTables, tableView, type NamedTableState, type TableView } from './tableView';

/** The shared tables the Reports screen reads. */
export const REPORT_TABLES = ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'whoop'] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];

/** Plain words for people, used in the notice and in paused sections. */
export const REPORT_TABLE_LABELS: Record<ReportTable, string> = {
  meals: 'meals',
  gym_sessions: 'workouts',
  weight: 'weight',
  waist: 'waist',
  sleep: 'sleep',
  whoop: 'WHOOP data',
};

/**
 * Which tables each part of the screen needs. A part is only drawn once ALL of them loaded: the numbers are
 * computed from every one, so a table that failed would otherwise look like zeros.
 */
export const REPORT_SECTION_TABLES = {
  digest: ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'whoop'],
  statCalories: ['meals'],
  statWorkouts: ['gym_sessions'],
  statSleep: ['sleep'],
  statWeight: ['weight'],
  charts: ['meals', 'gym_sessions', 'sleep'],
  recomposition: ['weight', 'waist'],
  insights: ['meals', 'gym_sessions', 'sleep', 'whoop'],
  share: ['meals', 'gym_sessions', 'sleep', 'weight'],
} as const satisfies Record<string, readonly ReportTable[]>;

export type ReportSection = keyof typeof REPORT_SECTION_TABLES;

export interface ReportSectionState {
  view: TableView;
  /** Labels of this section's tables whose first load failed (empty unless `view` is 'error'). */
  missing: string[];
}

export interface ReportDataState {
  sections: Record<ReportSection, ReportSectionState>;
  /** Tables whose first load failed. */
  failed: ReportTable[];
  /** Tables whose refresh failed over rows that did load. */
  stale: ReportTable[];
  /** Any table still on its first load. */
  loading: boolean;
}

export const resolveReportData = (states: Record<ReportTable, SharedTableState>): ReportDataState => {
  const named: NamedTableState<ReportTable>[] = REPORT_TABLES.map((key) => ({ key, label: REPORT_TABLE_LABELS[key], state: states[key] }));
  const summary = summarizeTables(named);
  const sections = {} as Record<ReportSection, ReportSectionState>;
  for (const section of Object.keys(REPORT_SECTION_TABLES) as ReportSection[]) {
    const needs: readonly ReportTable[] = REPORT_SECTION_TABLES[section];
    const view = combineViews(needs.map((t) => tableView(states[t])));
    sections[section] = {
      view,
      missing: needs.filter((t) => tableView(states[t]) === 'error').map((t) => REPORT_TABLE_LABELS[t]),
    };
  }
  return {
    sections,
    failed: summary.failed.map((t) => t.key),
    stale: summary.stale.map((t) => t.key),
    loading: summary.loading.length > 0,
  };
};
