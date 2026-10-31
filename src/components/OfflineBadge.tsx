import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

const OFFLINE_DETAIL = 'You are offline. Workouts keep saving on this device until the connection returns.';

/**
 * Shows only while offline; workouts keep saving on this device until the connection returns.
 *
 * The visible badge keeps its word ("Offline") at every width, because an icon alone is
 * easy to miss and hard to understand on a phone. It is short and never wraps, so it still
 * fits next to the other header controls at 320px. A separate, always-present status
 * region announces changes to screen readers (a status region that is created at the same
 * moment as its text is often not announced).
 */
export const OfflineBadge = ({ message = 'Offline', className }: { message?: string; className?: string }) => {
  const online = useNetworkStatus();
  const [announcement, setAnnouncement] = useState('');
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setAnnouncement(OFFLINE_DETAIL);
      return;
    }
    if (!wasOffline.current) return;
    setAnnouncement('You are back online.');
    const timer = window.setTimeout(() => setAnnouncement(''), 5000);
    return () => window.clearTimeout(timer);
  }, [online]);

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {!online && (
        <span
          title={OFFLINE_DETAIL}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[hsl(var(--chart-max))] px-2 py-1 text-xs font-medium text-[hsl(var(--chart-max))] sm:gap-1.5 sm:px-2.5',
            className,
          )}
        >
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          {message}
        </span>
      )}
    </>
  );
};
