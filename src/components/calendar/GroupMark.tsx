import { cn } from '@/lib/utils';
import type { Group } from './calendarModel';

/**
 * The little shape that stands for one area of the day. Each area has its own SHAPE as well as its own colour,
 * so a marker is readable without telling colours apart:
 *   meals = disc, workouts = square, body = diamond, recovery = triangle, notes = ring.
 * The shape is decoration; the words ("2 meals") always sit next to it or in the day's accessible name.
 */
const SHAPE: Record<Group, string> = {
  meals: 'rounded-full bg-primary',
  workouts: 'rounded-[2px] bg-chart-2',
  body: 'rotate-45 scale-90 rounded-[1px] bg-chart-3',
  recovery: 'bg-chart-5 [clip-path:polygon(50%_5%,100%_95%,0_95%)]',
  notes: 'rounded-full border-2 border-destructive bg-transparent',
};

export const GroupMark = ({ group, className }: { group: Group; className?: string }) => (
  <span aria-hidden="true" className={cn('inline-block h-2 w-2 shrink-0', SHAPE[group], className)} />
);
