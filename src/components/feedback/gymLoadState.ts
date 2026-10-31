import type { SharedTableState } from '@/lib/sharedData';
import { combineViews, tableView, type TableView } from './tableView';

/** The two sources the Gym screen reads. Sessions are a shared table; templates have their own hook. */
export type GymSource = 'sessions' | 'templates';

export const GYM_LABELS: Record<GymSource, string> = {
  sessions: 'workouts',
  templates: 'workout templates',
};

/**
 * What each part of the Gym screen is computed from. Template cards say "never run" / "No runs logged yet"
 * from the workout history, and "Today: <template>" needs both, so those parts wait for both sources.
 * (The manual "Start a workout" form needs neither, so it is always available.)
 */
export const GYM_SECTION_SOURCES = {
  history: ['sessions'],
  templates: ['templates', 'sessions'],
  records: ['sessions', 'templates'],
  today: ['sessions', 'templates'],
} as const satisfies Record<string, readonly GymSource[]>;

export type GymSection = keyof typeof GYM_SECTION_SOURCES;

/**
 * Load flags a templates hook may expose. The templates hook is being moved onto explicit load state;
 * every field is optional so this keeps working (and keeps type checking) on a hook without them.
 */
export interface TemplatesLoadFlags {
  loadFailed?: boolean;
  refreshFailed?: boolean;
  error?: unknown;
}

export interface SourceState {
  view: TableView;
  /** A refresh failed over rows that did load (the rows are kept and may be out of date). */
  refreshFailed: boolean;
}

/** A shared table's state as a Gym source. */
export const sourceFromTable = (state: SharedTableState): SourceState => ({
  view: tableView(state),
  refreshFailed: tableView(state) === 'ready' && state.refreshFailed,
});

/**
 * Templates view from the hook's explicit flags.
 * - still on the first load: loading
 * - the first load failed and there is nothing to show: error (never an empty list)
 * - a refresh failed over rows we have (or a known-empty list): ready, flagged stale
 * Without any flag (a hook that does not report failures yet) this can only say loading or ready.
 */
export const resolveTemplatesState = (input: TemplatesLoadFlags & { loading: boolean; count: number }): SourceState => {
  if (input.loading) return { view: 'loading', refreshFailed: false };
  const loadFailed = input.loadFailed === true;
  const refreshFailed = input.refreshFailed === true;
  const hasError = input.error !== undefined && input.error !== null && input.error !== false;
  if (input.count === 0 && !refreshFailed && (loadFailed || hasError)) return { view: 'error', refreshFailed: false };
  return { view: 'ready', refreshFailed: loadFailed || refreshFailed || hasError };
};

export interface GymSectionState {
  view: TableView;
  /** Labels of this part's sources whose first load failed (empty unless `view` is 'error'). */
  missing: string[];
}

export interface GymDataState {
  sections: Record<GymSection, GymSectionState>;
  failed: GymSource[];
  stale: GymSource[];
  loading: boolean;
}

export const resolveGymData = (states: Record<GymSource, SourceState>): GymDataState => {
  const sections = {} as Record<GymSection, GymSectionState>;
  for (const section of Object.keys(GYM_SECTION_SOURCES) as GymSection[]) {
    const needs: readonly GymSource[] = GYM_SECTION_SOURCES[section];
    sections[section] = {
      view: combineViews(needs.map((s) => states[s].view)),
      missing: needs.filter((s) => states[s].view === 'error').map((s) => GYM_LABELS[s]),
    };
  }
  const all = Object.keys(states) as GymSource[];
  return {
    sections,
    failed: all.filter((s) => states[s].view === 'error'),
    stale: all.filter((s) => states[s].view === 'ready' && states[s].refreshFailed),
    loading: all.some((s) => states[s].view === 'loading'),
  };
};
