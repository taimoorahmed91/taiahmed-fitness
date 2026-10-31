import { useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { joinLabels } from './tableView';

interface PartialDataNoticeProps {
  /** Data that never loaded, in plain words: ["sleep", "weight"]. Sections that need it are paused. */
  failed: readonly string[];
  /** Data whose refresh failed but whose earlier rows are still shown. */
  stale: readonly string[];
  /** Reload what is missing or stale. May be async; the button shows progress until it settles. */
  onRetry: () => void | Promise<void>;
  className?: string;
}

/**
 * One concise, persistent notice for a screen built from several tables when only SOME failed.
 * Not a toast: it stays until the data arrives. Renders nothing when everything is fine.
 */
export const PartialDataNotice = ({ failed, stale, onRetry, className }: PartialDataNoticeProps) => {
  const [retrying, setRetrying] = useState(false);
  const busyRef = useRef(false);
  if (failed.length === 0 && stale.length === 0) return null;

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
      role={failed.length > 0 ? 'alert' : 'status'}
      className={cn(
        'flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm',
        className,
      )}
    >
      <span className="flex items-start gap-2 text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--chart-warn))]" aria-hidden="true" />
        <span className="space-y-0.5">
          {failed.length > 0 && (
            <span className="block">
              Couldn't load your {joinLabels(failed)}.{' '}
              <span className="text-muted-foreground">Sections that need it are paused until it loads.</span>
            </span>
          )}
          {stale.length > 0 && (
            <span className="block">
              Couldn't refresh your {joinLabels(stale)}.{' '}
              <span className="text-muted-foreground">Showing what we loaded earlier.</span>
            </span>
          )}
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
