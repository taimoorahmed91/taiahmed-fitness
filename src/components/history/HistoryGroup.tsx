import { Fragment, useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { HISTORY_VARIANTS, type HistoryVariant } from '@/components/history/historyVariants';

/**
 * One group of a history list (a day of meals, a week of workouts, a month of readings): a heading band, then its rows.
 *
 * The band reads left to right as  marker · title + facts · stat:
 *  - `marker`  a small tile on the left (a date badge or an icon). Decorative, so it is hidden from screen readers;
 *              the title already says the same thing in words.
 *  - `title`   a real heading. It sticks under the app header on tall screens (not on short or heavily zoomed ones).
 *  - `summary` short facts on one wrapping line with dot separators.
 *  - `stat`    the one number that matters for the group, on the right (see GroupStat).
 * `variant` picks the colour family (see historyVariants). The default look is the plain grey band.
 */
export interface HistoryGroupProps {
  /** Heading content, for example "Today" plus a <time> element. */
  title: ReactNode;
  /** Short facts about the group. Rendered on one wrapping line with dot separators. */
  summary?: ReactNode[];
  /** Heading level. Lists sit inside a card titled h3, so groups default to h4. */
  headingLevel?: 'h3' | 'h4' | 'h5';
  variant?: HistoryVariant;
  marker?: ReactNode;
  stat?: ReactNode;
  /** Put the stat under the facts on very narrow screens instead of beside them (for a wide stat). */
  stackStatOnNarrow?: boolean;
  /** Extra classes for the band itself, for example right padding that lines the stat up with a table column below. */
  bandClassName?: string;
  children: ReactNode;
  className?: string;
}

// Written out per shape so Tailwind can see every class.
const COLUMNS = {
  plain: 'grid-cols-[minmax(0,1fr)]',
  marker: 'grid-cols-[auto_minmax(0,1fr)]',
  stat: 'grid-cols-[minmax(0,1fr)_auto]',
  both: 'grid-cols-[auto_minmax(0,1fr)_auto]',
} as const;

// A wide stat drops under the facts below 480px and moves beside them above it.
const STACKED_WITH_MARKER =
  'col-start-2 row-start-3 mt-2 justify-self-start min-[480px]:col-start-3 min-[480px]:row-span-2 min-[480px]:row-start-1 min-[480px]:mt-0 min-[480px]:justify-self-end';
const STACKED =
  'col-start-1 row-start-3 mt-2 justify-self-start min-[480px]:col-start-2 min-[480px]:row-span-2 min-[480px]:row-start-1 min-[480px]:mt-0 min-[480px]:justify-self-end';

export const HistoryGroup = ({
  title,
  summary,
  headingLevel = 'h4',
  variant = 'default',
  marker,
  stat,
  stackStatOnNarrow = false,
  bandClassName,
  children,
  className,
}: HistoryGroupProps) => {
  const headingId = useId();
  const Heading = headingLevel;
  const style = HISTORY_VARIANTS[variant];
  const facts = (summary ?? []).filter((fact) => fact !== null && fact !== undefined && fact !== false);
  const hasMarker = !!marker;
  const hasStat = !!stat;
  const shape = hasMarker && hasStat ? 'both' : hasMarker ? 'marker' : hasStat ? 'stat' : 'plain';
  const textCol = hasMarker ? 'col-start-2' : 'col-start-1';
  const statCol = hasMarker ? 'col-start-3' : 'col-start-2';

  return (
    <section aria-labelledby={headingId} className={className}>
      {/* The outer layer is solid, so rows never show through the sticky band. */}
      <div className="z-10 bg-card [@media(min-height:40rem)]:sticky [@media(min-height:40rem)]:top-[calc(4rem+env(safe-area-inset-top,0px))]">
        <div className={cn('grid items-center gap-x-3 border-y px-3 py-2.5 sm:px-4', COLUMNS[shape], style.header, bandClassName)}>
          {hasMarker && (
            <div aria-hidden="true" className="col-start-1 row-span-2 row-start-1 flex items-center">
              {marker}
            </div>
          )}
          <Heading id={headingId} className={cn('row-start-1 min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base', textCol)}>
            {title}
          </Heading>
          {hasStat && (
            <div className={cn(stackStatOnNarrow ? (hasMarker ? STACKED_WITH_MARKER : STACKED) : cn('row-span-2 row-start-1 justify-self-end', statCol))}>{stat}</div>
          )}
          {facts.length > 0 && (
            <p className={cn('row-start-2 mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground', textCol)}>
              {facts.map((fact, i) => (
                <Fragment key={i}>
                  {i > 0 && <span aria-hidden="true">·</span>}
                  <span>{fact}</span>
                </Fragment>
              ))}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
};

/** The one number a group is about, large, with a small unit and a label under it. */
export const GroupStat = ({ value, unit, label, className }: { value: ReactNode; unit?: string; label?: ReactNode; className?: string }) => (
  <span className={cn('block text-right leading-tight', className)}>
    <span className="block text-lg font-semibold tabular-nums text-foreground">
      {value}
      {unit && <span className="text-xs font-normal text-muted-foreground"> {unit}</span>}
    </span>{' '}
    {label && <span className="block text-xs text-muted-foreground">{label}</span>}
  </span>
);

/** An icon tile for a group marker. */
export const GroupGlyph = ({ variant, children }: { variant: HistoryVariant; children: ReactNode }) => (
  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg [&>svg]:h-5 [&>svg]:w-5', HISTORY_VARIANTS[variant].marker)}>{children}</span>
);

/** The list of rows inside a group (or a flat, ungrouped list). Explicit role keeps list semantics in Safari. */
export const HistoryList = ({ children, className, variant = 'default' }: { children: ReactNode; className?: string; variant?: HistoryVariant }) => (
  <ul role="list" className={cn(HISTORY_VARIANTS[variant].divide, className)}>
    {children}
  </ul>
);
