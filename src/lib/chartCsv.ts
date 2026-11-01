// CSV export of a ChartViewerDataset. Pure (no DOM), so every rule is unit tested.
//
// Format (documented, deterministic):
//  - UTF-8 with a leading byte-order mark (U+FEFF). Excel opens a BOM-less UTF-8 file as Windows-1252 and garbles
//    non-ASCII labels, so the BOM is worth its one invisible character.
//  - RFC 4180: fields with a comma, double quote, CR or LF are wrapped in double quotes and inner quotes are doubled.
//    Lines end with CRLF, including the last one.
//  - First line: the column headers, "Label (unit)".
//  - Then EVERY row of the chart's current range, oldest first (the plot's left-to-right order), whatever sort the table
//    shows. Rows are never truncated. A dataset with no rows, or marked unavailable, exports nothing (null).
//  - Numbers: rounded with the column's `digits` (default 2), plain digits with "." as the decimal point and no thousands
//    separators, so spreadsheets read them as numbers. Unknown values (null, undefined, "", NaN, Infinity) are an EMPTY
//    field, which is different from a real 0.
//  - Text starting with = + - @ (or a tab / CR) gets a leading apostrophe so a spreadsheet never runs it as a formula.
//    Numbers are not text and are never changed, so -300 stays -300.
//  - Staleness is not put inside the table (that would break parsers); it is in the file name: "..._stale.csv".
import { columnHeader, isUnknown, roundCell, type ChartRow, type ChartViewerDataset } from './chartViewerData';

export const CSV_BOM = '\uFEFF';
export const CSV_EOL = '\r\n';

/** Text that a spreadsheet could read as a formula or command. */
const FORMULA_START = /^[=+\-@\t\r]/;

export const csvSafeText = (text: string): string => (FORMULA_START.test(text) ? `'${text}` : text);

/** One RFC 4180 field. */
export const csvField = (text: string): string => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** Plain digits, never exponent notation (1e-7 would be text to a spreadsheet). */
const plainNumber = (n: number): string => {
  const s = String(n);
  return /e/i.test(s) ? n.toFixed(10).replace(/\.?0+$/, '') : s;
};

const csvValue = (value: unknown, digits: number | undefined): string => {
  if (isUnknown(value)) return '';
  if (typeof value === 'number') return plainNumber(roundCell(value, digits));
  return csvField(csvSafeText(String(value)));
};

export const canExportCsv = (dataset: ChartViewerDataset): boolean => dataset.capabilities.csv && dataset.rows.length > 0 && !dataset.status?.unavailable;

/** The whole file as text, or null when there is nothing to export. */
export const buildCsv = <Row extends ChartRow>(dataset: ChartViewerDataset<Row>): string | null => {
  if (!canExportCsv(dataset as ChartViewerDataset)) return null;
  const header = dataset.columns.map((c) => csvField(csvSafeText(columnHeader(c)))).join(',');
  const lines = dataset.rows.map((row) => dataset.columns.map((c) => csvValue(row[c.key], c.digits)).join(','));
  return CSV_BOM + [header, ...lines].join(CSV_EOL) + CSV_EOL;
};

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * "weight-trend_2026-10-02_to_2026-10-31_30-rows.csv" ("_stale" appended when the data is flagged stale).
 * The span comes from the first and last row identity, so the name always matches the rows inside.
 */
export const csvFilename = (dataset: ChartViewerDataset): string => {
  const n = dataset.rows.length;
  const first = n ? slug(dataset.rowId(dataset.rows[0], 0)) : '';
  const last = n ? slug(dataset.rowId(dataset.rows[n - 1], n - 1)) : '';
  const span = !dataset.chronological ? slug(dataset.period) : n === 0 ? slug(dataset.period) : first === last ? first : `${first}_to_${last}`;
  return [slug(dataset.name) || 'chart', span, `${n}-${n === 1 ? 'row' : 'rows'}`].filter(Boolean).join('_') + (dataset.status?.stale ? '_stale' : '') + '.csv';
};
