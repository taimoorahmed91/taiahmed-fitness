import { useRef, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { describePickDifference, formatPickDate, formatPickValue, otherSlot, slotLabel, type ComparePick, type CompareSlot } from '@/lib/chartComparePicks';
import { describePointPick, describeSeriesDelta, describeTiming, pointInlineValue, pointName, pointValueParts } from '@/lib/chartPointCompare';
import type { ChartComparePicks, PointCompareState } from '@/components/charts/useChartComparePicks';

/**
 * The visible parts of "pick A and B, then compare" (state: useChartComparePicks, marks on the plot: compareGuides in
 * ChartSelectionMarks, marks in the Table: ChartDataTable). Two modes share every piece:
 *   record  two exact Weight / manual Sleep records (the Weight and Sleep pages), B - A of one value, then Open in Compare.
 *   point   two points of any chart (every Dashboard graph), B - A per series in a small table, right here in the viewer. Dates say how
 *           many days apart; categories never mention dates. Open in Compare appears only when both points are exact records.
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

/** A pick's name, as a real <time> for a date and plain text for a category (a category has no date). */
const PointName = ({ pick }: { pick: ComparePick }) => (pick.isoDate ? <time dateTime={pick.isoDate}>{shortDate(pick.isoDate)}</time> : <span>{pointName(pick)}</span>);

const PickLine = ({ slot, pick, compare }: { slot: CompareSlot; pick: ComparePick | null; compare: ChartComparePicks }) => {
  // One series: its value after the name ("Oct 30, 2026 · 80.9 kg"). Several series: the name only, the table below has every value.
  const inline = pick && compare.point ? pointInlineValue(pick, compare.point.series) : null;
  return (
    <li data-compare-pick={slot} className="flex min-w-0 items-center gap-2 text-sm">
      <CompareBadge slot={slot} />
      <span className="min-w-0">
        {/* The badge is the visible letter; screen readers get the same word as text. */}
        <span className="sr-only">{slotLabel(slot)}: </span>
        {pick ? (
          compare.point ? (
            <>
              <PointName pick={pick} />
              {inline && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-semibold tabular-nums">{inline}</span>
                </>
              )}
            </>
          ) : (
            <>
              <time dateTime={pick.isoDate}>{shortDate(pick.isoDate)}</time>
              <span className="text-muted-foreground"> · </span>
              <span className="font-semibold tabular-nums">{formatPickValue(pick.value, compare.unit, compare.digits)}</span>
            </>
          )
        ) : (
          <span className="text-muted-foreground">not set</span>
        )}
      </span>
    </li>
  );
};

const Picks = ({ compare }: { compare: ChartComparePicks }) => (
  <ul aria-label="Compare picks" className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
    <PickLine slot="a" pick={compare.a} compare={compare} />
    <PickLine slot="b" pick={compare.b} compare={compare} />
  </ul>
);

const cellValue = (row: { unit: string; digits: number }, value: number | null) => (value === null ? null : formatPickValue(value, row.unit, row.digits));

/**
 * Point mode: B - A per series. One series reads as a sentence ("B − A: +0.4 kg (higher)"); several become a small real table
 * (series, A, B, B − A). The words higher / lower / no change always accompany the sign. A series only one pick observed shows
 * "No value" for the other and no difference, never a zero. Dates add how far apart they are; categories add nothing about time.
 */
