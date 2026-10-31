import * as React from "react";

import { cn } from "@/lib/utils";

export interface ToggleChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  /** On/off state. Sets aria-pressed, so screen readers say "pressed" / "not pressed". */
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

/**
 * Pill-shaped independent on/off control (filters, tags, quick-add chips).
 * Real button: reachable by keyboard, announces its state, 32px on mouse and 44px on touch.
 * For "pick exactly one of a few" use SegmentedControl instead.
 */
const ToggleChip = React.forwardRef<HTMLButtonElement, ToggleChipProps>(
  ({ pressed, onPressedChange, onClick, className, type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onPressedChange?.(!pressed);
      }}
      className={cn(
        "inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium ring-offset-background",
        "transition-[color,background-color,border-color,transform] duration-150 motion-reduce:transition-none motion-safe:active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        "[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-4",
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
ToggleChip.displayName = "ToggleChip";

export { ToggleChip };
