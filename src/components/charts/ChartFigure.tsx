import { ReactElement, ReactNode, useId } from 'react';
import { ResponsiveContainer } from 'recharts';
import { CHART_HEIGHT } from '@/lib/chartTheme';

export interface ChartTableColumn { key: string; label: string }

interface ChartFigureProps {
  /** Short name of the chart, e.g. "Weight Trend". */
  title: string;
  /** Plain-language description of the data. Read by screen readers. */
  summary: string;
  /** Small visible line under the title: units, period, how to read it. */
  caption?: ReactNode;
  /** Optional full data, exposed to screen readers as a table. */
  table?: { columns: ChartTableColumn[]; rows: Record<string, unknown>[] };
  height?: number;
  className?: string;
  /** A Recharts chart. Give it `accessibilityLayer` for keyboard access. */
  children: ReactElement;
}

const MAX_TABLE_ROWS = 100;

const cell = (value: unknown) => (value == null || value === '' ? '--' : typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value));

/**
 * Shared frame for every chart: figure semantics, a text summary and a data
 * table for screen readers, an optional visible caption, and the responsive
 * container. The visual chart itself stays unchanged.
 */
export const ChartFigure = ({ title, summary, caption, table, height = CHART_HEIGHT, className, children }: ChartFigureProps) => {
  const id = useId();
  const rows = table ? table.rows.slice(-MAX_TABLE_ROWS) : [];
  return (
    <figure aria-labelledby={`${id}-label`} aria-describedby={`${id}-summary`} className={className ?? 'm-0'}>
      <figcaption id={`${id}-label`} className="sr-only">{title}</figcaption>
      {caption && <p className="mb-2 text-xs text-muted-foreground">{caption}</p>}
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
      {/* The same summary screen readers get, available to everyone on demand. Closed by default so
          it never pushes the chart around; aria-describedby still reads it while collapsed. */}
      <details data-chart-summary data-html2canvas-ignore="true" className="mt-2 text-xs text-muted-foreground">
        <summary className="inline-flex min-h-8 cursor-pointer items-center rounded-sm px-1 font-medium underline-offset-4 [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11">
          Chart summary
        </summary>
        <p id={`${id}-summary`} className="px-1 pb-1 pt-1 leading-relaxed">{summary}</p>
      </details>
      {table && rows.length > 0 && (
        <div className="sr-only" data-html2canvas-ignore="true">
          <table>
            <caption>{title} data</caption>
            <thead><tr>{table.columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{table.columns.map((c, j) => (j === 0 ? <th key={c.key} scope="row">{cell(row[c.key])}</th> : <td key={c.key}>{cell(row[c.key])}</td>))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
};
