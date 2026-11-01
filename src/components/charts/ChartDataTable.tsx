import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import type { ChartDaySelection } from '@/components/charts/useChartDaySelection';
import type { ChartComparePicks } from '@/components/charts/useChartComparePicks';
import { CompareBadge } from '@/components/charts/ChartCompareUi';
import { slotLabel } from '@/lib/chartComparePicks';
import { cn } from '@/lib/utils';
import { describeTableOrder, columnHeader, orderedRows, tableCellText, type ChartViewerDataset, type TableDirection } from '@/lib/chartViewerData';

interface ChartDataTableProps {
  dataset: ChartViewerDataset;
  direction: TableDirection;
  /**
   * Day selection shared with the chart. A row that is a selectable day gets a button in its date cell (keyboard and
   * screen reader path) and the whole row is clickable. A selected row is bold, has a check mark and an inset bar, so
   * it does not depend on colour. Rows with no value (and every row of an opted-out chart) are plain, as before.
   */
  selection?: ChartDaySelection;
  /**
   * A / B picks for Compare. A row that is A or B shows an A / B badge (a letter, with the words for screen readers) in its
   * date cell, so the picks are marked in the Table as well as in the plot and the compare panel.
   */
  compare?: ChartComparePicks;
}

/**
 * The viewer's Table mode: every row of the chart's current range as a real, visible table.
 *  - It reads the ChartViewerDataset (the plot's complete rows), never the capped screen-reader table.
 *  - The caption states what is shown, how many rows and in which order. Order is a plain reverse of the plot order.
 *  - Unknown values show an em dash (with "No value" for screen readers); a real 0 shows 0.
 *  - The scroll area is a labelled, focusable region, so keyboard users can scroll it; the header row stays in view.
 *  - Rows are 44px high on touch screens. Each row carries `data-row-id`, the stable identity hook for future selection.
 */
export const ChartDataTable = ({ dataset, direction, selection, compare }: ChartDataTableProps) => {
  const rows = orderedRows(dataset, direction);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const selectedId = selection?.selected?.rowId ?? null;
  // A day picked in the chart or with the arrows scrolls into view here, under the sticky header.
  useEffect(() => {
    if (selectedId === null) return;
    bodyRef.current?.querySelector('[data-selected]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);
  const unavailable = dataset.status?.unavailable;
  if (unavailable || rows.length === 0) {
    return (
      <p role="status" data-chart-table-empty="" className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {unavailable ? `${dataset.name} data is unavailable: ${unavailable.reason}` : `No rows in ${dataset.period.toLowerCase()}. Try a wider date range.`}
      </p>
    );
  }
  return (
    <div
      data-chart-table=""
      role="region"
      aria-label={`${dataset.name} data table`}
      tabIndex={0}
      className="min-h-[14rem] min-w-0 flex-1 overflow-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full border-collapse text-xs sm:text-sm">
        <caption className="px-3 py-2 text-left text-xs text-muted-foreground">
          {dataset.name} · {dataset.period} · {rows.length} {rows.length === 1 ? 'row' : 'rows'} · {describeTableOrder(dataset, direction)}
        </caption>
        <thead>
          <tr>
            {dataset.columns.map((c, j) => (
              <th key={c.key} scope="col" className={`sticky top-0 z-[1] border-b bg-muted px-2 py-2 align-bottom text-xs sm:px-3 font-semibold text-foreground ${j === 0 ? 'text-left' : 'text-right'}`}>
                {columnHeader(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map(({ row, id }) => {
            const point = selection?.enabled ? selection.pointForRow(id) : null;
            const selected = !!point && selection!.isSelectedRow(id);
            const mark = point && compare?.enabled ? compare.markOf(id) : null;
            return (
            <tr
              key={id}
              data-row-id={id}
              data-selected={selected ? '' : undefined}
              data-compare-mark={mark ?? undefined}
              onClick={point ? () => selection!.toggleRow(id) : undefined}
              className={cn(
                'h-9 border-b last:border-b-0 [@media(pointer:coarse)]:h-11',
                point && 'cursor-pointer scroll-mt-10 [@media(hover:hover)]:hover:bg-muted',
                selected && 'bg-accent font-semibold shadow-[inset_3px_0_0_hsl(var(--foreground))]',
              )}
            >
              {dataset.columns.map((c, j) => {
                const text = tableCellText(row[c.key], c);
                const content = text ?? (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground">{'\u2014'}</span>
                    <span className="sr-only">No value</span>
                  </>
                );
                if (j === 0) {
                  return (
                    <th key={c.key} scope="row" className="whitespace-nowrap px-2 text-left font-medium tabular-nums sm:px-3">
                      {point ? (
                        // The row's own click does the work; this button gives keyboard and screen reader users the same action.
                        <button
                          type="button"
                          aria-pressed={selected}
                          data-chart-row-select=""
                          className="-mx-1 inline-flex min-h-8 items-center gap-1.5 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
                        >
                          {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          {mark && <><CompareBadge slot={mark} /><span className="sr-only">Compare {slotLabel(mark)}, </span></>}
                          {content}
                        </button>
                      ) : content}
                    </th>
                  );
                }
                return <td key={c.key} className="whitespace-nowrap px-2 text-right tabular-nums sm:px-3">{content}</td>;
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
