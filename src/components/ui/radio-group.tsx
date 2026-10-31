import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Same idea as the checkbox: a 44x44 box on touch screens, 16px glyph drawn by ::before, 16px layout footprint. */
const COARSE_BOX_CLASS = [
  "[@media(pointer:coarse)]:m-[-14px] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
  "[@media(pointer:coarse)]:border-transparent",
  "[@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-3.5 [@media(pointer:coarse)]:before:rounded-full [@media(pointer:coarse)]:before:border [@media(pointer:coarse)]:before:border-primary [@media(pointer:coarse)]:before:content-['']",
  "[@media(pointer:coarse)]:focus-visible:ring-0 [@media(pointer:coarse)]:focus-visible:before:ring-2 [@media(pointer:coarse)]:focus-visible:before:ring-ring [@media(pointer:coarse)]:focus-visible:before:ring-offset-2 [@media(pointer:coarse)]:focus-visible:before:ring-offset-background",
].join(" ");

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} ref={ref} />;
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "relative aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        COARSE_BOX_CLASS,
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="relative flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
