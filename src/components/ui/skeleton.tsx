import { cn } from "@/lib/utils";

/** Loading placeholder. The pulse only runs for people who have not asked for reduced motion. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} {...props} />;
}

export { Skeleton };
