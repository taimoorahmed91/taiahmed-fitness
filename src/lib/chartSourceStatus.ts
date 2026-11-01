// Turns "where each source table really is" into the status a chart dataset shows in the full-screen viewer and
// puts in the CSV file name (ChartDatasetStatus, src/lib/chartViewerData.ts). Pure (tests/chartSourceStatus.test.ts).
//
// Rules (they follow the page-level table states from useSharedTableState, never a guess):
//  - unavailable: at least one source's FIRST load failed, so its rows are unknown. Nothing trustworthy to show or export.
//  - stale:       every source has rows, but the latest refresh of at least one failed. The rows on screen are the last
//                 ones that loaded and may be out of date. They are kept (cached rows stay in the chart, Table and CSV).
//  - none:        everything is loaded and its latest refresh worked (a successful refresh clears "stale" on the next
//                 render, because the state it reads is the live table state), or something is still loading
//                 (the page draws a skeleton then; a chart makes no claim).
// No time is invented: `asOf` is never set here, so the viewer says "may be out of date" without a "last loaded" time.
import type { ChartDatasetStatus } from './chartViewerData';

/** One source a chart is computed from. `view` is the table view (loading / error / ready); `refreshFailed` is the table's flag. */
export interface ChartSource {
  /** Plain words for people: "meals", "WHOOP data". */
  label: string;
  view: 'loading' | 'error' | 'ready';
  refreshFailed: boolean;
}

const join = (labels: readonly string[]): string =>
  labels.length <= 1 ? labels[0] ?? '' : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

// The same status must be the same object, so a chart's memoised dataset is not rebuilt on every page render.
const interned = new Map<string, ChartDatasetStatus>();
const intern = (key: string, make: () => ChartDatasetStatus): ChartDatasetStatus => {
  let status = interned.get(key);
  if (!status) {
    status = make();
    interned.set(key, status);
  }
  return status;
};

/** The viewer status for a chart computed from `sources`, or undefined when there is nothing to warn about. */
export const deriveChartStatus = (sources: readonly ChartSource[]): ChartDatasetStatus | undefined => {
  const failed = sources.filter((s) => s.view === 'error').map((s) => s.label);
  if (failed.length > 0) {
    const reason = `Your ${join(failed)} didn't load.`;
    return intern(`unavailable|${reason}`, () => ({ unavailable: { reason } }));
  }
  const stale = sources.filter((s) => s.view === 'ready' && s.refreshFailed).map((s) => s.label);
  if (stale.length > 0) {
    const reason = `The latest refresh of your ${join(stale)} failed, so this shows the last data that loaded.`;
    return intern(`stale|${reason}`, () => ({ stale: { reason } }));
  }
  return undefined;
};
