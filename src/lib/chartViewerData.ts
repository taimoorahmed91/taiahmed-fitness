// The data side of the full-screen chart viewer. No React and no browser globals, so every rule is unit tested.
//
// A ChartViewerDataset is the COMPLETE, filtered set of rows that the plot draws (the chart's own current range),
// plus the columns that describe them. It is what the viewer's Table and CSV export read. It is built by the
// chart component from the same rows it gives Recharts, never from the screen-reader table in ChartFigure
// (which is for assistive technology and is capped for cards).
//
// Contract highlights
//  - rows: complete, in plot order (left to right). Nothing is ever dropped for size.
//  - columns: key, label and unit (header "Weight (kg)") plus `digits`, the one rounding rule shared by the table and the CSV.
//  - unknown vs zero: null / undefined / "" / NaN / Infinity are UNKNOWN (blank in the CSV, an em dash in the table).
//    A real 0 stays 0.
//  - order: `chronological` rows run oldest -> newest, so the table can show newest first and says so. Datasets that are
//    not a time series (time-of-day shares) keep the listed order. The order is a plain reverse, never a re-sort by text,
//    so labels like "10/30" never get mis-ordered.
//  - rowId: a stable, unique identity per row (a date, a period name). It labels table rows (`data-row-id`) and is
//    the identity chart / table / stepper selection share (src/lib/chartSelection.ts). Never an array index.
//  - selection: OPTIONAL. Present only on charts whose rows are real calendar days. Absent (or `false`, the explicit
//    opt-out) means "no day selection": the table and chart behave exactly as before and no Open day link exists.
//  - status: optional metadata. `stale` is shown in the viewer and put in the CSV file name; `unavailable` disables export.
//    The viewer never invents a freshness time: "as of" appears only when the caller supplies one.

export type ChartCell = string | number | boolean | null | undefined;
export type ChartRow = Record<string, unknown>;

export interface ChartDatasetColumn {
  key: string;
  /** Plain name, e.g. "Weight". The unit is added to the header as "Weight (kg)". */
  label: string;
  unit?: string;
  /** Decimal places for numbers in the table AND the CSV. Default 2 (trailing zeros are not shown). */
  digits?: number;
}

export interface ChartDatasetStatus {
  /** The rows on screen may be older than the server. `asOf` (ms or text) is shown only when given. */
  stale?: { reason: string; asOf?: number | string | null };
  /** There is nothing trustworthy to show or export. */
  unavailable?: { reason: string };
}

export interface ChartDatasetCapabilities {
  /** The Table mode can be offered (always, when a dataset exists; it explains an empty or unavailable state). */
  table: boolean;
  /** CSV export is possible: rows exist and the data is not unavailable. */
  csv: boolean;
  /** Every row has a stable, unique id (see rowId). */
  rowIdentity: boolean;
  /** Rows are real calendar days that can be selected (a `selection` config was given). False = opted out. */
  daySelection: boolean;
}

/**
 * How a chart's rows become selectable calendar days (see src/lib/chartSelection.ts).
 *  - A row is selectable only when its `dateKey` value is a real ISO date AND at least one `valueKeys` column holds a
 *    real number. Null / blank rows, target-only rows and interpolated gaps are never selectable.
 *  - Rows are DAILY AGGREGATES (`daily-aggregate` origin) unless `recordId` returns an exact stored record id for the row.
 */
export interface ChartDatasetSelection<Row extends ChartRow = ChartRow> {
  /** What is being looked at: "weight", "calories", "sleep". Never a display label. */
  metric: string;
  /** Columns that carry the person's own values. Target / limit columns are deliberately left out. */
  valueKeys: readonly string[];
  /** The column holding the ISO date. Default "date". */
  dateKey?: string;
  /** An exact stored record id for the row, when the row IS one record. Leave out for daily aggregates. */
  recordId?: (row: Row, index: number) => string | null | undefined;
  /**
   * Whether the row's value was really OBSERVED (logged), not filled in. A row can carry a number that is not an
   * observation; this says so explicitly. Never derive it from `value > 0`: an explicit 0 is observed, a day with nothing
   * logged is not. Leave out when every number in `valueKeys` is an observation.
   */
  isObserved?: (row: Row, index: number) => boolean;
  /** Offers Set as A / Set as B for record-backed points (see ChartDatasetCompare). Leave out for everything else. */
  compare?: ChartDatasetCompare;
}

/**
 * Opt-in "pick two entries and open them in Compare" for a chart whose rows are exact stored records (Weight, manual Sleep).
 * It only says WHICH column is the record-backed value and how to word it; whether a point may be picked at all is decided
 * by `compareEligibility` (src/lib/compareUrl.ts) from the point's own origin, never from this config. Leave it out for
 * Waist, every aggregate chart and every chart whose rows are not exact records: no Compare control is then drawn.
 */
export interface ChartDatasetCompare {
  /** The column holding the record's own value ("weight", "hours"). A pick compares THIS column's raw numbers. */
  valueKey: string;
  /** What one record is called in sentences: "weight entry", "manual sleep entry". */
  noun: string;
  /** Unit text for values and the difference: "kg", "hrs". */
  unit: string;
  /** Decimal places for values and the difference. Default 2 (trailing zeros are not shown). */
  digits?: number;
}

