import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Where a page's trend chart sits, next to its history.
 *
 *  - Phone (under 768px): a collapsed "Trend" disclosure above the history (the log form stays first). The chart stays
 *    mounted while it is closed, so its selected point, range and style are never lost; it is only hidden.
 *  - 768px and wider: no disclosure, the chart is always open, full width, directly above the history list. The list's
 *    Date / Value / Change / Notes columns need the full page width, so the two are stacked rather than side by side.
 *
 * Both layouts are the same markup (CSS decides), so resizing or rotating never remounts the chart.
 */
export const TrendSection = ({ label = 'Trend', hint, open, onOpenChange, children }: {
  label?: string;
  /** One short muted line next to the label: what the chart shows. */
  hint?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) => {
  const panelId = useId();
  return (
    <div data-trend-section="" data-trend-open={open ? '' : undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className={cn(
          'panel-surface press [--press-scale:0.98] flex min-h-11 w-full items-center gap-3 rounded-lg border bg-card px-4 py-2 text-left shadow-sm md:hidden',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="text-base font-semibold">{label}</span>
        {hint && <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{hint}</span>}
        <ChevronDown aria-hidden="true" className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      <div id={panelId} data-trend-panel="" className={cn('min-w-0', open ? 'mt-3 md:mt-0' : 'max-md:hidden')}>
        {children}
      </div>
    </div>
  );
};