const PointDifference = ({ point }: { point: PointCompareState }) => {
  const { comparison } = point;
  if (!comparison) return null;
  const timing = point.kind === 'date' ? describeTiming(comparison.days) : null;
  const rows = comparison.series;
  const single = rows.length === 1 && point.series.length === 1;
  return (
    <div data-compare-difference="" className="space-y-1.5 text-sm leading-snug">
      {rows.length === 0 && <p className="text-muted-foreground">These two have no value in common to compare.</p>}
      {single && (
        <p>
          <span className="font-semibold tabular-nums">B {'\u2212'} A: {describeSeriesDelta(rows[0]) ?? 'no difference'}</span>
        </p>
      )}
      {rows.length > 0 && !single && (
        <div className="max-w-full overflow-x-auto">
          <table data-compare-table="" className="w-full border-collapse text-xs sm:text-sm">
            <caption className="sr-only">B minus A for each series. Positive means B is higher, negative means B is lower.</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-medium"><span className="sr-only">Series</span></th>
                <th scope="col" className="px-2 py-1 text-right font-medium"><span aria-hidden="true">A</span><span className="sr-only">A value</span></th>
                <th scope="col" className="px-2 py-1 text-right font-medium"><span aria-hidden="true">B</span><span className="sr-only">B value</span></th>
                <th scope="col" className="py-1 pl-2 text-right font-medium">B {'\u2212'} A</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delta = describeSeriesDelta(row);
                const dash = (side: 'A' | 'B') => <><span aria-hidden="true" className="text-muted-foreground">{'\u2014'}</span><span className="sr-only">No {side} value</span></>;
                return (
                  <tr key={row.key} data-compare-delta={row.key} className="border-t align-top">
                    <th scope="row" className="py-1.5 pr-2 text-left font-medium">{row.label}</th>
                    <td className="px-2 py-1.5 text-right tabular-nums">{cellValue(row, row.a) ?? dash('A')}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{cellValue(row, row.b) ?? dash('B')}</td>
                    <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">
                      {delta ?? <span className="font-normal text-muted-foreground">No difference: no value on {row.missing === 'a' ? 'A' : 'B'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {timing && <p data-compare-timing="" className="text-muted-foreground">{timing}</p>}
    </div>
  );
};

/** "B − A: +0.4 kg (higher) · B is 12 days after A · +0.23 kg per week". Neutral words; no judgement. */
const Difference = ({ compare }: { compare: ChartComparePicks }) => {
  if (compare.point) return <PointDifference point={compare.point} />;
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
    <>
      <div className="flex flex-wrap items-center gap-2">
        <OpenInCompare compare={compare} />
        {both && <Button type="button" variant="outline" size="sm" data-compare-swap="" onClick={compare.swap}>Swap A and B</Button>}
        {(compare.a || compare.b) && <Button type="button" variant="ghost" size="sm" data-compare-clear="" onClick={() => { compare.clear(); keepFocus(); }}>Clear A and B</Button>}
      </div>
      {/* Only a chart of exact records can open Compare. Say why a pair that can not is staying here (never a silent missing button). */}
      {compare.point?.linkNote && <p data-compare-link-note="" className="text-xs text-muted-foreground">{compare.point.linkNote}</p>}
    </>
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

/**
 * Point mode, charts that cannot select a day (a time-of-day pie, the Body Recomposition lines): two native pickers, one per slot.
 * Native <select> is the reliable choice on a phone and with a keyboard or screen reader. The point the other slot holds is disabled,
 * so the same point can not be both A and B.
 */
const Pickers = ({ compare, point }: { compare: ChartComparePicks; point: PointCompareState }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {(['a', 'b'] as const).map((slot) => {
      const other = compare[otherSlot(slot)];
      return (
        <label key={slot} className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <CompareBadge slot={slot} />
            <span>{slotLabel(slot)}<span className="sr-only">: choose a {point.noun}</span></span>
          </span>
          <select
            data-compare-select={slot}
            value={compare[slot]?.recordId ?? ''}
            onChange={(event) => point.setSlotTo(slot, event.target.value)}
            className="field-glass h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
          >
            <option value="">Choose a {point.noun}</option>
            {point.options.map((option) => {
              const inline = pointInlineValue(option, point.series);
              const taken = other?.recordId === option.recordId;
              return (
                <option key={option.recordId} value={option.recordId} disabled={taken}>
                  {pointName(option)}{inline ? ` · ${inline}` : ''}{taken ? ` (already ${slotLabel(otherSlot(slot))})` : ''}
                </option>
              );
            })}
          </select>
        </label>
      );
    })}
  </div>
);

/** The selected point's values after its name: one series inline ("· 81.5 kg"), several as a wrapping list of "Label value". */
const PointValues = ({ pick, point }: { pick: ComparePick; point: PointCompareState }) => {
  const inline = pointInlineValue(pick, point.series);
  if (inline !== null) {
    return (
      <>
        <span className="text-muted-foreground"> · </span>
        <span className="font-semibold tabular-nums">{inline}</span>
      </>
    );
  }
  const parts = pointValueParts(pick, point.series);
  return parts.length === 0 ? null : (
    <>
      {parts.map((part) => (
        <span key={part}>
          <span className="text-muted-foreground"> · </span>
          <span className="whitespace-nowrap tabular-nums">{part}</span>
        </span>
      ))}
    </>
  );
};

/** What the selected point is called in "Selected …": an exact record's own noun for a one-series chart ("weight entry"), else the point noun ("day"). */
const candidateNoun = (compare: ChartComparePicks, pick: ComparePick): string =>
  compare.point ? (compare.point.series.length === 1 && pick.exact && compare.point.exactNoun ? compare.point.exactNoun : compare.point.noun) : compare.noun;

/** The viewer's compare controls. Sits under the selected-day bar (or right under the chart), above the Table / day panel. */
export const ChartCompareViewerPanel = ({ compare }: { compare: ChartComparePicks }) => {
  const [rootRef, keepFocus] = useKeepFocus();
  if (!compare.enabled) return null;
  const { candidate, a, b, point } = compare;
  // A chart that can not select a day has no other way to start, so its pickers are always shown.
  const pickersOnly = !!point && !point.hasSelection && (point.options.length > 1 || !!a || !!b);
  const sectionOpen = !!candidate || !!a || !!b || pickersOnly;
  // A message alone (a range dropped the picks) keeps the live region and the visible note, without an empty section around them.
  const open = sectionOpen || !!compare.notice;
  return (
    // Closed and silent: sr-only keeps the live region mounted but takes no room (and adds no flex gap in the viewer).
    <div ref={rootRef} tabIndex={-1} data-chart-compare-root="" data-html2canvas-ignore="true" className={cn('focus:outline-none', open ? 'shrink-0' : 'sr-only')}>
      {sectionOpen && (
        <section aria-label="Compare two entries" data-chart-compare="" className="space-y-2 rounded-md border bg-muted/40 px-3 py-2">
          <h3 className="text-sm font-semibold">{point ? `Compare two ${point.nounPlural}` : 'Compare two entries'}</h3>
          {pickersOnly && <Pickers compare={compare} point={point} />}
          {candidate?.ok && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <p data-chart-compare-candidate="" className="min-w-0 basis-full text-sm sm:basis-auto">
                <span className="text-muted-foreground">Selected {candidateNoun(compare, candidate.pick)}: </span>
                {point ? (
                  <>
                    <span className="font-semibold"><PointName pick={candidate.pick} /></span>
                    <PointValues pick={candidate.pick} point={point} />
                  </>
                ) : (
                  <>
                    <time dateTime={candidate.pick.isoDate} className="font-semibold">{shortDate(candidate.pick.isoDate)}</time>
                    <span className="text-muted-foreground"> · </span>
                    <span className="font-semibold tabular-nums">{formatPickValue(candidate.pick.value, compare.unit, compare.digits)}</span>
                  </>
                )}
              </p>
              <div role="group" aria-label="Use the selected entry in Compare" className="flex flex-wrap gap-2">
                {(['a', 'b'] as const).map((slot) => (
                  <SetButton
                    key={slot}
                    slot={slot}
                    compare={compare}
                    description={point
                      ? `${candidateNoun(compare, candidate.pick)}${point.kind === 'date' ? ' on' : ''} ${describePointPick(candidate.pick, point.series)}`
                      : `${compare.noun} on ${shortDate(candidate.pick.isoDate)}, ${formatPickValue(candidate.pick.value, compare.unit, compare.digits)}`}
                  />
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
              {!(a && b) && (
                <p className="text-xs text-muted-foreground">
                  {point ? (point.hasSelection ? `Select another ${point.noun} and set it as ${a ? 'B' : 'A'} to compare.` : `Choose a ${point.noun} for ${a ? 'B' : 'A'} to compare.`) : `Select another entry and set it as ${a ? 'B' : 'A'} to compare.`}
                </p>
              )}
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
