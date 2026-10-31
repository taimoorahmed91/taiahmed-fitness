import { useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DataLoadErrorProps {
  /** What failed, in plain words: "We couldn't load your meals". */
  title: string;
  /** What the user can expect. Say plainly that nothing was lost. */
  description?: string;
  /** Reload the data. May be async: the button shows progress until it settles. */
  onRetry: () => void | Promise<void>;
  /** Keep the same height as the content this replaces, so the page does not jump. */
  minHeightClassName?: string;
  className?: string;
}

/**
 * The state for "the first load failed, so there is nothing to show". It replaces the content
 * (never an empty list or a row of zeros, which would claim there is no data).
 * Fixed minimum height, an announced alert, and a Try again button that shows progress.
 */
export const DataLoadError = ({
  title,
  description = 'Your data is safe. Check your connection and try again.',
  onRetry,
  minHeightClassName = 'min-h-[20rem]',
  className,
}: DataLoadErrorProps) => {
  const [retrying, setRetrying] = useState(false);
  const busyRef = useRef(false);

  const retry = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      busyRef.current = false;
      setRetrying(false);
    }
  };

  return (
    <Card className={cn('shadow-md', className)}>
      <CardContent className={cn('flex flex-col items-center justify-center gap-3 p-6 text-center', minHeightClassName)}>
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--chart-warn))]" aria-hidden="true" />
        <div role="alert" className="space-y-1">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void retry()} disabled={retrying} aria-busy={retrying}>
          {retrying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Trying again…
            </>
          ) : (
            'Try again'
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
