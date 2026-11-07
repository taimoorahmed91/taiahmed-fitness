import { ReactElement, ReactNode, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ResponsiveContainer } from 'recharts';
import { CollapsePanel } from '@/components/ui/collapse-panel';
import { cn } from '@/lib/utils';
import { CHART_HEIGHT } from '@/lib/chartTheme';
import { EXPANDED_CHART_MIN_HEIGHT } from '@/lib/chartViewer';

export interface ChartTableColumn { key: string; label: string }

interface ChartFigureProps {
  /** Short name of the chart, e.g. "Weight Trend". */
  title: string;
  /** Plain-language description of the data. Read by screen readers. */
  summary: string;
  /** Small visible line above the plot. Keep it to ONE short line: units, period, a non-zero axis start. */
  caption?: ReactNode;
  /**
   * Longer "how to read this" sentences (what a blank day means, that a point can be selected, what a colour stands for,
   * how many days have more than one entry). They live in the "Chart summary" panel under the plot and are read out by
   * screen readers with the summary, so the caption stays one line and nothing is lost.
   */
  howToRead?: string[];
  /** Optional full data, exposed to screen readers as a table. */
  table?: { columns: ChartTableColumn[]; rows: Record<string, unknown>[] };
  height?: number;
  /**
   * Full-screen viewer mode: the plot is no longer a fixed height. It takes all the height the viewer has
   * left (never less than EXPANDED_CHART_MIN_HEIGHT) and the whole width. Same chart, same data.
   */
  expanded?: boolean;
  className?: string;
  /**
   * Something that belongs directly under the plot and above the "Chart summary" toggle: the selected-day readout.
   * Left out of the full-screen viewer, which has its own selection bar.
   */
  afterPlot?: ReactNode;
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
export const ChartFigure = ({ title, summary, caption, howToRead, table, height = CHART_HEIGHT, expanded = false, className, afterPlot, children }: ChartFigureProps) => {
  const id = useId();
  const [summaryOpen, setSummaryOpen] = useState(false);
  // The card's screen-reader table is capped (it sits in every card). The full-screen viewer's is not: it never drops a row.
  // Neither is the source of the viewer's visible Table or CSV: those read the chart's complete ChartViewerDataset.
  const allRows = table ? table.rows : [];
  const rows = expanded ? allRows : allRows.slice(-MAX_TABLE_ROWS);
  const truncated = rows.length < allRows.length;
  const notes = (howToRead ?? []).filter(Boolean);
  const describedBy = notes.length > 0 ? `${id}-summary ${id}-reading` : `${id}-summary`;
  return (
    // useId makes these ids unique per mounted figure, so the card and the full-screen viewer can be on screen together.
    <figure aria-labelledby={`${id}-label`} aria-describedby={describedBy} className={expanded ? 'm-0 flex flex-1 flex-col' : className ?? 'm-0'} data-chart-expanded={expanded ? '' : undefined}>
      <figcaption id={`${id}-label`} className="sr-only">{title}</figcaption>
      {caption && <p className="mb-2 text-xs text-muted-foreground">{caption}</p>}
      {expanded ? (
        // The absolutely placed inner box gives ResponsiveContainer a real pixel size to measure, whatever the flex parent does.
        <div data-chart-plot="" className="chart-plot relative w-full flex-1" style={{ minHeight: EXPANDED_CHART_MIN_HEIGHT }}>
          <div className="absolute inset-x-1 inset-y-1.5"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
        </div>
      ) : (
        // Same height as before: the sunken plot surface is only a background, it adds no height (only a little side padding so the axis numbers do not touch its edge).
        <div className="chart-plot px-1.5"><ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer></div>
      )}
      {afterPlot}
      {/* The same summary screen readers get, available to everyone on demand. Closed by default so
          it never pushes the chart around. The text stays mounted while closed (CollapsePanel only slides it shut), so
          aria-describedby still reads it. */}
      <div data-chart-summary data-html2canvas-ignore="true" className="chart-footer mt-2 text-xs text-muted-foreground">
        <button
          type="button"
          aria-expanded={summaryOpen}
          aria-controls={`${id}-summary-panel`}
          onClick={() => setSummaryOpen((v) => !v)}
          className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-sm px-1 font-medium underline-offset-4 [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
        >
          <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 transition-transform duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none', summaryOpen && 'rotate-180')} />
          Chart summary
        </button>
        <CollapsePanel id={`${id}-summary-panel`} open={summaryOpen}>
          <p id={`${id}-summary`} className="px-1 pb-1 pt-1 leading-relaxed">{summary}</p>
          {notes.length > 0 && (
            <p id={`${id}-reading`} data-chart-reading="" className="px-1 pb-1 leading-relaxed">
              <span className="font-medium text-foreground">How to read this: </span>
              {notes.join(' ')}
            </p>
          )}
        </CollapsePanel>
      </div>
      {table && rows.length > 0 && (
        <div className="sr-only" data-html2canvas-ignore="true">
          <table>
            <caption>{title} data{truncated ? `. Showing the latest ${rows.length} of ${allRows.length} rows. Open full screen and choose Table for all rows.` : ''}</caption>
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
