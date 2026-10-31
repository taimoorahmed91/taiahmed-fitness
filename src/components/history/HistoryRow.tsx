import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HISTORY_VARIANTS, type HistoryVariant } from '@/components/history/historyVariants';

/**
 * One row of a history list.
 *
 *  - With a `panel`, the whole summary is ONE disclosure button (aria-expanded / aria-controls) and the
 *    panel opens under it. Controls such as `actions` sit beside the button, never inside it.
 *  - Without a `panel` the row is plain, static content.
 *
 * The summary goes inside a <button>, so it may only contain inline (phrasing) content: use <span>
 * with `block` / `flex` classes rather than <div> or <p>.
 *
 * `variant` only changes colour and surfaces (an open row gets a faint tint and a bar on its left edge);
 * the structure and the keyboard behaviour are the same for every variant.
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
  variant?: HistoryVariant;
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
  variant = 'default',
  className,
  summaryClassName,
}: HistoryRowProps) => {
  const panelId = useId();
  const expandable = panel !== undefined && panel !== null && panel !== false;
  const style = HISTORY_VARIANTS[variant];

  return (
    <li className={cn('group/row scroll-mt-16 transition-colors motion-reduce:transition-none', expanded && style.open, className)}>
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
                expanded && cn('rotate-180', variant !== 'default' && style.text),
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
          className={cn('px-3 pb-3 pt-3 sm:px-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150', style.panel)}
        >
          {expanded ? panel : null}
        </div>
      )}
    </li>
  );
};

/**
 * The timeline slot at the start of a row: a thin rail that runs through the group's rows, with a node on it.
 * The first row's rail starts at its node, the last row's ends there, and a lone row has no rail.
 *  - kind "dot":  a round node, hollow, filled while the row is open (meals).
 *  - kind "tick": a short horizontal tick, like a mark on a ruler (measurements).
 * It stretches into the row's padding (negative margin) so the rail is unbroken between rows; the owner row must
 * give its summary a min-height of 1.5rem so a one-line row still reaches both edges. Purely decorative.
 */
export const TimelineNode = ({ variant, kind = 'dot', open = false }: { variant: HistoryVariant; kind?: 'dot' | 'tick'; open?: boolean }) => {
  const style = HISTORY_VARIANTS[variant];
  return (
    <span aria-hidden="true" className="relative -my-2.5 w-3 shrink-0 self-stretch">
      <span className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-border group-first/row:top-5 group-last/row:bottom-auto group-last/row:h-5 group-only/row:hidden" />
      {kind === 'tick' ? (
        <span className={cn('absolute left-1/2 top-5 h-0.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm', style.fill)} />
      ) : (
        <span
          className={cn(
            'absolute left-1/2 top-5 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors motion-reduce:transition-none',
            style.edge,
            open ? style.fill : 'bg-card',
          )}
        />
      )}
    </span>
  );
};
