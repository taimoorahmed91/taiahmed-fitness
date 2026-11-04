import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';
import { adherenceSummary, DayStatus, Range, rangeStatus } from '@/lib/targets';
import { STATUS_META, TargetStatus, adherenceCellLabel } from '@/lib/targetStatus';
import { adherenceCellDay } from '@/lib/dayEntryAdapters';
import type { SelectedDay } from '@/lib/selectedDay';

type Metric = 'calories' | 'protein';
interface Row {
  date: string;
  calories: { consumed: number; target: Range };
  protein: { consumed: number; target: Range | null };
}

const LEGEND: TargetStatus[] = ['within', 'under', 'over', 'none'];

interface TargetAdherenceGridProps {
  rows: Row[];
  /**
   * Makes every day a button that opens that day (the page decides how: usually the Calendar). Without it the cells
   * are plain, non-interactive squares as before.
   */
  onOpenDay?: (day: SelectedDay) => void;
}

export const TargetAdherenceGrid = ({ rows, onOpenDay }: TargetAdherenceGridProps) => {
  const [metric, setMetric] = useState<Metric>('calories');
  const summary = useMemo(() => {
    const map: Record<string, DayStatus> = {};
    rows.forEach((r) => {
      if (r.calories.consumed <= 0) return;
      const t = metric === 'calories' ? r.calories.target : r.protein.target;
      if (!t) return;
      map[r.date] = rangeStatus(metric === 'calories' ? r.calories.consumed : r.protein.consumed, t);
    });
    return adherenceSummary(map, new Date().toISOString().slice(0, 10), 30);
  }, [rows, metric]);

  return (
    <Card className="shadow-md">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg"><Flame className="h-5 w-5 text-primary" aria-hidden="true" />Target adherence · 30 days</CardTitle>
        {/* Categorical choice (which metric), not a date range: a plain two-way switch. */}
        <SegmentedControl<Metric>
          size="sm"
          ariaLabel="Metric"
          value={metric}
          onValueChange={setMetric}
          options={[{ value: 'calories', label: 'Calories' }, { value: 'protein', label: 'Protein' }]}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Current streak</p><p className="text-xl font-bold text-primary">{summary.streak} day{summary.streak === 1 ? '' : 's'}</p></div>
          <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Last 7 days</p><p className="text-xl font-bold">{summary.week.hit}/{summary.week.logged}</p><p className="text-xs text-muted-foreground">{summary.week.pct == null ? '--' : `${summary.week.pct}%`}</p></div>
          <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Last 30 days</p><p className="text-xl font-bold">{summary.month.hit}/{summary.month.logged}</p><p className="text-xs text-muted-foreground">{summary.month.pct == null ? '--' : `${summary.month.pct}%`}</p></div>
        </div>
        {summary.month.logged === 0 ? (
          <p role="status" className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No days with a {metric} target and logged meals in the last 30 days yet. Days appear here once meals are logged against a target.
          </p>
        ) : (
          <ul
            aria-label={`${metric === 'calories' ? 'Calorie' : 'Protein'} target adherence by day, oldest first`}
            // Squares at least 44px wide, so every day is a comfortable touch target on a 320px phone; ten across from md.
            className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 md:grid-cols-10"
          >
            {summary.cells.map((c) => {
              const status: TargetStatus = c.status ?? 'none';
              const meta = STATUS_META[status];
              const day = onOpenDay ? adherenceCellDay(c.date, metric) : null;
              const label = adherenceCellLabel(c.date, c.status);
              const face = (
                <>
                  <span aria-hidden="true">{Number(c.date.slice(8))}</span>
                  <span aria-hidden="true">{meta.glyph}</span>
                </>
              );
              const cellClass = cn('flex flex-col items-center justify-center gap-px rounded-md text-xs font-medium leading-none', meta.fill, meta.onFill);
              return day && onOpenDay ? (
                <li key={c.date} className="aspect-square min-h-11">
                  {/* The glyph and the word in the name say how the day went, so colour is never the only cue. */}
                  <button
                    type="button"
                    title={`${label}. Open in Calendar`}
                    aria-label={`${label}. Open in Calendar`}
                    onClick={() => onOpenDay(day)}
                    className={cn(
                      cellClass,
                      'press h-full w-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none',
                      '[@media(hover:hover)]:hover:ring-2 [@media(hover:hover)]:hover:ring-foreground/60',
                    )}
                  >
                    {face}
                  </button>
                </li>
              ) : (
                <li key={c.date} title={label} aria-label={label} className={cn(cellClass, 'aspect-square')}>
                  {face}
                </li>
              );
            })}
          </ul>
        )}
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {LEGEND.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('flex h-4 w-4 items-center justify-center rounded-sm text-xs leading-none', STATUS_META[k].fill, STATUS_META[k].onFill)}>{STATUS_META[k].glyph}</span>
              {STATUS_META[k].label}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
