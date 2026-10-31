import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";

import { CloseButton } from "@/components/ui/close-button";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 motion-reduce:duration-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Every layout is bounded by the visible screen (dvh, so mobile browser bars never cut it off):
 * content taller than the screen scrolls inside the dialog instead of running off the page.
 * The dialog is always 12px (0.75rem) clear of the screen edge on each side on phones.
 * Padding comes from the shared `--overlay-pad` token (16px phone, 24px sm+); a caller's own
 * p-* class (e.g. `p-0`) still replaces it.
 *
 * `layout` options:
 *  - "default" / "scroll": centered card with phone gutters; its content scrolls when tall.
 *    ("scroll" is kept so existing callers keep working; it now matches "default".)
 *  - "mobile-full": full-screen on phones, centered card from `sm` up.
 */
const BOUNDED_CARD =
  "left-[50%] top-[50%] max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] overflow-y-auto overscroll-contain rounded-lg data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]";

const dialogContentVariants = cva(
  "fixed z-50 grid gap-4 border bg-background p-[var(--overlay-pad)] shadow-lg duration-200 motion-reduce:duration-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  {
    variants: {
      layout: {
        default: BOUNDED_CARD,
        scroll: BOUNDED_CARD,
        "mobile-full": [
          // phones: fill the screen, keep content clear of notch / home bar
          "inset-0 h-[100dvh] w-full max-w-none content-start overflow-y-auto overscroll-contain border-0 rounded-none",
          "max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:pt-[max(1.5rem,env(safe-area-inset-top))]",
          "max-sm:data-[state=closed]:slide-out-to-bottom-8 max-sm:data-[state=open]:slide-in-from-bottom-8",
          // sm and up: the normal centered card
          "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-1.5rem)] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border",
          "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
        ].join(" "),
      },
    },
    defaultVariants: {
      layout: "default",
    },
  },
);

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  /** Hide the built-in X (only if the dialog supplies its own clearly labelled close control). */
  hideClose?: boolean;
  /** Accessible name of the built-in X. Default "Close". */
  closeLabel?: string;
}

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, layout, hideClose = false, closeLabel = "Close", ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(dialogContentVariants({ layout }), className)} {...props}>
        {children}
        {!hideClose && (
          <DialogPrimitive.Close asChild>
            <CloseButton label={closeLabel} className="absolute right-2 top-2" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("pr-8 text-lg font-semibold leading-none tracking-tight [@media(pointer:coarse)]:pr-12", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  // Class helper, exported so tests can check the shared defaults.
  // eslint-disable-next-line react-refresh/only-export-components
  dialogContentVariants,
};
