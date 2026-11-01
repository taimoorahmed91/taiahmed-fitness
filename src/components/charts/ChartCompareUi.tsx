import { useRef, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { describePickDifference, formatPickDate, formatPickValue, slotLabel, type ComparePick, type CompareSlot } from '@/lib/chartComparePicks';
import type { ChartComparePicks } from '@/components/charts/useChartComparePicks';

/**
 * The visible parts of "pick A and B, then open Compare" (state: useChartComparePicks, marks on the plot: compareGuides in
 * ChartSelectionMarks, marks in the Table: ChartDataTable).
 *
 *  - ChartCompareViewerPanel  the full-screen viewer (the PRIMARY place): Set as A / Set as B for the selected point, the two
 *                             picks, the B - A readout, Swap, Clear and Open in Compare.
 *  - ChartCompareCardStrip    the card: NOTHING until at least one pick exists (or something was just announced), then a small
 *                             read-only summary with Open in Compare and Clear. The card never offers Set as A / B: points are
 *                             small on a phone chart, and the viewer already has the roomy, tested controls. The strip exists so a
 *                             pick made in the viewer never turns into invisible state once the viewer is closed.
 *
 * Every piece renders nothing for a chart that did not opt in (dataset.selection.compare), so other charts look as before.
 * A and B are told apart by their LETTER and by shape (A solid, B outlined), never by colour alone.
 */

const shortDate = formatPickDate;

/** The A / B letter badge. Decorative: the words "A" and "B" are always also in the text next to it. */
export const CompareBadge = ({ slot, className }: { slot: CompareSlot; className?: string }) => (
  <span
    aria-hidden="true"
    data-compare-badge={slot}
    className={cn(
      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-foreground text-[0.7rem] font-bold leading-none',
      slot === 'a' ? 'bg-foreground text-background' : 'bg-background text-foreground',
      className,
    )}
  >
    {slotLabel(slot)}
  </span>
);

const PickLine = ({ slot, pick, compare }: { slot: CompareSlot; pick: ComparePick | null; compare: ChartComparePicks }) => (
  <li data-compare-pick={slot} className="flex min-w-0 items-center gap-2 text-sm">
    <CompareBadge slot={slot} />
    <span className="min-w-0">
      {/* The badge is the visible letter; screen readers get the same word as text. */}
      <span className="sr-only">{slotLabel(slot)}: </span>
      {pick ? (
        <>
          <time dateTime={pick.isoDate}>{shortDate(pick.isoDate)}</time>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold tabular-nums">{formatPickValue(pick.value, compare.unit, compare.digits)}</span>
        </>
      ) : (
        <span className="text-muted-foreground">not set</span>
      )}
    </span>
  </li>
);

const Picks = ({ compare }: { compare: ChartComparePicks }) => (
  <ul aria-label="Compare picks" className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
    <PickLine slot="a" pick={compare.a} compare={compare} />
    <PickLine slot="b" pick={compare.b} compare={compare} />
  </ul>
);

/** "B − A: +0.4 kg (higher) · B is 12 days after A · +0.23 kg per week". Neutral words; no judgement. */
const Difference = ({ compare }: { compare: ChartComparePicks }) => {
  if (!compare.difference) return null;
  const { headline, timing, rate } = describePickDifference(compare.difference, compare.unit, compare.digits);
  return (
    <p data-compare-difference="" className="text-sm leading-snug">
      <span className="font-semibold tabular-nums">{headline}</span>
      <span className="text-muted-foreground"> · {timing}{rate ? ` · ${rate}` : ''}</span>
    </p>
  );
};

/**
 * Buttons that remove themselves (Clear, Dismiss) would drop keyboard focus onto the page behind. The root of each piece is a
 * programmatic focus target (tabIndex -1, never in the tab order) that stays mounted, so focus stays put and nearby.
 */
const useKeepFocus = (): [RefObject<HTMLDivElement>, () => void] => {
  const ref = useRef<HTMLDivElement>(null);
  return [ref, () => ref.current?.focus({ preventScroll: true })];
};

/** Visible AND announced: a polite live region that is always mounted (empty first), so each new message is spoken. */
const Notice = ({ compare, className, keepFocus }: { compare: ChartComparePicks; className?: string; keepFocus: () => void }) => (
  <div className={cn('flex items-start gap-1', compare.notice && 'rounded-md border border-dashed bg-muted/40 py-1 pl-3 pr-1', compare.notice && className)} data-compare-notice-row="">
    <p role="status" aria-live="polite" data-compare-status="" className="min-w-0 flex-1 text-sm empty:hidden">{compare.notice}</p>
    {compare.notice && (
      <IconButton label="Dismiss compare message" size="sm" onClick={() => { compare.dismissNotice(); keepFocus(); }} data-compare-dismiss="">
        <X aria-hidden="true" />
      </IconButton>
    )}
  </div>
);

const OpenInCompare = ({ compare }: { compare: ChartComparePicks }) =>
  compare.href ? (
    <Button asChild size="sm" className="shrink-0">
      <Link to={compare.href} data-chart-open-compare="" aria-label="Open in Compare: B minus A, in the order you set">
        <ArrowRightLeft aria-hidden="true" />
        Open in Compare
      </Link>
    </Button>
  ) : null;

const Actions = ({ compare, keepFocus }: { compare: ChartComparePicks; keepFocus: () => void }) => {
  const both = !!compare.a && !!compare.b;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <OpenInCompare compare={compare} />
      {both && <Button type="button" variant="outline" size="sm" data-compare-swap="" onClick={compare.swap}>Swap A and B</Button>}
      {(compare.a || compare.b) && <Button type="button" variant="ghost" size="sm" data-compare-clear="" onClick={() => { compare.clear(); keepFocus(); }}>Clear A and B</Button>}
    </div>
  );
};

