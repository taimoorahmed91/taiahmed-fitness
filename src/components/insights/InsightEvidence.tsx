import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import {
  OBSERVED_DIFFERENCE,
  type CrossMetricEvidence,
  type RecoveryGymEvidence,
  type SleepNutritionEvidence,
} from '@/lib/crossMetricIntelligence';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * "Show evidence" disclosure for a cross-metric insight: how the days were split, which dates sit in each
 * group with their logged values, and how much of the data was usable. Everything shown comes from the
 * evidence object the calculation returned, so it always matches the numbers in the insight's copy.
 *
 * Neutral by design: no good/bad colouring, and nothing here says one group is healthier than the other.
 * Meaning is carried by words and headings, never by colour alone.
 */
export interface InsightEvidenceProps {
  /** Insight title, used to name the region for screen readers. */
  title: string;
  evidence: CrossMetricEvidence;
  /** Sources whose latest refresh failed. Shown even while the disclosure is closed. */
  staleSources?: string[];
  /**
   * Makes every date a button that reports its ISO date (YYYY-MM-DD), e.g. to open that day's detail.
   * Without it dates are plain `<time>` elements; both carry `data-iso-date` so a parent can hook in later.
   */
  onSelectDate?: (isoDate: string) => void;
  className?: string;
}

const MINUS = '\u2212';
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? MINUS : '');
const signedNum = (n: number, unit: string) => `${sign(Math.round(n))}${num(Math.abs(n))}${unit}`;
const dash = (
  <>
    <span aria-hidden="true">{'\u2014'}</span>
    <span className="sr-only">not recorded</span>
  </>
);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const windowText = (from: string | null, to: string | null) => {
  if (from && to) return `logged days from ${from} to ${to}`;
  if (from) return `logged days from ${from} onward`;
  if (to) return `logged days up to ${to}`;
  return 'all logged days';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "13 Oct" (short enough for a 320px table); the year is added only when the listed days span more than one. */
const shortDate = (iso: string, withYear: boolean) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}${withYear ? ` ${y}` : ''}`;
};

type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; foot: ReactNode };

const DateCell = ({ iso, withYear, onSelectDate }: { iso: string; withYear: boolean; onSelectDate?: (iso: string) => void }) =>
  onSelectDate ? (
    <button
      type="button"
      data-iso-date={iso}
      onClick={() => onSelectDate(iso)}
      aria-label={`Open ${iso}`}
      className="-mx-1 inline-flex min-h-11 whitespace-nowrap items-center rounded px-1 font-medium tabular-nums underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
    >
      {shortDate(iso, withYear)}
    </button>
  ) : (
    <time dateTime={iso} data-iso-date={iso} className="whitespace-nowrap tabular-nums">{shortDate(iso, withYear)}</time>
  );

/** One group of days: heading with the count, a scrollable table of dates and values, an average row. */
function CohortTable<T extends { date: string }>({
  testId, heading, rule, rows, columns, averageLabel, onSelectDate,
}: {
  testId: string;
  heading: string;
  rule: string;
  rows: T[];
  columns: Column<T>[];
  averageLabel: string;
  onSelectDate?: (iso: string) => void;
}) {
  const headingId = useId();
  const withYear = new Set(rows.map(r => r.date.slice(0, 4))).size > 1;
  return (
    <section aria-labelledby={headingId} data-testid={testId} className="min-w-0 space-y-1.5">
      <div>
        <h5 id={headingId} className="text-sm font-semibold leading-snug">
          {heading} <span className="font-normal text-muted-foreground">{'\u00B7'} {plural(rows.length, 'day')}</span>
        </h5>
        <p className="text-xs text-muted-foreground">{rule}</p>
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label={`${heading}: dates and values`}
        className="max-h-64 overflow-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full border-collapse whitespace-nowrap text-xs sm:text-sm">
          <caption className="sr-only">{heading}: {plural(rows.length, 'day')}, one row per date</caption>
          <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-1.5 py-1.5 font-medium sm:px-2">Date</th>
              {columns.map(c => <th key={c.key} scope="col" className="whitespace-normal px-1.5 py-1.5 text-right align-bottom font-medium leading-tight sm:px-2">{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.date} className="border-t">
                <th scope="row" className="px-1.5 py-1 text-left font-normal sm:px-2"><DateCell iso={row.date} withYear={withYear} onSelectDate={onSelectDate} /></th>
                {columns.map(c => <td key={c.key} className="px-1.5 py-1 text-right tabular-nums sm:px-2">{c.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot className="font-medium">
            <tr>
              <th scope="row" className="sticky bottom-0 border-t-2 bg-muted px-1.5 py-1.5 text-left font-medium sm:px-2">{averageLabel}</th>
              {columns.map(c => <td key={c.key} className="sticky bottom-0 border-t-2 bg-muted px-1.5 py-1.5 text-right tabular-nums sm:px-2">{c.foot}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

const RecoveryGymBody = ({ ev, onSelectDate }: { ev: RecoveryGymEvidence; onSelectDate?: (iso: string) => void }) => {
  const { coverage: c, averages: a, differences: d } = ev;
  const columns = (side: 'high' | 'low'): Column<RecoveryGymEvidence['high'][number]>[] => [
    { key: 'recovery', header: 'Recovery', cell: r => `${num(r.recovery)}%`, foot: `${num(a[side].recovery)}%` },
    { key: 'duration', header: 'Time (min)', cell: r => (r.durationMin == null ? dash : num(r.durationMin)), foot: a[side].durationMin == null ? dash : num(a[side].durationMin!) },
    { key: 'volume', header: 'Volume (kg)', cell: r => (r.volumeKg == null ? dash : num(r.volumeKg)), foot: a[side].volumeKg == null ? dash : num(a[side].volumeKg!) },
  ];
  const diffs = [
    d.volumeKg != null && d.volumePct != null ? `volume ${signedNum(d.volumeKg, ' kg')} (${signedNum(d.volumePct, '%')})` : null,
    d.durationMin != null && d.durationPct != null ? `duration ${signedNum(d.durationMin, ' min')} (${signedNum(d.durationPct, '%')})` : null,
  ].filter(Boolean);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">How the days were split.</span>{' '}
        Window: {windowText(ev.window.from, ev.window.to)}. A day is a workout date with a WHOOP recovery score;
        several workouts on one date are added together. Recovery of {ev.cutoff}% or higher is the higher group, below {ev.cutoff}% is the lower group.
        A comparison needs at least {ev.minCohortDays} days in each group.
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground" aria-label="Data coverage">
        <li>{plural(c.workoutDays, 'workout day')} in the window; {c.usedDays} used, {c.noRecoveryDays} left out for having no recovery score.</li>
        {c.duplicateRecoveryDates > 0 && <li>{plural(c.duplicateRecoveryDates, 'date')} had more than one WHOOP record; the latest was used.</li>}
        <li>Volume known on {c.highVolumeDays} of {ev.high.length} higher and {c.lowVolumeDays} of {ev.low.length} lower days (working sets in notes).</li>
        <li>Duration known on {c.highDurationDays} of {ev.high.length} higher and {c.lowDurationDays} of {ev.low.length} lower days.</li>
        <li>A dash means not recorded; that day is left out of that average, not counted as zero.</li>
      </ul>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))]">
        <CohortTable testId="evidence-cohort-high" heading={`Higher recovery (${ev.cutoff}% or more)`} rule={`Recovery \u2265 ${ev.cutoff}%`}
          rows={ev.high} columns={columns('high')} averageLabel="Average" onSelectDate={onSelectDate} />
        <CohortTable testId="evidence-cohort-low" heading={`Lower recovery (below ${ev.cutoff}%)`} rule={`Recovery < ${ev.cutoff}%`}
          rows={ev.low} columns={columns('low')} averageLabel="Average" onSelectDate={onSelectDate} />
      </div>
      <p className="text-sm" data-testid="evidence-delta">
        <span className="font-medium">{OBSERVED_DIFFERENCE}:</span>{' '}
        {diffs.length ? `higher-recovery days minus lower-recovery days, ${diffs.join(' and ')}.` : 'not enough recorded volume or duration to compare.'}{' '}
        <span className="text-muted-foreground">This compares averages of what was logged. It does not show a cause.</span>
      </p>
    </>
  );
};

const SleepNutritionBody = ({ ev, onSelectDate }: { ev: SleepNutritionEvidence; onSelectDate?: (iso: string) => void }) => {
  const { coverage: c, averages: a, differences: d } = ev;
  const columns = (side: 'short' | 'normal'): Column<SleepNutritionEvidence['short'][number]>[] => [
    { key: 'sleep', header: 'Sleep (h)', cell: r => r.hours.toFixed(1), foot: a[side].hours.toFixed(1) },
    { key: 'calories', header: 'Calories', cell: r => num(r.calories), foot: num(a[side].calories) },
    {
      key: 'carbs', header: 'Carbs (g)',
      cell: r => (r.carbs == null ? dash : num(r.carbs)),
      foot: a[side].carbs == null ? dash : num(a[side].carbs!),
    },
  ];
  const carbs = d.carbsG != null && d.carbsPct != null
    ? `carbs ${signedNum(d.carbsG, ' g')} (${signedNum(d.carbsPct, '%')})`
    : `carbs not compared (fewer than ${ev.minCohortDays} days with carbs recorded in one group)`;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">How the days were split.</span>{' '}
        Window: {windowText(ev.window.from, ev.window.to)}. Sleep logged on a date is matched with the meals logged on that same date.
        Sleep under {ev.cutoff} h is the shorter-sleep group; {ev.cutoff} h or more is the longer-sleep group.
        A comparison needs at least {ev.minCohortDays} days in each group.
      </p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground" aria-label="Data coverage">
        <li>{plural(c.sleepDates, 'sleep date')} in the window; {c.usedDays} used, {c.noMealDays} left out for having no meals logged.</li>
        {c.duplicateSleepDates > 0 && <li>{plural(c.duplicateSleepDates, 'date')} had more than one sleep record; the longest was used.</li>}
        <li>Carbs known on {c.shortCarbDays} of {ev.short.length} shorter-sleep and {c.normalCarbDays} of {ev.normal.length} longer-sleep days. A day counts only when every meal that day has carbs recorded.</li>
        <li>A dash means carbs are unknown; that day is left out of the carb average, not counted as zero.</li>
      </ul>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))]">
        <CohortTable testId="evidence-cohort-short" heading={`Shorter sleep (under ${ev.cutoff} h)`} rule={`Sleep < ${ev.cutoff} h`}
          rows={ev.short} columns={columns('short')} averageLabel="Average" onSelectDate={onSelectDate} />
        <CohortTable testId="evidence-cohort-normal" heading={`Longer sleep (${ev.cutoff} h or more)`} rule={`Sleep \u2265 ${ev.cutoff} h`}
          rows={ev.normal} columns={columns('normal')} averageLabel="Average" onSelectDate={onSelectDate} />
      </div>
      <p className="text-sm" data-testid="evidence-delta">
        <span className="font-medium">{OBSERVED_DIFFERENCE}:</span>{' '}
        shorter-sleep days minus longer-sleep days, {carbs} and calories {signedNum(d.calories, ' cal')}.{' '}
        <span className="text-muted-foreground">This compares averages of what was logged. It does not show a cause.</span>
      </p>
    </>
  );
};

export const InsightEvidence = ({ title, evidence, staleSources = [], onSelectDate, className }: InsightEvidenceProps) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('min-w-0', className)} data-testid={`insight-evidence-${evidence.kind}`}>
      {staleSources.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground" data-testid="evidence-stale">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>May be out of date: the latest refresh of {staleSources.join(' and ')} failed, so this uses the last data that loaded.</span>
        </p>
      )}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="mt-1 -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <ChevronDown aria-hidden="true" className={cn('h-4 w-4 transition-transform duration-[400ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none', open && 'rotate-180')} />
            {open ? 'Hide evidence' : 'Show evidence'}
            <span className="sr-only"> for {title}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent role="region" aria-label={`Evidence for ${title}`} className="border-t">
          <div className="space-y-3 pt-3">
            {evidence.kind === 'recovery_vs_gym'
              ? <RecoveryGymBody ev={evidence} onSelectDate={onSelectDate} />
              : <SleepNutritionBody ev={evidence} onSelectDate={onSelectDate} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
