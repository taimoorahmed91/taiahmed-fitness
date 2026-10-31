import * as React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterDisclosureProps {
  /** How many filters inside the panel are on. Shown on the phone toggle button. */
  activeCount: number;
  /** Always visible next to the toggle (usually the search box). */
  leading?: React.ReactNode;
  /** Button text. Default "Filters". */
  label?: string;
  /** Start expanded on phones. */
  defaultOpen?: boolean;
  className?: string;
  /** The filter controls. Rendered once, so their state is never duplicated. */
  children: React.ReactNode;
}

/**
 * Phones: the filters hide behind one "Filters (2)" button, so the list stays on screen.
 * From `sm` up the panel is always open and the button disappears.
 */
function FilterDisclosure({
  activeCount,
  leading,
  label = "Filters",
  defaultOpen = false,
  className,
  children,
}: FilterDisclosureProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = React.useId();

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        {leading && <div className="min-w-0 flex-1">{leading}</div>}
        <Button
          type="button"
          variant="outline"
          className="shrink-0 sm:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" />
          <span>{label}</span>
          {activeCount > 0 && (
            <span
              className="min-w-5 rounded-full bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground"
              aria-label={`${activeCount} active`}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")}
          />
        </Button>
      </div>
      <div id={panelId} className={cn("space-y-3", open ? "block" : "hidden", "sm:block")}>
        {children}
      </div>
    </div>
  );
}

export { FilterDisclosure };
