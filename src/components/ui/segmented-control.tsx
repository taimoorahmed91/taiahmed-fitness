import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string = string> {
  value: T;
  /** Visible content (text and/or icon). */
  label: React.ReactNode;
  /** Required when `label` is icon-only. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string>
  extends Omit<
    React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>,
    "value" | "defaultValue" | "onValueChange" | "children" | "aria-label"
  > {
  /** Names the group for screen readers, e.g. "Chart range". */
  ariaLabel: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  size?: "sm" | "md";
  /** Stretch to the container and share the width equally. */
  fullWidth?: boolean;
}

/**
 * Pick exactly one of a few options (7 days / 30 days, line / bar).
 * Built on a radio group, so arrow keys move + select and a selected option can't be "un-selected".
 */
function SegmentedControl<T extends string = string>({
  ariaLabel,
  options,
  value,
  onValueChange,
  size = "md",
  fullWidth = false,
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={ariaLabel}
      orientation="horizontal"
      value={value}
      onValueChange={(next) => next && onValueChange(next as T)}
      className={cn(
        "items-center gap-0.5 rounded-lg bg-muted p-1 text-muted-foreground",
        fullWidth ? "grid w-full auto-cols-fr grid-flow-col" : "inline-flex",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          aria-label={option.ariaLabel}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium ring-offset-background",
            "transition-[color,background-color,box-shadow] duration-150 motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
            "[@media(hover:hover)]:hover:text-foreground",
            "data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
            "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            size === "sm" ? "h-8 min-w-8 text-xs" : "h-9 min-w-9 text-sm",
            "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11",
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export { SegmentedControl };
