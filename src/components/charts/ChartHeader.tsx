import type { ReactNode, RefObject } from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { ChartPdfButton, type PdfColumn } from '@/components/ChartPdfButton';
import { ChartRangeControls, ChartStyleControl, type ChartRange, type ChartStyle } from '@/components/ChartViewControls';
import { cn } from '@/lib/utils';

/**
 * The one header every chart card uses. Nothing else should lay out a chart's title, range / style
 * switches or PDF button (a source guard in tests/chartHeaderContract.test.tsx enforces it).
 *
 *   wide:    [ icon  Title                              ][ range ][ style ][ PDF ]
 *            [ one-line description                     ]
 *   narrow:  [ icon  Title                              ]
 *            [ one-line description                     ]
 *            [ range                                    ]
 *            [ style  PDF                               ]   <- style and PDF always travel together
 *
 * - The title block is as wide as the title itself and takes any spare width; the controls group keeps its
 *   natural width, so it sits on the right when title + controls fit and drops UNDER the title, left aligned,
 *   when they do not. The description is its own full-width row (phones: right under the title, so it reads
 *   with it; sm and up: after the controls).
 * - Inside the controls group the range is one unit and style + actions + PDF are a second, never-split
 *   unit, so the PDF button can only wrap together with the style switch, never alone.
 * - The whole group is data-html2canvas-ignore: exported PDFs show the title, not the buttons.
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
  /** Full-width rows under the band: badges, change lines, a status sentence. */
  children?: ReactNode;
  className?: string;
}

export const ChartHeader = ({ title, icon, description, view, pdf, actions, children, className }: ChartHeaderProps) => {
  const hasStyle = !!view?.style && !!view.setStyle;
  const hasTrailing = hasStyle || !!pdf || !!actions;
  return (
    <CardHeader className={cn('space-y-2 pb-2', className)} data-chart-header="">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="order-1 min-w-0 flex-auto">
          {/* Same height as the controls from sm up, so a one-line title lines up with them. */}
          <div className="flex items-center sm:min-h-8 sm:[@media(pointer:coarse)]:min-h-11">
            <CardTitle className="flex min-w-0 items-center gap-2 leading-tight">
              {icon && <span aria-hidden="true" className="contents">{icon}</span>}
              {title}
            </CardTitle>
          </div>
        </div>
        {(view || hasTrailing) && (
          <div data-chart-controls="" data-html2canvas-ignore="true" className="order-3 flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:order-2">
            {view && <ChartRangeControls range={view.range} setRange={view.setRange} extended={view.extended} label={title} />}
            {hasTrailing && (
              <div data-chart-actions="" className="flex shrink-0 items-center gap-2">
                {hasStyle && <ChartStyleControl style={view!.style!} setStyle={view!.setStyle!} label={title} />}
                {actions}
                {pdf && <ChartPdfButton targetRef={pdf.targetRef} title={title} subtitle={pdf.subtitle} columns={pdf.columns} rows={pdf.rows} />}
              </div>
            )}
          </div>
        )}
        {/* Its own full-width row, so it never wraps beside the controls. Phones: right under the title. From sm up: under the controls. */}
        {description && <div className="order-2 -mt-2 min-w-0 basis-full text-sm text-muted-foreground sm:order-3 sm:mt-0">{description}</div>}
      </div>
      {children}
    </CardHeader>
  );
};
