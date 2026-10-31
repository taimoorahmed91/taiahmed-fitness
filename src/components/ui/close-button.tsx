import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface CloseButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name. Defaults to "Close". Use something specific when it helps, e.g. "Close workout editor". */
  label?: string;
}

/**
 * Small "X" control for dialogs, sheets and banners.
 * 36px on mouse, 44px on touch. Works on its own or as the child of a Radix `*.Close asChild`.
 */
const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  ({ label = "Close", className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground ring-offset-background",
        "transition-[color,background-color,opacity,transform] duration-150",
        "[@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground",
        "active:bg-accent active:text-accent-foreground motion-safe:active:scale-95 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
        className,
      )}
      {...props}
    >
      <X aria-hidden="true" className="h-4 w-4" />
    </button>
  ),
);
CloseButton.displayName = "CloseButton";

export { CloseButton };
