import { useRef, type ReactNode, type RefObject } from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { ChartPdfButton, type PdfColumn } from '@/components/ChartPdfButton';
import { ChartRangeControls, ChartStyleControl, type ChartRange, type ChartStyle } from '@/components/ChartViewControls';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ChartExpandButton, ChartFullscreenDialog, type ChartViewerSpec } from '@/components/charts/ChartFullscreenDialog';
import { cn } from '@/lib/utils';

/**
 * The one header every chart card uses. Nothing else should lay out a chart's title, range / style
 * switches, PDF or full-screen button (source guards in tests/chartHeaderContract.test.tsx enforce it).
 *
 * ONE layout, at every width, for every chart (a third-width, half-width or full-width card all look alike):
 *
 *   [ icon  Title                          ]   1. title
 *   [ one-line description                 ]   2. description (optional)
 *   [ 7D  14D  30D  90D  All               ]   3. control row 1: the date range, always alone
 *   [ line/bar ]  [ PDF ]  [ full screen ]     4. control row 2: line/bar (if the chart has it), then PDF
 *                                                 and full screen, always together
 *   [ badges / change lines (optional)     ]   5. extra full-width rows
 *
 * - Range-only charts (no line/bar): row 2 is PDF + full screen. Fixed-window charts (no range): row 1 is
 *   absent and row 2 is just full screen (+ PDF if the chart has one).
 * - Nothing is ever placed beside the title: no desktop one-liner, no wrapping surprises. Rows 3 and 4 are
 *   block rows, so the result does not depend on how wide the card happens to be. Row 2 is a never-wrapping
 *   unit (about 240px at 320px wide), so PDF and full screen can never strand alone.
 * - Every control is 44px on touch screens (the shared controls carry that), and the rows may shrink and
 *   wrap inside the card, so nothing widens the page.
 * - The full-screen viewer (ChartFullscreenDialog) shows the SAME two rows in the SAME order, built from the
 *   same pieces with the same setters. From md up it lays row 1 and row 2 out side by side to save height;
 *   the order and grouping do not change, and it has no second full-screen button.
 * - Every chart card must decide: `viewer={{ render }}` offers the viewer (a bigger chart with the same state),
 *   `viewer={false}` opts out on purpose.
 * - The controls are data-html2canvas-ignore: exported PDFs show the title, not the buttons.
 * - The title is a CardTitle, so level and size come from the parent Card (`titleSize="chart"`).
 */

/** What the controls need. `useChartView` and `useChartRange` results can be spread straight in. */
export interface ChartHeaderView {
  range: ChartRange;
  setRange: (range: ChartRange) => void;
  /** Offer "All time" too. */
  extended?: boolean;
  /** Give both `style` and `setStyle` for a line/bar switch; leave them out for range-only charts. */
  style?: ChartStyle;
  setStyle?: (style: ChartStyle) => void;
}

export interface ChartHeaderPdf {
  /** The element to capture (usually the Card). */
  targetRef: RefObject<HTMLElement>;
  subtitle?: string;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
}

export interface ChartHeaderProps {
  /** Plain text: it names the chart for the heading, the controls and the PDF file. */
  title: string;
  /** Decorative icon shown before the title (hidden from screen readers). */
  icon?: ReactNode;
  /** One muted line under the title: a headline number, an average, a short explanation. */
  description?: ReactNode;
  /** Range (and optional line/bar) controls. Omit for charts with a fixed window. */
  view?: ChartHeaderView;
  /** PDF export. Placed with the controls, always. */
  pdf?: ChartHeaderPdf;
  /** Extra buttons that belong with the controls (rare). */
  actions?: ReactNode;
  /**
   * Full-screen viewer. `{ render }` draws the chart for it (give the chart `expanded`); the viewer reuses this
   * header's title, description, view controls, PDF and children, so it always shows the card's own state.
   * `false` opts out explicitly (only when a bigger chart is not meaningful).
   */
  viewer: ChartViewerSpec | false;
  /** Full-width rows under the band: badges, change lines, a status sentence. */
  children?: ReactNode;
  className?: string;
}

