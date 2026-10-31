import { Fragment, useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One group of a history list (a day of meals, a week of workouts): a heading with a short summary
 * line, then its rows. The heading is a real heading and sticks under the app header on tall screens
 * (not on short or heavily zoomed ones, where it would eat the page).
 */
export interface HistoryGroupProps {
  /** Heading content, for example "Today" plus a <time> element. */
  title: ReactNode;
  /** Short facts about the group. Rendered on one wrapping line with dot separators. */
  summary?: ReactNode[];
  /** Heading level. Lists sit inside a card titled h3, so groups default to h4. */
  headingLevel?: 'h3' | 'h4' | 'h5';
  children: ReactNode;
  className?: string;
}

export const HistoryGroup = ({ title, summary, headingLevel = 'h4', children, className }: HistoryGroupProps) => {
  const headingId = useId();
  const Heading = headingLevel;
  const facts = (summary ?? []).filter((fact) => fact !== null && fact !== undefined && fact !== false);
  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="z-10 border-y bg-muted px-3 py-2 [@media(min-height:40rem)]:sticky [@media(min-height:40rem)]:top-[calc(4rem+env(safe-area-inset-top,0px))] sm:px-4">
        <Heading id={headingId} className="text-sm font-semibold leading-snug text-foreground">
          {title}
        </Heading>
        {facts.length > 0 && (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {facts.map((fact, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden="true">·</span>}
                <span>{fact}</span>
              </Fragment>
            ))}
          </p>
        )}
      </div>
      {children}
    </section>
  );
};

/** The list of rows inside a group (or a flat, ungrouped list). Explicit role keeps list semantics in Safari. */
export const HistoryList = ({ children, className }: { children: ReactNode; className?: string }) => (
  <ul role="list" className={cn('divide-y divide-border', className)}>
    {children}
  </ul>
);
