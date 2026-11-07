import * as React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CollapsePanel } from "@/components/ui/collapse-panel";
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
 * On phones the panel slides open and shut; its children stay mounted (one set of inputs, state never duplicated).
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
    <div className={className}>
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
            className={cn("transition-transform duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none", open && "rotate-180")}
          />
        </Button>
      </div>
      <CollapsePanel
        id={panelId}
        open={open}
        alwaysOpenFrom="sm"
        openClassName="mt-3"
        closedClassName="mt-0 sm:mt-3"
        innerClassName="space-y-3"
      >
        {children}
      </CollapsePanel>
    </div>
  );
}

export { FilterDisclosure };
