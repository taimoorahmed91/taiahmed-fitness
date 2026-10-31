import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "size" | "asChild" | "loadingText"> {
  /** Required accessible name (becomes aria-label). Say what the button does: "Edit weight entry". */
  label: string;
  /**
   * Show a tooltip on hover/focus. `true` reuses `label`; pass a node to show something different.
   * Needs a surrounding TooltipProvider (App.tsx already has one). Off by default.
   */
  tooltip?: boolean | React.ReactNode;
  /** Visual size on mouse/keyboard. Touch (coarse pointer) is always at least 44x44. */
  size?: "sm" | "md";
}

const SIZE_CLASS: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
};

/** Icon-only button. Always labelled, always at least 44x44 on touch screens. Defaults to type="button" so it never submits a form by accident. */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, tooltip = false, size = "md", variant = "ghost", type = "button", className, children, ...props }, ref) => {
    const button = (
      <Button
        ref={ref}
        variant={variant}
        size="icon"
        aria-label={label}
        type={type}
        className={cn(
          SIZE_CLASS[size],
          "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:min-w-11",
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    );

    if (!tooltip) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip === true ? label : tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton };
