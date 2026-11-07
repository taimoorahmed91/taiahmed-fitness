import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The pin icon of the quick-add toggle: outline when not pinned, filled and tilted when pinned (never colour alone). */
export const QuickAddPinIcon = ({ pinned, className }: { pinned: boolean; className?: string }) => (
  <Pin
    aria-hidden="true"
    className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', pinned ? 'fill-primary -rotate-45' : 'rotate-0', className)}
  />
);
