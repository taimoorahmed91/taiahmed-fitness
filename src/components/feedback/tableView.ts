import type { SharedTableState } from '@/lib/sharedData';

/**
 * What a screen (or one section of it) should draw for the shared tables it needs.
 *
 * - `loading`: no rows yet and nothing has failed. Draw a fixed-height skeleton, never "no entries" or zeros.
 * - `error`:   the FIRST load failed, so the rows are unknown (not empty). Draw a persistent error.
 * - `ready`:   loaded at least once. An empty list now really is empty, and `refreshFailed` only means
 *              the rows on screen may be out of date.
 */
export type TableView = 'loading' | 'error' | 'ready';

/** Signed-out ("idle") counts as loading: the shell never shows these screens without a user. */
export const tableView = (state: SharedTableState): TableView =>
  state.phase === 'error' ? 'error' : state.phase === 'ready' ? 'ready' : 'loading';

/**
 * One view for a section that needs several tables. An error wins at once (it is shown as soon as the
 * query reaches the error state, without waiting for slower tables); then loading; ready only when all are.
 */
export const combineViews = (views: readonly TableView[]): TableView =>
  views.includes('error') ? 'error' : views.includes('loading') ? 'loading' : 'ready';

/** "weight", "weight and sleep", "meals, weight and sleep". */
export const joinLabels = (labels: readonly string[]): string => {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

export interface NamedTableState<K extends string = string> {
  key: K;
  /** Plain words for people: "sleep", "workouts". */
  label: string;
  state: SharedTableState;
}

export interface TableSummary<K extends string = string> {
  /** First load failed: the data never arrived. */
  failed: NamedTableState<K>[];
  /** A refresh failed over rows that did load: data may be out of date. */
  stale: NamedTableState<K>[];
  /** Still on the first load. */
  loading: NamedTableState<K>[];
}

export const summarizeTables = <K extends string>(tables: readonly NamedTableState<K>[]): TableSummary<K> => ({
  failed: tables.filter((t) => tableView(t.state) === 'error'),
  stale: tables.filter((t) => tableView(t.state) === 'ready' && t.state.refreshFailed),
  loading: tables.filter((t) => tableView(t.state) === 'loading'),
});
