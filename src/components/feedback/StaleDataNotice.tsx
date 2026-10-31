import { useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StaleDataNoticeProps {
  /** What could not be refreshed: "your meals". */
  subject: string;
  /** Time of the last SUCCESSFUL fetch, when known. */
  fetchedAt?: Date | null;
  onRetry: () => void | Promise<void>;
  className?: string;
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * A slim, non-blocking notice for "a refresh failed, but the rows on screen are the last good ones".
 * It sits above the content (the content stays), and gives a way to retry.
 */
export const StaleDataNotice = ({ subject, fetchedAt, onRetry, className }: StaleDataNoticeProps) => {
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
    <div
      role="status"
      className={cn(
        'flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm',
        className,
      )}
    >
      <span className="flex items-center gap-2 text-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--chart-warn))]" aria-hidden="true" />
        <span>
          Couldn't refresh {subject}.{' '}
          <span className="text-muted-foreground">
            {fetchedAt ? `Showing what we loaded at ${formatTime(fetchedAt)}.` : 'Showing what we loaded earlier.'}
          </span>
        </span>
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => void retry()} disabled={retrying} aria-busy={retrying}>
        {retrying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Trying again…
          </>
        ) : (
          'Try again'
        )}
      </Button>
    </div>
  );
};
