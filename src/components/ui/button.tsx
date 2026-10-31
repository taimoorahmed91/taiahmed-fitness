import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared interaction rules for every button-like control:
 *  - focus-visible ring (keyboard only, never on mouse click)
 *  - hover styles only where a real hover exists (no sticky hover on touch)
 *  - pressed feedback via a tiny scale, switched off for reduced-motion users
 *  - pressed must beat hover: Tailwind emits the hover media block after plain `active:`, so with a mouse the
 *    hover colour would win while the button is held. The `hover:active:` twin (higher specificity) fixes that
 *    regardless of CSS order; the plain `active:` class stays for touch screens, where hover never applies.
 *  - hover/pressed colours are solid semantic tokens (e.g. bg-primary-hover), never an opacity
 *    modifier: opacity lets the page bleed through and pushes label contrast under 4.5:1
 *  - disabled / aria-disabled / aria-busy all block clicks (disabled states fade; busy keeps full contrast)
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background",
    "transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150",
    "motion-reduce:transition-none motion-reduce:active:transform-none",
    "motion-safe:active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-disabled:pointer-events-none aria-disabled:opacity-50",
    // Busy is shown by the spinner, not by fading: opacity would lower text contrast.
    "aria-busy:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [@media(hover:hover)]:hover:bg-primary-hover active:bg-primary-active [@media(hover:hover)]:hover:active:bg-primary-active",
        destructive:
          "bg-destructive text-destructive-foreground [@media(hover:hover)]:hover:bg-destructive-hover active:bg-destructive-active [@media(hover:hover)]:hover:active:bg-destructive-active",
        outline:
          "border border-input bg-background [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground active:bg-accent active:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground [@media(hover:hover)]:hover:bg-secondary-hover active:bg-secondary-active [@media(hover:hover)]:hover:active:bg-secondary-active",
        ghost:
          "[@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground active:bg-accent active:text-accent-foreground",
        link: "text-primary underline-offset-4 [@media(hover:hover)]:hover:underline motion-safe:active:scale-100",
      },
      size: {
        default: "h-10 px-4 py-2 [@media(pointer:coarse)]:min-h-11",
        sm: "h-9 rounded-md px-3 [@media(pointer:coarse)]:min-h-11",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
        // New, opt-in sizes that always meet the 44px touch target.
        touch: "h-11 min-w-11 px-4 py-2",
        "icon-touch": "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Shows a spinner, sets aria-busy and blocks clicks. The button stays
   * focusable (we use aria-disabled, not `disabled`) so keyboard focus is not lost mid-save.
   */
  loading?: boolean;
  /** Optional replacement label while loading (ignored for icon sizes and `asChild`). */
  loadingText?: React.ReactNode;
}

const ICON_SIZES = new Set(["icon", "icon-touch"]);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      onClick,
      children,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const ariaDisabled = props["aria-disabled"];
    const isBlocked = loading || ariaDisabled === true || ariaDisabled === "true";

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      // aria-disabled controls and loading buttons must not fire (click, Enter or Space).
      if (isBlocked) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onClick?.(event);
    };

    let content: React.ReactNode = children;
    if (loading && !asChild) {
      const spinner = <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />;
      content = ICON_SIZES.has(size ?? "") ? (
        spinner
      ) : (
        <>
          {spinner}
          {loadingText ?? children}
        </>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        // Native buttons default to type="submit" inside forms; keep that behavior unchanged.
        {...(asChild ? {} : { type })}
        disabled={disabled}
        {...props}
        aria-disabled={ariaDisabled}
        aria-busy={loading || undefined}
        onClick={handleClick}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
