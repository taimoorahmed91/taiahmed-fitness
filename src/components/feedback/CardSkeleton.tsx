import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CardSkeletonProps {
  /** Height of the body area. Match the real card so the page does not jump when data arrives. */
  bodyClassName?: string;
  /** Hide the title bar placeholder (for small stat tiles). */
  noHeader?: boolean;
  className?: string;
}

/**
 * Fixed-height placeholder card. Purely visual: it is hidden from screen readers,
 * because the page announces loading once (see LoadingAnnouncement)
 * instead of every card saying "loading".
 */
export const CardSkeleton = ({ bodyClassName = 'h-[250px]', noHeader = false, className }: CardSkeletonProps) => (
  <Card className={cn('shadow-md', className)} aria-hidden="true">
    {!noHeader && (
      <CardHeader>
        <Skeleton className="h-5 w-40 max-w-full" />
      </CardHeader>
    )}
    <CardContent className={noHeader ? 'pt-6' : undefined}>
      <Skeleton className={cn('w-full', bodyClassName)} />
    </CardContent>
  </Card>
);
