import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Card spacing is driven by the `--card-pad` token (defined in index.css):
 * 16px on phones, 24px from `sm` up. Sections read it with `p-[var(--card-pad)]`, so a
 * caller's own `p-*` class still replaces it exactly as before. A card that needs
 * a different rhythm can set `[--card-pad:0.75rem]` on the Card itself.
 */

export type CardHeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type CardTitleTag = CardHeadingLevel | "p" | "div" | "span";

/**
 * Title size roles, one place for the type scale used by cards and page sections.
 * "default" is the shadcn size and stays the default so existing cards do not change.
 *   default  text-2xl  big stand-alone cards (settings, auth)
 *   section  text-xl   a page section heading (PageSection h2)
 *   chart    text-lg   dashboard / report cards and charts
 *   compact  text-base dense or nested cards
 */
export type CardTitleSize = "default" | "section" | "chart" | "compact";
export const CARD_TITLE_SIZE_CLASS: Record<CardTitleSize, string> = {
  default: "text-2xl",
  section: "text-xl",
  chart: "text-lg",
  compact: "text-base",
};

/** The size role that goes with each heading level, so a level and its size never drift apart. */
export const HEADING_LEVEL_SIZE: Record<CardHeadingLevel, CardTitleSize> = {
  h1: "default",
  h2: "section",
  h3: "chart",
  h4: "compact",
  h5: "compact",
  h6: "compact",
};

// Which heading level and size CardTitle uses when it is not told explicitly.
interface CardTitleDefaults {
  level: CardTitleTag;
  size: CardTitleSize;
}
const CardTitleContext = React.createContext<CardTitleDefaults>({ level: "h3", size: "default" });

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Heading element used by every CardTitle inside this card (default "h3").
   * Set "h2" when the card sits directly under the page's h1 so the outline has no gap.
   */
  headingLevel?: CardTitleTag;
  /**
   * Size role for every CardTitle inside this card (default "default" = text-2xl, as before).
   * Use "chart" for dashboard-style cards instead of repeating `text-lg` on each title.
   */
  titleSize?: CardTitleSize;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, headingLevel = "h3", titleSize = "default", ...props }, ref) => {
    const defaults = React.useMemo(() => ({ level: headingLevel, size: titleSize }), [headingLevel, titleSize]);
    return (
      <CardTitleContext.Provider value={defaults}>
        <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
      </CardTitleContext.Provider>
    );
  },
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-[var(--card-pad)]", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Element to render. Defaults to the parent Card's `headingLevel` (h3 unless changed). */
  as?: CardTitleTag;
  /** Size role. Defaults to the parent Card's `titleSize`. A `text-*` class in className still wins. */
  size?: CardTitleSize;
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(({ className, as, size, ...props }, ref) => {
  const inherited = React.useContext(CardTitleContext);
  const Comp = (as ?? inherited.level) as React.ElementType;
  return (
    <Comp
      ref={ref}
      className={cn(CARD_TITLE_SIZE_CLASS[size ?? inherited.size], "font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
});
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-[var(--card-pad)] pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-[var(--card-pad)] pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
