import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Minus } from 'lucide-react';
import type { DeltaTint, DeltaTone } from '@/lib/bodyHistory';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * The tile layout for Weight and Waist history: each entry is a small box in a grid (2 across on a phone, 3 on a
 * tablet, 4 on a wide screen), grouped under the same month headings as before.
 *
 * It keeps the same contract as HistoryRow, so everything that finds or drives a row keeps working:
 *  - the tile is an <li data-history-row="<record id>">;
 *  - when it can open, its summary is ONE disclosure button (aria-expanded / aria-controls) that is the first button
 *    inside the tile's first <div> (focusHistoryRow looks for exactly that), and the panel opens under it;
 *  - when it cannot open, the tile itself can be focused by script only (tabindex -1);
 *  - `actions` sit beside the disclosure button, never inside it.
 * The summary goes inside a <button>, so it may only hold inline content (<span>), never <div> or <p>.
 *
 * The tint says which way the number moved. It is never the only cue: every tile also prints a sign, an arrow and a
 * word ("No change", "First entry") and says the same in a sentence for screen readers.
 */

/**
 * Soft tints, by colour. Colours come from the --delta-* tokens in index.css (--delta-up is the soft red, --delta-down the
 * soft green, --delta-flat the brand orange; the names come from the Weight and Waist mapping). Every class is written out in full.
 */
const TILE_TONES: Record<DeltaTint, { surface: string; chip: string; icon: string }> = {
  red: {
    surface: 'border-delta-up/30 bg-delta-up/[0.08] [@media(hover:hover)]:hover:bg-delta-up/[0.12]',
    chip: 'bg-delta-up/15',
    icon: 'text-delta-up',
  },
  green: {
    surface: 'border-delta-down/30 bg-delta-down/[0.08] [@media(hover:hover)]:hover:bg-delta-down/[0.12]',
    chip: 'bg-delta-down/15',
    icon: 'text-delta-down',
  },
  flat: {
    surface: 'border-delta-flat/30 bg-delta-flat/[0.08] [@media(hover:hover)]:hover:bg-delta-flat/[0.12]',
    chip: 'bg-delta-flat/15',
    icon: 'text-delta-flat',
  },
};

const TONE_ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/** A small pill with the change as a sign and a number. The arrow is decorative; the text carries the meaning. */
export const DeltaChip = ({ direction, tint, children }: { direction: DeltaTone; tint: DeltaTint; children: ReactNode }) => {
  const Icon = TONE_ICONS[direction];
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground', TILE_TONES[tint].chip)}>
      <Icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', TILE_TONES[tint].icon)} />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
};

/** The grid the tiles sit in. An explicit list role keeps list semantics in Safari. */
export const HistoryTileGrid = ({ children, className }: { children: ReactNode; className?: string }) => (
  <ul role="list" className={cn('grid grid-cols-2 gap-2.5 p-3 md:grid-cols-3 md:gap-3 md:p-4 xl:grid-cols-4', className)}>
    {children}
  </ul>
);

export interface HistoryTileProps {
  /** Which way the number moved (data-tone), and the colour it is drawn in (data-tint). */
  tone: DeltaTone;
  tint: DeltaTint;
  summary: ReactNode;
  /** Revealed content. Present = the tile can open. */
  panel?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Always-visible controls under the summary, outside the disclosure button (wide screens with a mouse). */
  actions?: ReactNode;
  panelLabel?: string;
  /** The entry selected on the chart: a neutral ring that is not one of the tints. */
  selected?: boolean;
  /** The id of the record, so something outside the list (a chart's "Jump to entry") can find this exact tile. */
  rowId?: string;
}

export const HistoryTile = ({ tone, tint, summary, panel, expanded = false, onExpandedChange, actions, panelLabel, selected, rowId }: HistoryTileProps) => {
  const expandable = panel !== undefined && panel !== null && panel !== false;

  return (
    // The <li> is the Collapsible root (asChild): li > div > button[aria-expanded] is what focusHistoryRow queries.
    <Collapsible asChild open={expandable && expanded} onOpenChange={onExpandedChange}>
    <li
      data-history-row={rowId}
      data-tone={tone}
      data-tint={tint}
      tabIndex={rowId && !expandable ? -1 : undefined}
      className={cn(
        'group/row min-w-0 scroll-mt-16 rounded-lg border transition-colors motion-reduce:transition-none',
        TILE_TONES[tint].surface,
        rowId && !expandable && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-2 ring-foreground/60',
      )}
    >
      <div className="flex flex-col">
        {expandable ? (
          <CollapsibleTrigger asChild>
          <button
            type="button"
            className="press [--press-scale:0.98] relative flex min-h-11 w-full min-w-0 flex-col rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {summary}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'absolute right-2.5 top-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
            />
          </button>
          </CollapsibleTrigger>
        ) : (
          <div className="min-h-11 min-w-0 p-3">{summary}</div>
        )}
        {actions}
      </div>
      {expandable && (
        <CollapsibleContent role={panelLabel ? 'group' : undefined} aria-label={panelLabel} className="border-t border-dashed border-border">
          <div className="px-3 pb-3 pt-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">{panel}</div>
        </CollapsibleContent>
      )}
    </li>
    </Collapsible>
  );
};

/** The labelled buttons inside an opened tile on a phone: stacked full width, because a tile is narrow. */
export const TileActionTray = ({ label, children }: { label: string; children: ReactNode }) => (
  <div role="group" aria-label={label}>
    <p aria-hidden="true" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Actions
      <span className="h-px flex-1 bg-border" />
    </p>
    <div className="grid grid-cols-1 gap-2">{children}</div>
  </div>
);
