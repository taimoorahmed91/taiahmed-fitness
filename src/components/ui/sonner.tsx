import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // A close button lets people dismiss a message they have not finished reading.
      closeButton
      // On phones the fixed bottom navigation is 4rem tall; keep toasts (and their Undo) above it.
      mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      toastOptions={{
        classNames: {
          // Sonner already switches its own animation off for prefers-reduced-motion; the extra
          // classes cover the colour/transform transitions added here.
          toast:
            "group toast motion-reduce:transition-none group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          // 44px on touch screens so Undo / Cancel are easy to hit. Hover/press colours are solid tokens.
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:[@media(hover:hover)]:hover:bg-primary-hover group-[.toast]:active:bg-primary-active group-[.toast]:motion-reduce:transition-none group-[.toast]:[@media(pointer:coarse)]:min-h-11 group-[.toast]:[@media(pointer:coarse)]:min-w-11 group-[.toast]:[@media(pointer:coarse)]:px-4",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:[@media(hover:hover)]:hover:bg-accent group-[.toast]:[@media(hover:hover)]:hover:text-accent-foreground group-[.toast]:motion-reduce:transition-none group-[.toast]:[@media(pointer:coarse)]:min-h-11 group-[.toast]:[@media(pointer:coarse)]:min-w-11 group-[.toast]:[@media(pointer:coarse)]:px-4",
          // The visible X grows to 28px on touch and an invisible 8px halo brings the hit area to 44px.
          closeButton:
            "group-[.toast]:border-border group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:motion-reduce:transition-none group-[.toast]:[@media(pointer:coarse)]:!h-7 group-[.toast]:[@media(pointer:coarse)]:!w-7 group-[.toast]:[@media(pointer:coarse)]:after:absolute group-[.toast]:[@media(pointer:coarse)]:after:-inset-2",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
