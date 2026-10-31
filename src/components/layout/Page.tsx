import { useId, type ComponentType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { CARD_TITLE_SIZE_CLASS, HEADING_LEVEL_SIZE } from '@/components/ui/card';

/**
 * Page building blocks that sit inside AppLayout. Every signed-in page uses
 * the same pattern so gutters, spacing and headings line up from screen to
 * screen:
 *
 *   <PageContainer>
 *     <PageHeader icon={Scale} title="Weight" description="..." actions={...} />
 *     <PageSection title="History"> ... </PageSection>
 *   </PageContainer>
 *
 * AppLayout already supplies the one <main> landmark, so none of these render
 * one. Gutters match the header (16px on phones, 32px from `sm` up).
 */

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** The one horizontal gutter: header, demo banner and every page use it so edges line up. */
export const PAGE_GUTTER_CLASS = 'px-4 sm:px-8';

/**
 * Space the signed-in shell keeps free at the end of every page so the floating chat button
 * (ChatBot) can never cover the last control. One rule for every page, none per page:
 *
 *   FAB top  = max(1rem, safe-area-bottom) + --bottom-bar-height + 3.5rem (the h-14 button)
 *   reserve  = that + 0.5rem of air
 *
 * Phones (bar 4rem, no home indicator): 4rem + 1rem + 4rem = 9rem (144px). From `sm` up (bar 0): 5rem (80px).
 * Toast lift is temporary and deliberately not reserved. Keep the edge in step with ChatBot's fabBottom.
 */
export const CHAT_FAB_SIZE_REM = 3.5;
export const CHAT_FAB_AIR_REM = 0.5;
export const CHAT_FAB_EDGE = 'max(1rem, env(safe-area-inset-bottom))';
export const CHAT_FAB_CLEARANCE = `calc(var(--bottom-bar-height, 0px) + ${CHAT_FAB_EDGE} + ${CHAT_FAB_SIZE_REM + CHAT_FAB_AIR_REM}rem)`;

export const PageContainer = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('container space-y-6 py-6 sm:py-8', PAGE_GUTTER_CLASS, className)}>{children}</div>
);

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  /** Buttons or status shown on the right (wraps below the title on phones). */
  actions?: ReactNode;
  className?: string;
}

/** The one h1 on the page, with an optional icon, one-line description and actions. */
export const PageHeader = ({ title, description, icon: Icon, actions, className }: PageHeaderProps) => (
  <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
    <div className="flex min-w-0 items-center gap-3">
      {Icon && <Icon className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8" aria-hidden="true" />}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/** Heading levels a section can use. The size follows the level (h2 text-xl, h3 text-lg, h4 text-base), same scale as CardTitle. */
export type PageSectionHeadingLevel = 'h2' | 'h3' | 'h4';

interface PageSectionProps {
  /** The heading for this block of the page (an h2 unless `headingLevel` says otherwise). */
  title: ReactNode;
  /**
   * Heading element for the title (default "h2", directly under the page's h1).
   * Use "h3" for a section nested inside another section, so the outline never skips a level.
   */
  headingLevel?: PageSectionHeadingLevel;
  description?: ReactNode;
  icon?: IconComponent;
  actions?: ReactNode;
  /** Keep the h2 for screen readers only (use when the cards inside already say it). */
  hideTitle?: boolean;
  className?: string;
  children: ReactNode;
}

/** A labelled group of content (a heading plus its cards/tables), spaced like every other section. */
export const PageSection = ({
  title,
  description,
  icon: Icon,
  actions,
  headingLevel = 'h2',
  hideTitle = false,
  className,
  children,
}: PageSectionProps) => {
  const headingId = useId();
  const Heading = headingLevel;
  return (
    <section aria-labelledby={headingId} className={cn('space-y-4', className)}>
      {hideTitle ? (
        <Heading id={headingId} className="sr-only">
          {title}
        </Heading>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <Heading
              id={headingId}
              className={cn('flex items-center gap-2 font-semibold tracking-tight', CARD_TITLE_SIZE_CLASS[HEADING_LEVEL_SIZE[headingLevel]])}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              {title}
            </Heading>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
};

/**
 * Placeholder shown while a page's data is on its way. It only says "loading";
 * it never shows numbers or an empty message that might turn out to be wrong.
 */
export const PageLoading = ({
  label = 'Loading',
  rows = 3,
  stats = false,
  className,
}: {
  label?: string;
  rows?: number;
  /** Also show a row of four summary-tile placeholders. */
  stats?: boolean;
  className?: string;
}) => (
  <div role="status" aria-live="polite" className={cn('space-y-4', className)}>
    <span className="sr-only">{label}</span>
    {stats && (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )}
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  </div>
);

interface PageEmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  action?: ReactNode;
  className?: string;
}

/** What to show when loading has finished and there is genuinely nothing to list. */
export const PageEmptyState = ({ title, description, icon: Icon, action, className }: PageEmptyStateProps) => (
  <div className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
    {Icon && <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
    <p className="font-medium">{title}</p>
    {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

/**
 * Add to a plain Button (size="icon") that must act as an icon-only control
 * where IconButton can't be used (for example ConfirmDeleteButton). Keeps the
 * 44x44 minimum on touch screens.
 */
export const ICON_TOUCH_CLASS =
  '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:min-w-11';
