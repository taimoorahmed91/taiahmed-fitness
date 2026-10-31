import { forwardRef, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/**
 * The one full-screen chart viewer. ChartHeader owns it (so every chart card gets it the same way) and
 * charts only say WHAT to draw in it: `viewer={{ render: () => <the same chart, expanded> }}`.
 *
 * What it guarantees
 *  - It shows the very same chart as the card: the chart component keeps its range / line-bar state and
 *    renders the viewer body from that state, so there is no copy. The range and style controls inside the
 *    viewer are the card's own setters.
 *  - Phones: full screen, clear of the notch and home bar. sm and up: about 94vw x 92dvh.
 *  - Title, close button and controls stay put at the top; the chart (and its notes / summary) scroll
 *    below them when the screen is short. The page behind never scrolls (Radix locks it).
 *  - Escape, the close button, focus trap and focus return come from Radix Dialog.
 */
export interface ChartViewerSpec {
  /** Draws the chart for the viewer. Called only while the viewer is open. Give the chart `expanded`. */
  render: () => ReactNode;
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
    <div data-chart-viewer-scroll="" className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${PAD_X}`}>
      <div ref={captureRef} data-chart-viewer-capture="" className="flex flex-1 flex-col gap-3 bg-background">
        {children}
        <ViewerBody viewer={viewer} />
      </div>
    </div>
  </DialogContent>
);

/** The pop-out button. Always labelled "Open <title> in full screen", 44px wide like the PDF button, never in a PDF. */
export const ChartExpandButton = forwardRef<HTMLButtonElement, { title: string } & Omit<ComponentPropsWithoutRef<typeof Button>, 'title'>>(
  ({ title, className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="sm"
      className={`min-w-11 shrink-0 px-0 ${className ?? ''}`.trim()}
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
