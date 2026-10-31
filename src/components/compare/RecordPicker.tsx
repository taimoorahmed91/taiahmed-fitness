import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeftRight, X } from 'lucide-react';
import { ROUTES } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconButton } from '@/components/ui/icon-button';
import { PageEmptyState, PageLoading } from '@/components/layout/Page';
import { formatDay } from '@/lib/historyDates';
import { cn } from '@/lib/utils';
import { CATEGORY_INFO, SLOTS, selectionStatus, slotOf, type Category, type ComparableEntry, type Slot } from './compareModel';

/** A and B keep the same two looks everywhere on the page. The letter, not the colour, says which is which. */
const SLOT_BADGE: Record<Slot, string> = {
  A: 'bg-primary text-primary-foreground',
  B: 'bg-chart-2 text-background',
};

export const SlotBadge = ({ slot, className }: { slot: Slot; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold', SLOT_BADGE[slot], className)}
  >
    {slot}
  </span>
);

const PAGE_SIZE = 40;

interface RecordPickerProps {
  category: Category;
  entries: ComparableEntry[];
  loading: boolean;
  selectedIds: string[];
  picked: ComparableEntry[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onSwap: () => void;
  onClear: () => void;
  /** Phone only: scroll to the comparison once two records are picked. */
  onJumpToResults: () => void;
}

const Tray = ({ picked, onRemove, onSwap, onClear, onJumpToResults }: Pick<RecordPickerProps, 'picked' | 'onRemove' | 'onSwap' | 'onClear' | 'onJumpToResults'>) => (
  <div className="space-y-2">
    <ol aria-label="Selected records" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {SLOTS.map((slot, i) => {
        const entry = picked[i];
        return (
          <li
            key={slot}
            className={cn(
              'flex min-h-12 min-w-0 items-center gap-2 rounded-lg border py-1.5 pl-2.5 pr-1',
              entry ? 'border-primary/60 bg-primary/5' : 'border-dashed bg-muted/40',
            )}
          >
            <SlotBadge slot={slot} className={cn(!entry && 'bg-muted text-muted-foreground')} />
            {entry ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{entry.primary}</span>
                  <span className="block truncate text-xs text-muted-foreground">{formatDay(entry.date)}</span>
                </span>
                <IconButton label={`Remove record ${slot}: ${entry.summary}`} size="sm" onClick={() => onRemove(entry.id)}>
                  <X />
                </IconButton>
              </>
            ) : (
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                <span className="sr-only">Record {slot}: </span>
                {i === 0 ? 'Pick the first record' : picked.length === 0 ? 'Then pick a second' : 'Pick one more'}
              </span>
            )}
          </li>
        );
      })}
    </ol>
    {picked.length > 0 && (
      <div className="flex flex-wrap items-center gap-2">
        {picked.length === 2 && (
          <Button type="button" variant="outline" size="sm" onClick={onSwap}>
            <ArrowLeftRight aria-hidden="true" /> Swap A and B
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear picks
        </Button>
        {picked.length === 2 && (
          <Button type="button" size="sm" className="ml-auto lg:hidden" onClick={onJumpToResults}>
            View comparison <ArrowDown aria-hidden="true" />
          </Button>
        )}
      </div>
    )}
  </div>
);

/**
 * Step 2. A tray showing the two picks (A and B) on top, then the records as one divided list:
 * date on the left where the eye scans, the headline value next to it, the A/B badge on the right.
 * Every row is still a real checkbox inside a label, so keyboard and screen reader behaviour is unchanged.
 */
export const RecordPicker = ({ category, entries, loading, selectedIds, picked, onToggle, onRemove, onSwap, onClear, onJumpToResults }: RecordPickerProps) => {
  const [shown, setShown] = useState(PAGE_SIZE);
  const info = CATEGORY_INFO[category];

  if (loading) return <PageLoading label="Loading records" rows={4} />;
  if (entries.length === 0) {
    return (
      <PageEmptyState
        title={`No ${info.noun.many} logged yet`}
        description="Log a few first, then come back to put two of them side by side."
        action={
          <Button asChild variant="outline">
            <Link to={ROUTES[info.routeKey]}>Go to {info.label}</Link>
          </Button>
        }
      />
    );
  }

  // Picked rows stay visible even when they sit beyond the first page.
  const visible = entries.filter((e, i) => i < shown || selectedIds.includes(e.id));
  const hidden = entries.length - visible.length;

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">
        {selectionStatus(picked)}
      </p>
      <Tray picked={picked} onRemove={onRemove} onSwap={onSwap} onClear={onClear} onJumpToResults={onJumpToResults} />
      {selectedIds.length === 2 && (
        <p className="text-xs text-muted-foreground">Ticking a third record replaces A; the newest pick is always B.</p>
      )}
      <ul role="list" className="max-h-[min(26rem,60dvh)] divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border">
        {visible.map((entry) => {
          const slot = slotOf(selectedIds, entry.id);
          return (
            <li key={entry.id} className={cn(slot && 'bg-primary/5')}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring [@media(hover:hover)]:hover:bg-muted/50">
                <Checkbox checked={slot !== null} onCheckedChange={() => onToggle(entry.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-muted-foreground">{formatDay(entry.date)}</span>
                  <span className="block break-words text-sm font-medium text-foreground">{entry.primary}</span>
                  {entry.secondary && <span className="block break-words text-xs text-muted-foreground">{entry.secondary}</span>}
                </span>
                {slot && (
                  <>
                    <SlotBadge slot={slot} />
                    <span className="sr-only">Selected as {slot}</span>
                  </>
                )}
              </label>
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="p-2">
            <Button type="button" variant="ghost" className="w-full" onClick={() => setShown((n) => n + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, hidden)} more ({hidden} not shown yet)
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
};
