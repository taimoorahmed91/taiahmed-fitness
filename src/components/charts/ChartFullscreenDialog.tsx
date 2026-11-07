import { forwardRef, useEffect, useState, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from 'react';
import { ArrowDownUp, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ChartDataTable } from '@/components/charts/ChartDataTable';
import { ChartDaySelectionBar, ChartSelectedDayPanel } from '@/components/charts/ChartDaySelectionUi';
import { ChartCompareViewerPanel } from '@/components/charts/ChartCompareUi';
import type { ChartComparePicks } from '@/components/charts/useChartComparePicks';
import type { ChartDaySelection } from '@/components/charts/useChartDaySelection';
import { downloadTextFile } from '@/components/charts/downloadCsv';
import { buildCsv, canExportCsv, csvFilename } from '@/lib/chartCsv';
import { describeAsOf, describeTableOrder, type ChartViewerDataset, type TableDirection } from '@/lib/chartViewerData';

/**
 * The one full-screen chart viewer. ChartHeader owns it (so every chart card gets it the same way) and
 * charts only say WHAT to draw in it: `viewer={{ render: () => <the same chart, expanded>, dataset }}`.
 *
 * What it guarantees
 *  - It shows the very same chart as the card: the chart component keeps its range / line-bar state and
 *    renders the viewer body from that state, so there is no copy. The range and style controls inside the
 *    viewer are the card's own setters.
 *  - Phones: full screen, clear of the notch and home bar. sm and up: about 94vw x 92dvh.
 *  - Title, close button and controls stay put at the top; the chart (and its notes / summary) scroll
 *    below them when the screen is short. The page behind never scrolls (Radix locks it).
 *  - Escape, the close button, focus trap and focus return come from Radix Dialog.
 *  - With a `dataset` it also offers Chart | Table (a view mode, independent of the card's range and line/bar state)
 *    and a CSV download of exactly the rows in the chart's current range. It always opens on Chart.
 */
export interface ChartViewerSpec {
  /** Draws the chart for the viewer. Called only while the viewer is open. Give the chart `expanded`. */
  render: () => ReactNode;
  /**
   * The complete filtered rows the plot draws, with their columns (see src/lib/chartViewerData.ts). Powers Table and
   * CSV. Rows carry a stable identity (`dataset.rowId`) that day selection shares.
   */
  dataset?: ChartViewerDataset;
  /**
   * The chart's selected-day state (see useChartDaySelection). When it has selectable days, the viewer adds Previous /
   * Next date buttons, makes Table rows selectable and shows the Calendar's day panel inline below the chart. The same
   * state drives the card's readout, so both views always agree. Leave out for charts that opted out.
   */
  selection?: ChartDaySelection;
  /**
   * The chart's A / B picks (see useChartComparePicks). Adds Set as A / Set as B for the selected point (or two pickers when the chart has
   * no selectable days), the B - A readout, Swap and Clear under the selected-day bar, and A / B marks in the Table. Open in Compare is there
   * only when both picks are exact Weight / manual Sleep records. The same state shows a small summary on the card. Leave out when the chart
   * has no `pointCompare` (and is not a Weight / Sleep page chart).
   */
  compare?: ChartComparePicks;
}

interface ChartFullscreenDialogProps {
  title: string;
  icon?: ReactNode;
  /** The card's one-line description (headline number, average...). */
  description?: ReactNode;
  /** Range / style / PDF controls, built by ChartHeader from the card's own state. */
  controls?: ReactNode;
  /** What the PDF button captures: the chart area, never the controls. */
  captureRef: RefObject<HTMLDivElement>;
  /** Full-width rows from the card (badges, change lines). They scroll with the chart. */
  children?: ReactNode;
  viewer: ChartViewerSpec;
}

// Horizontal padding that also respects landscape notches.
const PAD_X = 'pl-[max(var(--overlay-pad),env(safe-area-inset-left))] pr-[max(var(--overlay-pad),env(safe-area-inset-right))]';

/** Rendered only while the dialog is open, so a closed card never builds the expanded chart. */
const ViewerBody = ({ viewer }: { viewer: ChartViewerSpec }) => <>{viewer.render()}</>;

type ViewerMode = 'chart' | 'table';

/**
 * Everything below the viewer header. It lives inside the dialog content, so its state (Chart | Table, sort direction)
 * starts fresh on every open: the viewer always opens on the chart.
 *
 * The chart stays mounted in Table mode, moved off screen (and made inert and hidden from assistive technology), so
 *  - the viewer PDF button still captures the viewer chart exactly as in Chart mode,
 *  - switching back is instant and nothing re-measures, and
 *  - the only screen-reader table that is exposed at any time is the visible one.
 */
const ViewerPanel = ({ title, captureRef, children, viewer }: { title: string; captureRef: RefObject<HTMLDivElement>; children?: ReactNode; viewer: ChartViewerSpec }) => {
  const dataset = viewer.dataset;
  const [mode, setMode] = useState<ViewerMode>('chart');
  const [direction, setDirection] = useState<TableDirection>('newest-first');
  const [exported, setExported] = useState<string | null>(null);
  const tableMode = !!dataset && mode === 'table';

  // `inert` is not in React 18's typings: set it on the element so the hidden chart cannot take focus.
  useEffect(() => {
    const el = captureRef.current;
    if (!el) return;
    if (tableMode) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [tableMode, captureRef]);

  const exportable = !!dataset && canExportCsv(dataset);
  const exportCsv = () => {
    if (!dataset) return;
    const csv = buildCsv(dataset);
    if (csv == null) return;
    downloadTextFile(csvFilename(dataset), csv);
    setExported(`Downloaded ${dataset.rows.length} ${dataset.rows.length === 1 ? 'row' : 'rows'} as CSV.`);
  };

  const stale = dataset?.status?.stale;
  const unavailable = dataset?.status?.unavailable;
  const asOf = stale ? describeAsOf(stale.asOf) : null;
  const n = dataset?.rows.length ?? 0;
  const selection = viewer.selection?.enabled ? viewer.selection : undefined;
  // Compare needs no selected day: a chart that opted out of day selection (a pie, the Body Recomposition lines) still compares two points.
  const compare = viewer.compare?.enabled ? viewer.compare : undefined;

  return (
    <div
      data-chart-viewer-scroll=""
      data-viewer-mode={tableMode ? 'table' : 'chart'}
      className={`flex min-h-0 flex-1 flex-col overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] ${PAD_X} ${tableMode ? 'overflow-hidden' : 'overflow-y-auto'} ${dataset ? 'pt-0' : 'pt-3'}`}
    >
      {dataset && (
        <div data-chart-viewer-toolbar="" data-html2canvas-ignore="true" className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 bg-background pb-2 pt-3">
          <SegmentedControl<ViewerMode>
            size="sm"
            className="chart-segmented"
            ariaLabel={`${title} view`}
            value={mode}
            onValueChange={(next) => { setMode(next); setExported(null); }}
            options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]}
          />
          {tableMode && dataset.chronological && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-chart-sort=""
              className="chart-action"
              aria-label={`Order: ${describeTableOrder(dataset, direction).toLowerCase()}. Switch to ${direction === 'newest-first' ? 'oldest' : 'newest'} first.`}
              onClick={() => setDirection((d) => (d === 'newest-first' ? 'oldest-first' : 'newest-first'))}
            >
              <ArrowDownUp aria-hidden="true" />
              {describeTableOrder(dataset, direction)}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-chart-csv=""
            className="chart-action sm:ml-auto"
            disabled={!exportable}
            aria-label={exportable ? `Download ${title} as CSV, ${n} ${n === 1 ? 'row' : 'rows'}` : `CSV download unavailable: ${unavailable ? 'data is unavailable' : 'no rows in this range'}`}
            title={exportable ? 'Every row of this range, oldest first' : undefined}
            onClick={exportCsv}
          >
            <Download aria-hidden="true" />
            CSV
          </Button>
          <p role="status" aria-live="polite" className="basis-full text-xs text-muted-foreground empty:hidden">{exported}</p>
        </div>
      )}
      {dataset && (stale || unavailable) && (
        <p role="status" data-chart-data-notice="" className="mb-2 shrink-0 rounded-md border border-chart-warn/40 bg-chart-warn/10 px-3 py-2 text-sm text-foreground">
          {unavailable
            ? `Data unavailable: ${unavailable.reason} Nothing to export.`
            : `This data may be out of date: ${stale!.reason}${asOf ? ` Last loaded ${asOf}.` : ''} A CSV download is marked "stale" in its file name.`}
        </p>
      )}
      <div
        ref={captureRef}
        data-chart-viewer-capture=""
        aria-hidden={tableMode ? true : undefined}
        className={tableMode ? 'pointer-events-none fixed -left-[10000px] top-0 flex w-[960px] flex-col gap-3 bg-background' : 'flex flex-1 flex-col gap-3 bg-background'}
      >
        {children}
        <ViewerBody viewer={viewer} />
      </div>
      {/* Selected-day controls. Chart mode: bar and panel sit under the chart in the scrolling viewer. Table mode: the bar,
          the table and the panel share one scroller, so the table keeps at least 14rem and the panel is reachable. */}
      {(selection || compare || (tableMode && dataset)) && (
        <div
          data-chart-viewer-selection=""
          className={tableMode ? 'mt-0 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain' : 'mt-3 flex shrink-0 flex-col gap-3'}
        >
          {selection && <ChartDaySelectionBar selection={selection} />}
          {compare && <ChartCompareViewerPanel compare={compare} />}
          {tableMode && dataset && <ChartDataTable dataset={dataset} direction={direction} selection={selection} compare={compare} />}
          {selection?.selected && <ChartSelectedDayPanel day={selection.selected.day} />}
        </div>
      )}
    </div>
  );
};

export const ChartFullscreenDialog = ({ title, icon, description, controls, captureRef, children, viewer }: ChartFullscreenDialogProps) => (
  <DialogContent
    layout="mobile-full"
    hideClose
    data-chart-viewer=""
    className="flex flex-col gap-0 overflow-hidden p-0 max-sm:pb-0 max-sm:pt-0 sm:h-[92dvh] sm:max-h-[94dvh] sm:w-[94vw] sm:max-w-none"
  >
    <div data-chart-viewer-header="" className={`shrink-0 border-b bg-background pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${PAD_X}`}>
      {/* Phones and tablets: [title + description | close] then the controls on their own row.
          md and up: title block, controls and close share one row. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <DialogTitle className="flex min-h-9 min-w-0 items-center gap-2 pr-0 text-xl leading-tight [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:pr-0">
            {icon && <span aria-hidden="true" className="contents">{icon}</span>}
            <span className="min-w-0">{title}</span>
          </DialogTitle>
          {description
            ? <DialogDescription asChild><div className="min-w-0 text-sm text-muted-foreground">{description}</div></DialogDescription>
            : <DialogDescription className="sr-only">{`Full screen view of ${title}. Use the controls to change the range, or press Escape to close.`}</DialogDescription>}
        </div>
        <DialogClose asChild>
          <CloseButton label="Close full screen view" data-html2canvas-ignore="true" className="-mr-1 shrink-0 md:order-3" />
        </DialogClose>
        {controls && <div className="min-w-0 max-w-full basis-full empty:hidden md:order-2 md:basis-auto">{controls}</div>}
      </div>
    </div>
    <ViewerPanel title={title} captureRef={captureRef} viewer={viewer}>{children}</ViewerPanel>
  </DialogContent>
);

/** The pop-out button, beside the card's title. Always labelled "Open <title> in full screen", 32px on a mouse and 44px on touch, never in a PDF. */
export const ChartExpandButton = forwardRef<HTMLButtonElement, { title: string } & Omit<ComponentPropsWithoutRef<typeof Button>, 'title'>>(
  ({ title, className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="sm"
      className={`chart-action h-8 w-8 min-w-0 shrink-0 px-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${className ?? ''}`.trim()}
      aria-label={`Open ${title} in full screen`}
      title="Full screen"
      data-chart-expand=""
      data-html2canvas-ignore="true"
      {...props}
    >
      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  ),
);
ChartExpandButton.displayName = 'ChartExpandButton';
