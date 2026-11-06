import { CalendarOff, ChevronDown, Utensils } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Anchor as PopoverAnchor } from '@radix-ui/react-popover';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { STATUS_META } from '@/lib/targetStatus';
import { formatNumber } from '@/lib/chartTheme';
import { buildPreviousDaySnapshot, type PreviousDaySnapshotInput } from '@/lib/previousDaySnapshot';

const formatWhole = (v: number) => formatNumber(v, 0);

export type PreviousDaySnapshotProps = PreviousDaySnapshotInput;

/**
 * A compact look at the day before: its date, the calories logged, how that sits against that day's target range,
 * and the range itself. It lives in the Dashboard header, one panel about 4rem tall, not a card of its own.
 *
 * Honest by construction (see src/lib/previousDaySnapshot.ts): no meals means "No data" (never 0 cal), it never says a
 * day is finished or fully recorded, and the range is labelled as based on current target settings in the details.
 * The details open in a small popover: a real button (Enter, Space, Escape), no layout shift.
 */
export const PreviousDaySnapshot = (props: PreviousDaySnapshotProps) => {
  const snap = buildPreviousDaySnapshot(props);

  if (snap.kind === 'no-data') {
    return (
      <section aria-label={`Previous day, ${snap.dateLabel}`} data-previous-day="no-data" className="panel-surface min-w-0 rounded-lg border px-3 py-2.5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-inset ring-foreground/10 sm:flex">
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Yesterday &middot; {snap.dateLabel}</p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold text-muted-foreground">{snap.headline}</span>
              <span className="text-muted-foreground">{snap.detail}</span>
            </p>
          </div>
        </div>
      </section>
    );
  }

  const meta = STATUS_META[snap.status];
  return (
    <Popover>
      {/* The details open under the whole panel, not under the small button, so they never cover what the panel says. */}
      <PopoverAnchor asChild>
        <section aria-label={`Previous day, ${snap.dateLabel}`} data-previous-day={snap.status} className="panel-surface min-w-0 rounded-lg border px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-inset ring-foreground/10 sm:flex">
              <Utensils className="h-4 w-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              {/* The Details button shares the label row (pulled up so it adds no height). */}
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">Yesterday &middot; {snap.dateLabel}</p>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="group -my-2 -mr-1 inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none [@media(hover:hover)]:hover:text-foreground [@media(pointer:coarse)]:min-h-11"
                    aria-label="Details for yesterday"
                  >
                    Details
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
              </div>
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="whitespace-nowrap">
                  <span className={cn('text-xl font-semibold tabular-nums leading-tight', meta.text)}>
                    <AnimatedNumber value={snap.calories} format={formatWhole} />
                  </span>{' '}
                  <span className="text-xs text-muted-foreground">{snap.unit}</span>
                </span>
                <span className={cn('flex items-center gap-1 text-sm font-medium', meta.text)}>
                  <span aria-hidden="true">{snap.glyph}</span>
                  <span>{snap.statusText}</span>
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{snap.targetLine}</p>
            </div>
          </div>
        </section>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-3 p-4 text-sm">
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Day</dt><dd className="text-right font-medium">{snap.dateLabel}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Calories logged</dt><dd className="font-medium tabular-nums">{snap.caloriesText} {snap.unit}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Meals</dt><dd className="font-medium">{snap.mealsText}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Target</dt><dd className="font-medium tabular-nums">{snap.rangeText} {snap.unit}</dd></div>
          {snap.dayTypeLabel && (
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Day type</dt><dd className="font-medium">{snap.dayTypeLabel}</dd></div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Result</dt>
            <dd className={cn('flex items-center gap-1 text-right font-medium', meta.text)}><span aria-hidden="true">{snap.glyph}</span>{snap.statusText}</dd>
          </div>
        </dl>
        {snap.extraNote && <p className="text-xs text-muted-foreground">{snap.extraNote}</p>}
        <p className="border-t border-foreground/10 pt-2 text-xs text-muted-foreground">{snap.basisNote}</p>
      </PopoverContent>
    </Popover>
  );
};
