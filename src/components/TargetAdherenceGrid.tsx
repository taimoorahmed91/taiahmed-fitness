import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';
import { adherenceSummary, DayStatus, Range, rangeStatus } from '@/lib/targets';
import { STATUS_META, TargetStatus, adherenceCellLabel } from '@/lib/targetStatus';

type Metric = 'calories' | 'protein';
interface Row {
  date: string;
  calories: { consumed: number; target: Range };
  protein: { consumed: number; target: Range | null };
}

const LEGEND: TargetStatus[] = ['within', 'under', 'over', 'none'];

export const TargetAdherenceGrid = ({ rows }: { rows: Row[] }) => {
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
          <ul aria-label={`${metric === 'calories' ? 'Calorie' : 'Protein'} target adherence by day, oldest first`} className="grid grid-cols-10 gap-1.5">
            {summary.cells.map((c) => {
              const status: TargetStatus = c.status ?? 'none';
              const meta = STATUS_META[status];
              return (
                <li key={c.date} title={adherenceCellLabel(c.date, c.status)} aria-label={adherenceCellLabel(c.date, c.status)}
                  className={cn('flex aspect-square flex-col items-center justify-center gap-px rounded-md text-xs font-medium leading-none', meta.fill, meta.onFill)}>
                  <span aria-hidden="true">{Number(c.date.slice(8))}</span>
                  <span aria-hidden="true">{meta.glyph}</span>
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
