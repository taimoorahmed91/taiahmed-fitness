import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A panel that slides open and closed (height animation) but, unlike Radix
 * Collapsible, keeps its children MOUNTED the whole time.
 *
 * Use it when the content must survive being closed (a chart that keeps its
 * selected point, one set of filter inputs shared with the wide layout) or
 * when the panel is only a disclosure on small screens (`alwaysOpenFrom`).
 * For ordinary disclosures prefer `ui/collapsible`.
 *
 * How it works: a one-cell grid whose row goes 0fr -> 1fr, so the height
 * animates to the content's real size without measuring anything in JS.
 * While closed the panel is `visibility: hidden` (after the slide finishes),
 * so nothing inside it can be tabbed to or read out.
 *
 * Trigger: keep your own button with aria-expanded and aria-controls pointing
 * at this panel's `id`.
 */
export type CollapsePanelBreakpoint = "sm" | "md";

// Written out in full so Tailwind can see every class.
const ALWAYS_OPEN: Record<CollapsePanelBreakpoint, { outer: string; inner: string }> = {
  sm: {
    outer: "sm:visible sm:grid-rows-[1fr]",
    inner: "sm:m-0 sm:overflow-visible sm:p-0",
  },
  md: {
    outer: "md:visible md:grid-rows-[1fr]",
    inner: "md:m-0 md:overflow-visible md:p-0",
  },
};

export interface CollapsePanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  open: boolean;
  /** From this breakpoint up the panel is always open: no hiding, no animation. */
  alwaysOpenFrom?: CollapsePanelBreakpoint;
  /** Classes for the outer element while open (typically a top margin; it animates with the panel). */
  openClassName?: string;
  /** Classes for the outer element while closed (the matching top margin, usually `mt-0`). */
  closedClassName?: string;
  /** Classes for the inner wrapper that holds the children (e.g. `space-y-3`). */
  innerClassName?: string;
  children: React.ReactNode;
}

const CollapsePanel = React.forwardRef<HTMLDivElement, CollapsePanelProps>(
  ({ open, alwaysOpenFrom, openClassName, closedClassName, innerClassName, className, children, ...props }, ref) => {
    const always = alwaysOpenFrom ? ALWAYS_OPEN[alwaysOpenFrom] : undefined;
    return (
      <div
        ref={ref}
        data-state={open ? "open" : "closed"}
        className={cn(
          "grid transition-[grid-template-rows,margin-top,visibility] duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
          open ? openClassName : closedClassName,
          always?.outer,
          className,
        )}
        {...props}
      >
        {/* -m-1 p-1: a 4px gutter inside the clip so focus rings on edge controls are not cut off, with no layout change. */}
        <div className={cn("-m-1 min-h-0 min-w-0 overflow-hidden p-1", always?.inner, innerClassName)}>{children}</div>
      </div>
    );
  },
);
CollapsePanel.displayName = "CollapsePanel";

export { CollapsePanel };
