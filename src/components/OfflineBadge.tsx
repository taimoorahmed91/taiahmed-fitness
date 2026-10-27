import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

/** Shows only while offline; workouts keep saving on this device until the connection returns. */
export const OfflineBadge = ({ message = 'Offline', className }: { message?: string; className?: string }) => {
  const online = useNetworkStatus();
  if (online) return null;
  return (
    <span role="status" className={cn('inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--chart-max))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--chart-max))]', className)}>
      <WifiOff className="h-3.5 w-3.5" />
      {message}
    </span>
  );
};