const SetButton = ({ slot, compare, description }: { slot: CompareSlot; compare: ChartComparePicks; description: string }) => {
  const pressed = compare.slotOfSelected === slot;
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? 'default' : 'outline'}
      aria-pressed={pressed}
      // The visible words "Set as A" come first in the accessible name.
      aria-label={`Set as ${slotLabel(slot)}: ${description}`}
      data-compare-set={slot}
      className="min-w-[7.5rem] flex-1 sm:flex-none"
      onClick={() => compare.setSlot(slot)}
    >
      {pressed && <Check aria-hidden="true" />}
      Set as {slotLabel(slot)}
    </Button>
  );
};

/** The viewer's compare controls. Sits under the selected-day bar, above the Table / day panel. */
export const ChartCompareViewerPanel = ({ compare }: { compare: ChartComparePicks }) => {
  const [rootRef, keepFocus] = useKeepFocus();
  if (!compare.enabled) return null;
  const { candidate, a, b } = compare;
  const open = !!candidate || !!a || !!b || !!compare.notice;
  return (
    // Closed and silent: sr-only keeps the live region mounted but takes no room (and adds no flex gap in the viewer).
    <div ref={rootRef} tabIndex={-1} data-chart-compare-root="" data-html2canvas-ignore="true" className={cn('focus:outline-none', open ? 'shrink-0' : 'sr-only')}>
      {open && (
        <section aria-label="Compare two entries" data-chart-compare="" className="space-y-2 rounded-md border bg-muted/40 px-3 py-2">
          <h3 className="text-sm font-semibold">Compare two entries</h3>
          {candidate?.ok && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <p data-chart-compare-candidate="" className="min-w-0 basis-full text-sm sm:basis-auto">
                <span className="text-muted-foreground">Selected {compare.noun}: </span>
                <time dateTime={candidate.pick.isoDate} className="font-semibold">{shortDate(candidate.pick.isoDate)}</time>
                <span className="text-muted-foreground"> · </span>
                <span className="font-semibold tabular-nums">{formatPickValue(candidate.pick.value, compare.unit, compare.digits)}</span>
              </p>
              <div role="group" aria-label="Use the selected entry in Compare" className="flex flex-wrap gap-2">
                {(['a', 'b'] as const).map((slot) => (
                  <SetButton key={slot} slot={slot} compare={compare} description={`${compare.noun} on ${shortDate(candidate.pick.isoDate)}, ${formatPickValue(candidate.pick.value, compare.unit, compare.digits)}`} />
                ))}
              </div>
            </div>
          )}
          {candidate && candidate.ok === false && (
            <p data-chart-compare-reason={candidate.reason} className="rounded-md border border-dashed px-3 py-2 text-sm">{candidate.text}</p>
          )}
          {(a || b) && (
            <>
              <Picks compare={compare} />
              <Difference compare={compare} />
              {!(a && b) && <p className="text-xs text-muted-foreground">Select another entry and set it as {a ? 'B' : 'A'} to compare.</p>}
              <Actions compare={compare} keepFocus={keepFocus} />
            </>
          )}
        </section>
      )}
      <Notice compare={compare} className="mt-2" keepFocus={keepFocus} />
    </div>
  );
};

/** The card's quiet summary: only while a pick exists (or a message is waiting). Read-only apart from Open / Clear. */
export const ChartCompareCardStrip = ({ compare }: { compare: ChartComparePicks }) => {
  const [rootRef, keepFocus] = useKeepFocus();
  if (!compare.enabled) return null;
  const { a, b } = compare;
  return (
    <div ref={rootRef} tabIndex={-1} data-chart-compare-strip-root="" data-html2canvas-ignore="true" className="focus:outline-none">
      {(a || b) && (
        <section aria-label="Compare picks" data-chart-compare-strip="" className="mt-2 space-y-1.5 rounded-md border bg-muted/40 px-3 py-2">
          <Picks compare={compare} />
          <Difference compare={compare} />
          {!(a && b) && <p className="text-xs text-muted-foreground">Open this chart in full screen to set {a ? 'B' : 'A'}.</p>}
          <Actions compare={compare} keepFocus={keepFocus} />
        </section>
      )}
      <Notice compare={compare} className="mt-2" keepFocus={keepFocus} />
    </div>
  );
};
