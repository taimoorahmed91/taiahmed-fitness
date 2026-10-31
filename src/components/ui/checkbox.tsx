import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * On touch screens the control itself is a 44x44 box (hit area and measured size), while the visible
 * 16px glyph is drawn by ::before and the negative margin keeps the layout footprint at 16px, so
 * inline "box + label" rows do not move. Mouse and keyboard keep the compact 16px control.
 */
const COARSE_BOX_CLASS = [
  "[@media(pointer:coarse)]:m-[-14px] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
  "[@media(pointer:coarse)]:rounded-none [@media(pointer:coarse)]:border-transparent [@media(pointer:coarse)]:bg-transparent [@media(pointer:coarse)]:data-[state=checked]:bg-transparent",
  "[@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-3.5 [@media(pointer:coarse)]:before:border [@media(pointer:coarse)]:before:border-primary [@media(pointer:coarse)]:before:content-['']",
  "[@media(pointer:coarse)]:focus-visible:ring-0 [@media(pointer:coarse)]:focus-visible:before:ring-2 [@media(pointer:coarse)]:focus-visible:before:ring-ring [@media(pointer:coarse)]:focus-visible:before:ring-offset-2 [@media(pointer:coarse)]:focus-visible:before:ring-offset-background",
].join(" ");

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      COARSE_BOX_CLASS,
      "[@media(pointer:coarse)]:before:rounded-sm [@media(pointer:coarse)]:data-[state=checked]:before:bg-primary",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("relative flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
