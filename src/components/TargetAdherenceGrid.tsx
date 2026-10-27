import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adherenceSummary, DayStatus, Range, rangeStatus } from '@/lib/targets';

type Metric = 'calories' | 'protein';
interface Row {
  date: string;
  calories: { consumed: number; target: Range };
  protein: { consumed: number; target: Range | null };
}

const STATUS_CLASS: Record<string, string> = {
  within: 'bg-[hsl(var(--chart-min))]',
  over: 'bg-[hsl(var(--chart-max))]',
  under: 'bg-accent',
  none: 'bg-muted',
};
const LABEL: Record<string, string> = { within: 'On target', over: 'Over max', under: 'Under min', none: 'Not logged' };

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
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg"><Flame className="h-5 w-5 text-primary" />Target adherence · 30 days</CardTitle>
        <div className="flex rounded-full border p-0.5 text-xs">
          {(['calories', 'protein'] as Metric[]).map((m) => (
            <button key={m} onClick={() => setMetric(m)}
              className={cn('px-3 py-1 rounded-full capitalize', metric === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {m}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Current streak</p><p className="text-xl font-bold text-primary">{summary.streak} day{summary.streak === 1 ? '' : 's'}</p></div>
          <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Last 7 days</p><p className="text-xl font-bold">{summary.week.hit}/{summary.week.logged}</p><p className="text-xs text-muted-foreground">{summary.week.pct ?? '–'}%</p></div>
          <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Last 30 days</p><p className="text-xl font-bold">{summary.month.hit}/{summary.month.logged}</p><p className="text-xs text-muted-foreground">{summary.month.pct ?? '–'}%</p></div>
        </div>
        <div className="grid grid-cols-10 gap-1.5">
          {summary.cells.map((c) => (
            <div key={c.date} title={`${c.date} · ${LABEL[c.status ?? 'none']}`}
              className={cn('aspect-square rounded-md flex items-center justify-center text-[10px] text-foreground/80', STATUS_CLASS[c.status ?? 'none'])}>
              {Number(c.date.slice(8))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {['within', 'under', 'over', 'none'].map((k) => (
            <span key={k} className="flex items-center gap-1"><span className={cn('h-3 w-3 rounded-sm', STATUS_CLASS[k])} />{LABEL[k]}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
