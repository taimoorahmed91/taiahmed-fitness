import { useMemo } from 'react';
import { CalendarRange, Dumbbell, Flame, Scale, Moon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useWeight } from '@/hooks/useWeight';
import { useWaist } from '@/hooks/useWaist';
import { useSleep } from '@/hooks/useSleep';
import { useWhoopData } from '@/hooks/useWhoopData';
import { weeklyDigest } from '@/lib/crossMetricIntelligence';
import { cn } from '@/lib/utils';

const fmt = (v: number | null, unit = '', signed = false) =>
  v == null ? '–' : `${signed && v > 0 ? '+' : ''}${v.toLocaleString()}${unit}`;

/** Compares two values; `lowerIsBetter` flips the good/bad colouring. */
const Change = ({ now, before, unit = '', lowerIsBetter = false }: { now: number | null; before: number | null; unit?: string; lowerIsBetter?: boolean }) => {
  if (now == null || before == null) return <span className="text-xs text-muted-foreground">no prior week</span>;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="text-xs text-muted-foreground">same as last week</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return <span className={cn('text-xs font-medium', good ? 'text-[hsl(var(--chart-min))]' : 'text-[hsl(var(--chart-max))]')}>{d > 0 ? '+' : ''}{d.toLocaleString()}{unit} vs last week</span>;
};

const Row = ({ label, value, change }: { label: string; value: string; change: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-right"><span className="font-semibold">{value}</span><br />{change}</span>
  </div>
);

export const WeeklyDigestCard = () => {
  const { meals } = useMeals();
  const { sessions } = useGymSessions();
  const { entries: weight } = useWeight();
  const { entries: waist } = useWaist();
  const { entries: sleep } = useSleep();
  const { entries: whoop } = useWhoopData();

  const { current: c, previous: p } = useMemo(() => weeklyDigest({
    meals: meals.map((m) => ({ date: m.date, calories: m.calories, protein: m.protein })),
    gym: sessions.map((s) => ({ date: s.date, duration: s.duration, notes: s.notes })),
    weight: weight.map((w) => ({ date: w.date, value: w.weight })),
    waist: waist.map((w) => ({ date: w.date, value: w.waist })),
    sleep: sleep.map((s) => ({ date: s.date, hours: s.hours })),
    recovery: whoop.map((w) => ({ date: w.date, score: w.recovery_score })),
  }, new Date().toISOString().slice(0, 10)), [meals, sessions, weight, waist, sleep, whoop]);

  const pillar = (icon: React.ReactNode, title: string, rows: React.ReactNode) => (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="flex items-center gap-2 font-semibold">{icon}{title}</p>
      {rows}
    </div>
  );

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CalendarRange className="h-5 w-5 text-primary" />This week at a glance</CardTitle>
        <p className="text-sm text-muted-foreground">Last 7 days compared with the 7 days before.</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {pillar(<Dumbbell className="h-4 w-4 text-primary" />, 'Training', <>
          <Row label="Workouts" value={fmt(c.workouts)} change={<Change now={c.workouts} before={p.workouts} />} />
          <Row label="Gym time" value={fmt(c.minutes, ' min')} change={<Change now={c.minutes} before={p.minutes} unit=" min" />} />
          <Row label="Volume" value={fmt(c.tonnage, ' kg')} change={<Change now={c.tonnage} before={p.tonnage} unit=" kg" />} />
        </>)}
        {pillar(<Flame className="h-4 w-4 text-primary" />, 'Nutrition', <>
          <Row label="Avg calories" value={fmt(c.avgCalories, ' cal')} change={<Change now={c.avgCalories} before={p.avgCalories} unit=" cal" lowerIsBetter />} />
          <Row label="Avg protein" value={fmt(c.avgProtein, ' g')} change={<Change now={c.avgProtein} before={p.avgProtein} unit=" g" />} />
        </>)}
        {pillar(<Scale className="h-4 w-4 text-primary" />, 'Body', <>
          <Row label="Weight change" value={fmt(c.weightDelta, ' kg', true)} change={<span className="text-xs text-muted-foreground">first vs last entry this week</span>} />
          <Row label="Waist change" value={fmt(c.waistDelta, ' cm', true)} change={<span className="text-xs text-muted-foreground">needs 2 entries this week</span>} />
        </>)}
        {pillar(<Moon className="h-4 w-4 text-primary" />, 'Recovery', <>
          <Row label="Avg sleep" value={fmt(c.avgSleep, ' h')} change={<Change now={c.avgSleep} before={p.avgSleep} unit=" h" />} />
          <Row label="Avg WHOOP recovery" value={fmt(c.avgRecovery, '%')} change={<Change now={c.avgRecovery} before={p.avgRecovery} unit="%" />} />
        </>)}
      </CardContent>
    </Card>
  );
};
