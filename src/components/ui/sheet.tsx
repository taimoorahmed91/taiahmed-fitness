import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { CloseButton } from "@/components/ui/close-button";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 motion-reduce:duration-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

/**
 * Every sheet is bounded by the visible screen (dvh, so mobile browser bars never cut it off)
 * and scrolls inside when its content is taller. Padding comes from the shared
 * `--overlay-pad` token (16px phone, 24px sm+) and always clears the notch / home bar.
 * A caller's own p-* class (e.g. `p-0`) still replaces it.
 */
const sheetVariants = cva(
  "fixed z-50 gap-4 overflow-y-auto overscroll-contain bg-background p-[var(--overlay-pad)] shadow-lg transition ease-in-out motion-reduce:!duration-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[100dvh] border-b pt-[max(var(--overlay-pad),env(safe-area-inset-top))] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[100dvh] border-t pb-[max(var(--overlay-pad),env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-[100dvh] w-3/4 border-r py-[max(var(--overlay-pad),env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-[100dvh] w-3/4 border-l py-[max(var(--overlay-pad),env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
      /**
       * - "default" / "dvh": same bounded behaviour (kept so existing callers keep working).
       * - "mobile-full": also full width on phones.
       */
      layout: {
        default: "",
        dvh: "",
        "mobile-full": "max-sm:w-full max-sm:max-w-none",
      },
    },
    compoundVariants: [
      {
        layout: "mobile-full",
        className:
          "max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:pt-[max(1.5rem,env(safe-area-inset-top))]",
      },
    ],
    defaultVariants: {
      side: "right",
      layout: "default",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Accessible name of the built-in X. Default "Close". */
  closeLabel?: string;
  /** Hide the built-in X (only if the sheet supplies its own clearly labelled close control). */
  hideClose?: boolean;
}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", layout, className, children, closeLabel = "Close", hideClose = false, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side, layout }), className)} {...props}>
        {children}
        {!hideClose && (
          <SheetPrimitive.Close asChild>
            <CloseButton label={closeLabel} className="absolute right-2 top-2" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("pr-8 text-lg font-semibold text-foreground [@media(pointer:coarse)]:pr-12", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
  // Class helper, exported so tests can check the shared defaults.
  // eslint-disable-next-line react-refresh/only-export-components
  sheetVariants,
};
