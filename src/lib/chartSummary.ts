import { formatChartDate, isIsoDate } from './chartRange.ts';
import { formatChartValue } from './chartTheme.ts';

export interface SummarySeries {
  key: string;
  label: string;
  unit?: string;
  digits?: number;
}

type Row = { date?: string } & Record<string, unknown>;

const numbers = (rows: Row[], key: string) =>
  rows.map((r) => r[key]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

/** One plain sentence group per series, for screen readers and the visible caption. */
export const describeSeries = (rows: Row[], series: SummarySeries[], period?: string): string => {
  if (rows.length === 0) return `No data${period ? ` for ${period.toLowerCase()}` : ''}.`;
  const dates = rows.map((r) => r.date).filter((d): d is string => typeof d === 'string');
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = first && last ? (first === last ? ` on ${formatChartDate(first)}` : ` from ${formatChartDate(first)} to ${formatChartDate(last)}`) : '';
  const parts = series.map((s) => {
    const values = numbers(rows, s.key);
    if (values.length === 0) return `${s.label}: no values.`;
    const fmt = (n: number) => formatChartValue(n, s.unit, s.digits ?? 1);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return `${s.label}: ${values.length} ${values.length === 1 ? 'value' : 'values'}${span}. Latest ${fmt(values[values.length - 1])}, lowest ${fmt(Math.min(...values))}, highest ${fmt(Math.max(...values))}, average ${fmt(avg)}.`;
  });
  return `${period ? `${period}. ` : ''}${parts.join(' ')}`;
};

export const hasIsoDates = (rows: Row[]) => rows.length > 0 && rows.every((r) => isIsoDate(r.date));