interface ControlsGroupProps {
  title: string;
  view?: ChartHeaderView;
  pdf?: ChartHeaderPdf;
  actions?: ReactNode;
  /** The pop-out button. Only the card has it; inside the viewer it would open itself. */
  popOut?: ReactNode;
  /** 'card': two stacked rows at every width. 'viewer': the same two rows, side by side from md up. */
  layout: 'card' | 'viewer';
}

const GROUP_CLASS: Record<ControlsGroupProps['layout'], string> = {
  card: 'flex min-w-0 max-w-full flex-col items-start gap-2',
  viewer: 'flex min-w-0 max-w-full flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3',
};

/**
 * Row 1: the range. Row 2 (a never-split unit): style, extra actions, PDF, full screen.
 * The card and the full-screen viewer both render this, so they always show and change the same state.
 */
const ChartControlsGroup = ({ title, view, pdf, actions, popOut, layout }: ControlsGroupProps) => {
  const hasStyle = !!view?.style && !!view.setStyle;
  const hasTrailing = hasStyle || !!pdf || !!actions || !!popOut;
  if (!view && !hasTrailing) return null;
  return (
    <div data-chart-controls="" data-chart-layout={layout} data-html2canvas-ignore="true" className={GROUP_CLASS[layout]}>
      {view && (
        <div data-chart-controls-row="range" className="min-w-0 max-w-full">
          <ChartRangeControls range={view.range} setRange={view.setRange} extended={view.extended} label={title} />
        </div>
      )}
      {hasTrailing && (
        <div data-chart-controls-row="actions" data-chart-actions="" className="flex shrink-0 items-center gap-2">
          {hasStyle && <ChartStyleControl style={view!.style!} setStyle={view!.setStyle!} label={title} />}
          {actions}
          {pdf && <ChartPdfButton targetRef={pdf.targetRef} title={title} subtitle={pdf.subtitle} columns={pdf.columns} rows={pdf.rows} />}
          {popOut}
        </div>
      )}
    </div>
  );
};

export const ChartHeader = ({ title, icon, description, view, pdf, actions, viewer, children, className }: ChartHeaderProps) => {
  // What the viewer's PDF button captures. The card's PDF button keeps capturing the card (pdf.targetRef).
  const viewerCaptureRef = useRef<HTMLDivElement>(null);
  const popOut = viewer ? (
    <DialogTrigger asChild>
      <ChartExpandButton title={title} />
    </DialogTrigger>
  ) : null;
  return (
    // Dialog is state only (it draws nothing itself): the trigger sits in the actions row, the viewer portals to <body>.
    <Dialog>
      <CardHeader className={cn('space-y-3 pb-2', className)} data-chart-header="">
        <div data-chart-text="" className="min-w-0 space-y-1">
          <div className="flex items-center">
            <CardTitle className="flex min-w-0 items-center gap-2 leading-tight">
              {icon && <span aria-hidden="true" className="contents">{icon}</span>}
              {title}
            </CardTitle>
          </div>
          {description && <div data-chart-description="" className="min-w-0 text-sm text-muted-foreground">{description}</div>}
        </div>
        <ChartControlsGroup title={title} view={view} pdf={pdf} actions={actions} popOut={popOut} layout="card" />
        {children}
      </CardHeader>
      {viewer && (
        <ChartFullscreenDialog
          title={title}
          icon={icon}
          description={description}
          captureRef={viewerCaptureRef}
          viewer={viewer}
          controls={<ChartControlsGroup title={title} view={view} pdf={pdf && { ...pdf, targetRef: viewerCaptureRef }} actions={actions} layout="viewer" />}
        >
          {children}
        </ChartFullscreenDialog>
      )}
    </Dialog>
  );
};