export interface ChartViewerDataset<Row extends ChartRow = ChartRow> {
  /** The chart's name: "Weight Trend". Used for the table label and the CSV file name. */
  name: string;
  /** The chart's period text: "Last 30 days". */
  period: string;
  rows: readonly Row[];
  columns: readonly ChartDatasetColumn[];
  /** Stable identity of each row, unique within `rows` (duplicates are made unique deterministically by createChartDataset). */
  rowId: (row: Row, index: number) => string;
  chronological: boolean;
  status?: ChartDatasetStatus;
  /** Day selection config. Absent when the chart opted out (period / categorical / non-ISO rows). */
  selection?: ChartDatasetSelection<Row>;
  capabilities: ChartDatasetCapabilities;
}

export interface CreateChartDatasetInput<Row extends ChartRow> {
  name: string;
  period: string;
  rows: readonly Row[];
  columns: readonly ChartDatasetColumn[];
  /** Defaults to the row's date / fullDate / isoDate / name, else its position. */
  rowId?: (row: Row, index: number) => string;
  /** Rows run oldest -> newest (default true). False for categories that have no time order. */
  chronological?: boolean;
  status?: ChartDatasetStatus;
  /**
   * Day selection. Give it only when each row is one real calendar day. `false` is the explicit, documented opt-out
   * (categorical or period-derived charts); leaving it out is the same, but says nothing about intent.
   */
  selection?: ChartDatasetSelection<Row> | false;
}

export const defaultRowId = (row: ChartRow, index: number): string => {
  for (const key of ['date', 'fullDate', 'isoDate', 'name']) {
    const v = row[key];
    if (typeof v === 'string' && v !== '') return v;
  }
  return String(index);
};

export const createChartDataset = <Row extends ChartRow>(input: CreateChartDatasetInput<Row>): ChartViewerDataset<Row> => {
  const base = input.rowId ?? defaultRowId;
  // Ids are made unique in row order: a repeated "10/30" becomes "10/30#2". Deterministic, so identity survives re-renders.
  const seen = new Map<string, number>();
  const ids = input.rows.map((row, i) => {
    const id = base(row, i);
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return n === 1 ? id : `${id}#${n}`;
  });
  const status = input.status;
  const selection = input.selection || undefined;
  return {
    name: input.name,
    period: input.period,
    rows: input.rows,
    columns: input.columns,
    rowId: (_row, index) => ids[index] ?? String(index),
    chronological: input.chronological ?? true,
    status,
    selection,
    capabilities: { table: true, csv: input.rows.length > 0 && !status?.unavailable, rowIdentity: true, daySelection: !!selection },
  };
};

// --- values ------------------------------------------------------------------

/** Null, undefined, empty text, NaN and Infinity are unknown. Zero and false are real values. */
export const isUnknown = (value: unknown): boolean =>
  value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value));

const DEFAULT_DIGITS = 2;

/** One rounding rule for table and CSV: `digits` places, no -0. */
export const roundCell = (value: number, digits = DEFAULT_DIGITS): number => {
  const r = Number(value.toFixed(Math.min(Math.max(digits, 0), 10)));
  return Object.is(r, -0) ? 0 : r;
};

/** Table text for a cell. Numbers are grouped (1,250); unknown is null so the table can draw its own marker. */
export const tableCellText = (value: unknown, column: ChartDatasetColumn): string | null => {
  if (isUnknown(value)) return null;
  if (typeof value === 'number') return roundCell(value, column.digits).toLocaleString('en-US', { maximumFractionDigits: column.digits ?? DEFAULT_DIGITS });
  return String(value);
};

export const columnHeader = (column: ChartDatasetColumn): string => (column.unit ? `${column.label} (${column.unit})` : column.label);

// --- table order ---------------------------------------------------------------

export type TableDirection = 'newest-first' | 'oldest-first';
export interface OrderedRow<Row extends ChartRow = ChartRow> { row: Row; id: string; index: number }

/** Rows in table order. A plain reverse for newest first (the plot is oldest -> newest); never a text sort. */
export const orderedRows = <Row extends ChartRow>(dataset: ChartViewerDataset<Row>, direction: TableDirection): OrderedRow<Row>[] => {
  const list = dataset.rows.map((row, index) => ({ row, index, id: dataset.rowId(row, index) }));
  return dataset.chronological && direction === 'newest-first' ? list.reverse() : list;
};

/** The sentence that states the order, shown with the table. */
export const describeTableOrder = (dataset: ChartViewerDataset, direction: TableDirection): string =>
  !dataset.chronological ? 'Listed in chart order' : direction === 'newest-first' ? 'Newest first' : 'Oldest first';

/** "as of" text for a stale notice, only when the caller gave a time. Never invented. */
export const describeAsOf = (asOf: number | string | null | undefined): string | null => {
  if (asOf == null || asOf === '') return null;
  if (typeof asOf === 'number') return Number.isFinite(asOf) ? `${new Date(asOf).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null;
  return asOf;
};
