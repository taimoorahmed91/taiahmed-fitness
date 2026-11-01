import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { formatBriefDay, formatLongDay } from '@/components/calendar/calendarModel';
import { chartPointValues } from '@/lib/chartSelection';
import { buildCalendarHref, isValidIsoDate, type SelectedDay } from '@/lib/selectedDay';
import type { ChartDaySelection } from '@/components/charts/useChartDaySelection';

/**
 * The visible parts of chart day selection (state: useChartDaySelection, SVG marks: ChartSelectionMarks).
 *
 *  - ChartDayReadout       the card: a compact readout right under the plot (date, values, Open day). No modal.
 *  - ChartDaySelectionBar  the full-screen viewer: Previous / Next date buttons and the same readout.
 *  - ChartSelectedDayPanel the viewer's inline day panel (the Calendar's own panel: agenda, safe Add / Edit note, Open in
 *                          Calendar). It is a section of the viewer, not a nested dialog.
 *
 * Every piece renders nothing for a chart that is not selectable, so opted-out charts look exactly as before.
 */

const describe = (selection: ChartDaySelection) => {
  const selected = selection.selected;
  if (!selected) return { iso: null, values: [], live: selection.clearedNotice ?? '' };
  const values = chartPointValues(selection.dataset, selected.rowId);
  const iso = selected.day.isoDate;
  const live = `Selected ${formatLongDay(iso)}${values.length ? `: ${values.map((v) => `${v.label} ${v.text}`).join(', ')}` : ''}.`;
  return { iso, values, live };
};

/** Date on its own line, then the values as a wrapping row (a day with two series stays readable at 320px). */
const ReadoutText = ({ iso, values }: { iso: string; values: { key: string; label: string; text: string }[] }) => (
  <div className="min-w-[10rem] flex-1 text-sm leading-snug">
    <p><time dateTime={iso} className="font-semibold">{formatBriefDay(iso)}</time></p>
    {values.length > 0 && (
      <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {values.map((v) => (
          <li key={v.key} className="whitespace-nowrap">
            <span className="text-muted-foreground">{v.label} </span>
            <span className="font-semibold tabular-nums">{v.text}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const ClearButton = ({ selection }: { selection: ChartDaySelection }) => (
  <IconButton label="Clear selected day" size="sm" onClick={selection.clear} data-chart-day-clear="">
    <X aria-hidden="true" />
  </IconButton>
);

/** Screen reader announcement. Always mounted (an empty live region first, then text), so changes are spoken. */
const Live = ({ text }: { text: string }) => <p role="status" aria-live="polite" data-chart-day-live="" className="sr-only">{text}</p>;

/** Card readout. Goes under the plot: `<ChartFigure afterPlot={<ChartDayReadout selection={selection} />}>`. */
export const ChartDayReadout = ({ selection }: { selection: ChartDaySelection }) => {
  if (!selection.enabled) return null;
  const { iso, values, live } = describe(selection);
  return (
    <div data-chart-day-readout-root="" data-html2canvas-ignore="true">
      <Live text={live} />
      {iso && isValidIsoDate(iso) && (
        <div data-chart-day-readout={iso} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/40 py-1.5 pl-3 pr-1.5">
          <ReadoutText iso={iso} values={values} />
          <div className="ml-auto flex items-center gap-1">
            <Link
              to={buildCalendarHref(iso)}
              aria-label={`Open day ${formatLongDay(iso)} in Calendar`}
              data-chart-open-day=""
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
            >
              Open day
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <ClearButton selection={selection} />
          </div>
        </div>
      )}
    </div>
  );
};

/** Viewer bar: Previous / Next date (they skip days without a value), then the readout or a one-line hint. */
export const ChartDaySelectionBar = ({ selection }: { selection: ChartDaySelection }) => {
  if (!selection.enabled) return null;
  const { iso, values, live } = describe(selection);
  const canPrev = selection.canStep(-1);
  const canNext = selection.canStep(1);
  return (
    <div data-chart-selection-bar="" data-html2canvas-ignore="true" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/40 px-3 py-2">
      <Live text={live} />
      <div role="group" aria-label="Step through days" className="flex items-center gap-1">
        {/* aria-disabled (not disabled) at the ends: focus stays on the button instead of dropping to the page. */}
        <IconButton label="Previous date" variant="outline" size="sm" aria-disabled={canPrev ? undefined : true} onClick={() => canPrev && selection.step(-1)} data-chart-step="previous">
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <IconButton label="Next date" variant="outline" size="sm" aria-disabled={canNext ? undefined : true} onClick={() => canNext && selection.step(1)} data-chart-step="next">
          <ChevronRight aria-hidden="true" />
        </IconButton>
      </div>
      {iso ? (
        <>
          <ReadoutText iso={iso} values={values} />
          <ClearButton selection={selection} />
        </>
      ) : (
        <p data-chart-selection-hint="" className="min-w-0 flex-1 text-sm text-muted-foreground">
          No day selected. Use the arrows, pick a table row, or tap a point or bar.
        </p>
      )}
    </div>
  );
};

// The Calendar's own day panel pulls in the day agenda and the note editor. Load it only when a day is selected in the viewer.
const ConnectedPanel = lazy(() => import('@/components/calendar/SelectedDayPanel').then((m) => ({ default: m.ConnectedSelectedDayPanel })));

export const ChartSelectedDayPanel = ({ day }: { day: SelectedDay }) => (
  <div data-chart-day-panel={day.isoDate} data-html2canvas-ignore="true" className="shrink-0">
    <Suspense fallback={<p role="status" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Loading that day...</p>}>
      <ConnectedPanel day={day} />
    </Suspense>
  </div>
);
