import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallClock } from '@/hooks/useWallClock';
import { deriveFreshness } from '@/lib/refreshState';
import { cn } from '@/lib/utils';

interface DataFreshnessProps {
  /** Time of the last SUCCESSFUL meals query. Not the mount time. */
  fetchedAt: Date | null;
  /** First load still running. */
  loading: boolean;
  refreshing: boolean;
  lastStartedAt: number | null;
  lastFinishedAt: number | null;
  /** Auto-refresh interval; data older than this plus a 5 minute grace counts as stale. */
  intervalMs: number;
  onRetry: () => void;
  className?: string;
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/**
 * "Updated 14:32:05" with a calm refreshing state and a stale state that offers Retry.
 *
 * Screen readers: the visible time is NOT live (it would be read out on every
 * refresh). Only a short state sentence is, and it is empty while all is well.
 * The clock that notices "gone stale with nobody looking" lives here, so a tick
 * re-renders only this small component.
 */
export const DataFreshness = ({
  fetchedAt,
  loading,
  refreshing,
  lastStartedAt,
  lastFinishedAt,
  intervalMs,
  onRetry,
  className,
}: DataFreshnessProps) => {
  const now = useWallClock(true, 30_000);
  const status = deriveFreshness({
    fetchedAt: fetchedAt ? fetchedAt.getTime() : null,
    loading,
    refreshing,
    lastStartedAt,
    lastFinishedAt,
    now,
    staleAfterMs: intervalMs + 5 * 60 * 1000,
  });

  const announcement =
    status === 'refreshing' ? 'Refreshing data' : status === 'stale' || status === 'unavailable' ? 'Data may be out of date' : '';

  const time = fetchedAt ? (
    <time dateTime={fetchedAt.toISOString()} className="font-mono text-foreground">
      {formatTime(fetchedAt)}
    </time>
  ) : null;

  return (
    <div className={cn('flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground', className)}>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      <span title="Time of the last successful meals fetch.">
        {status === 'loading' ? (
          'Loading…'
        ) : status === 'unavailable' ? (
          'Not updated yet'
        ) : (
          <>
            {status === 'stale' ? 'Last updated ' : 'Updated '}
            {time}
          </>
        )}
      </span>
      {status === 'refreshing' && (
        <span className="inline-flex items-center gap-1.5" aria-hidden="true">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Refreshing…
        </span>
      )}
      {(status === 'stale' || status === 'unavailable') && (
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--chart-warn))]" aria-hidden="true" />
            Couldn't refresh
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </span>
      )}
    </div>
  );
};
