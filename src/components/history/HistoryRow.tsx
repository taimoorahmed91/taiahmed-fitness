import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One row of a history list.
 *
 *  - With a `panel`, the whole summary is ONE disclosure button (aria-expanded / aria-controls) and the
 *    panel opens under it. Controls such as `actions` sit beside the button, never inside it.
 *  - Without a `panel` the row is plain, static content.
 *
 * The summary goes inside a <button>, so it may only contain inline (phrasing) content: use <span>
 * with `block` / `flex` classes rather than <div> or <p>.
 */
export interface HistoryRowProps {
  summary: ReactNode;
  /** Revealed content (details and/or an ActionTray). Present = the row can expand. */
  panel?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Always-visible controls beside the summary, outside the disclosure button (desktop inline actions). */
  actions?: ReactNode;
  /** Centre the chevron vertically (tall, multi-line summaries) instead of aligning it with the first line. */
  centerChevron?: boolean;
  /** Keep the chevron's space on rows that cannot expand, so columns line up. */
  reserveChevron?: boolean;
  /** Names the panel for assistive tech. */
  panelLabel?: string;
  className?: string;
  summaryClassName?: string;
}

const PAD = 'px-3 sm:px-4';

export const HistoryRow = ({
  summary,
  panel,
  expanded = false,
  onExpandedChange,
  actions,
  reserveChevron,
  centerChevron,
  panelLabel,
  className,
  summaryClassName,
}: HistoryRowProps) => {
  const panelId = useId();
  const expandable = panel !== undefined && panel !== null && panel !== false;

  return (
    <li className={cn('group/row scroll-mt-16', expanded && 'bg-muted/30', className)}>
      <div className="flex items-start">
        {expandable ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => onExpandedChange?.(!expanded)}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 items-start gap-2 py-2.5 text-left',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              '[@media(hover:hover)]:hover:bg-muted/50',
              PAD,
              summaryClassName,
            )}
          >
            <span className="flex min-w-0 flex-1 items-start">{summary}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                centerChevron ? 'self-center' : 'mt-1',
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
            />
          </button>
        ) : (
          <div className={cn('flex min-h-11 min-w-0 flex-1 items-start gap-2 py-2.5', PAD, summaryClassName)}>
            <span className="flex min-w-0 flex-1 items-start">{summary}</span>
            {reserveChevron && <span aria-hidden="true" className="h-4 w-4 shrink-0" />}
          </div>
        )}
        {actions}
      </div>
      {expandable && (
        <div
          id={panelId}
          role={panelLabel ? 'group' : undefined}
          aria-label={panelLabel}
          hidden={!expanded}
          className={cn('border-t border-dashed px-3 pb-3 pt-3 sm:px-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150')}
        >
          {expanded ? panel : null}
        </div>
      )}
    </li>
  );
};
