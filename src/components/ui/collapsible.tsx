import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { cn } from "@/lib/utils";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

/**
 * Animated panel: height grows/shrinks via the collapsible-down/up keyframes.
 * The keyframes set `overflow: hidden` only while animating, so at rest nothing
 * is clipped (focus rings on inputs stay visible). Closed panels stay in the DOM
 * with the `hidden` attribute (Radix keeps the element so aria-controls resolves).
 *
 * Do NOT put padding / margin / space-y on this element: it makes the height
 * animation jump. Put spacing on an inner wrapper div instead.
 */
const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    className={cn(
      "data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none",
      className,
    )}
    {...props}
  />
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
