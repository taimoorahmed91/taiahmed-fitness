// Chart day selection: the pure rules. No React, no Recharts, no browser globals (tests/chartSelection.test.ts).
//
// ## What can be selected
// A chart row is a selectable DAY only when both are true:
//   1. its date column holds a real `YYYY-MM-DD` date (createSelectedDay decides; "10/30" labels and impossible dates fail), and
//   2. at least one of the chart's `valueKeys` columns holds a real number.
// If the chart gave an `isObserved` check, the row must also pass it (a filled-in number is not an observation).
// So null rows, rows that only carry a target / limit, interpolated gaps (a line drawn across a missing day) and
// non-ISO rows are never selectable. A real 0 is a value.
//
// ## Identity
// A selection is the row's `rowId` (the dataset's stable id: the ISO date). It is NEVER an array index and never a
// Recharts payload object. Event handlers read the ISO date string out of the payload immediately and look the row up
// here; everything after that works with the id. The SelectedDay that goes with it (src/lib/selectedDay.ts):
//   - `daily-aggregate` origin for a row that sums / averages a day (the default for every chart today),
//   - `record` origin only when the chart supplied an exact stored record id for that row.
// The series the person happened to click is NOT part of the identity: chart, table and steppers share ONE selection per day.
//
// ## Reset rules
//   - `resolveChartSelection` returns null when the selected row is no longer a selectable point of the visible rows
//     (range changed, data refreshed without that day). A line/bar switch does not change the rows, so it keeps the day.
//   - Local selection lives in the chart component, so signing out (ProtectedRoute unmounts the page) or leaving the page
//     clears it. There is no account data in it.
import { createSelectedDay, selectedDayKey, type SelectedDay } from './selectedDay';
import { joinUnit, tableCellText, type ChartRow, type ChartViewerDataset } from './chartViewerData';

export interface ChartPointRef {
  /** The dataset's stable row id (an ISO date for daily charts). The only key selection state keeps. */
  rowId: string;
  /** The shared SelectedDay contract: ISO date plus origin. Navigate with `buildCalendarHref(day.isoDate)`. */
  day: SelectedDay;
}

const isReal = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Every selectable day of the dataset, in plot order (oldest to newest). Empty when the chart opted out. */
export const selectableChartPoints = (dataset: ChartViewerDataset): ChartPointRef[] => {
  const config = dataset.selection;
  // Nothing trustworthy to show or pick: an unavailable dataset has no selectable days.
  if (!config || dataset.status?.unavailable) return [];
  const dateKey = config.dateKey ?? 'date';
  const seen = new Set<string>();
  const points: ChartPointRef[] = [];
  dataset.rows.forEach((row, index) => {
    if (!config.valueKeys.some((key) => isReal(row[key]))) return;
    if (config.isObserved && !config.isObserved(row, index)) return;
    const recordId = config.recordId?.(row, index);
    const origin = recordId ? { kind: 'record', metric: config.metric, recordId } : { kind: 'daily-aggregate', metric: config.metric };
    const day = createSelectedDay(row[dateKey], origin);
    if (!day) return;
    const key = selectedDayKey(day);
    if (seen.has(key)) return; // one daily aggregate per day: a repeated date can not become a second selection
    seen.add(key);
    points.push({ rowId: dataset.rowId(row, index), day });
  });
  return points;
};

/** The selected point, or null when `rowId` is not (or no longer) one of the selectable points. */
export const resolveChartSelection = (points: readonly ChartPointRef[], rowId: string | null | undefined): ChartPointRef | null =>
  rowId == null ? null : points.find((p) => p.rowId === rowId) ?? null;

/**
 * A click on the plot, reduced to what is safe to keep: the ISO date string read out of the Recharts payload and the
 * series that was clicked. Returns the point only when that series is one of the chart's own value columns and the
 * row has a real number there (so a target line / bar, a null point or a gap does nothing).
 */
export const pointForPlotClick = (
  dataset: ChartViewerDataset,
  points: readonly ChartPointRef[],
  isoDate: unknown,
  seriesKey: string,
): ChartPointRef | null => {
  const config = dataset.selection;
  if (!config || typeof isoDate !== 'string' || !config.valueKeys.includes(seriesKey)) return null;
  const point = points.find((p) => p.day.isoDate === isoDate);
  if (!point) return null;
  const dateKey = config.dateKey ?? 'date';
  const index = dataset.rows.findIndex((row, i) => row[dateKey] === isoDate && dataset.rowId(row, i) === point.rowId);
  return index >= 0 && isReal(dataset.rows[index][seriesKey]) ? point : null;
};

/**
 * Previous (-1) / next (+1) selectable day. With nothing selected, Previous starts from the newest day and Next from
 * the oldest. Returns null at either end: there is nowhere to go.
 */
export const stepChartSelection = (points: readonly ChartPointRef[], rowId: string | null | undefined, delta: -1 | 1): ChartPointRef | null => {
  if (points.length === 0) return null;
  const at = rowId == null ? -1 : points.findIndex((p) => p.rowId === rowId);
  if (at < 0) return delta < 0 ? points[points.length - 1] : points[0];
  return points[at + delta] ?? null;
};

export interface ChartPointValue {
  key: string;
  /** "Weight", "Min target". */
  label: string;
  /** "80.2 kg", "1,250 cal": the table's own rounding and grouping, plus the unit. */
  text: string;
}

/** The readout values for a row: every non-date column that has a value, formatted like the table. Unknown values are left out. */
export const chartPointValues = (dataset: ChartViewerDataset, rowId: string): ChartPointValue[] => {
  const dateKey = dataset.selection?.dateKey ?? 'date';
  const index = dataset.rows.findIndex((row, i) => dataset.rowId(row, i) === rowId);
  if (index < 0) return [];
  const row: ChartRow = dataset.rows[index];
  const values: ChartPointValue[] = [];
  for (const column of dataset.columns) {
    if (column.key === dateKey) continue;
    const text = tableCellText(row[column.key], column);
    if (text !== null) values.push({ key: column.key, label: column.label, text: joinUnit(text, column.unit) });
  }
  return values;
};
