import { useMemo, useState, useEffect } from 'react';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState } from '@/components/layout/Page';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TargetRangeBar } from '@/components/TargetRangeBar';
import { Range, resolveCalorieRange, macroRange, rangeStatus, formatRange } from '@/lib/targets';
import { TargetAdherenceGrid } from '@/components/TargetAdherenceGrid';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useExtraActivities } from '@/hooks/useExtraActivities';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useWeight } from '@/hooks/useWeight';
import { useWhoopData } from '@/hooks/useWhoopData';
import { projectMassChange } from '@/lib/energyBalance';
import { balanceDateForCycle } from '@/lib/calorieBalance';
import { History, Dumbbell, Moon, Search } from 'lucide-react';

const PAGE_SIZE = 20;

interface DayRow {
  date: string;
  workedOut: boolean;
  calories: { consumed: number; target: Range };
  protein: { consumed: number; target: Range | null };
  carbs: { consumed: number; target: Range | null };
  extraCalories: number;
}

const pct = (consumed: number, target: number) =>
  target > 0 ? Math.round((consumed / target) * 100) : null;

const MacroCell = ({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: Range | null;
  unit: string;
}) => {
  const status = target ? rangeStatus(consumed, target) : null;
  const tone =
    status === null ? 'text-muted-foreground' : status === 'under' ? 'text-primary' : status === 'within' ? 'text-chart-min' : 'text-chart-max';
  const pMin = target ? pct(consumed, target.min) : null;
  const pMax = target ? pct(consumed, target.max) : null;
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`text-sm font-semibold ${tone}`} title="% of min / % of max">
          {target ? (pMin === pMax ? `${pMin}%` : `${pMin}% / ${pMax}%`) : '—'}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium">
        {Math.round(consumed)}
        <span className="text-muted-foreground">
          {' '}
          / {target ? formatRange(target) : '—'} {unit}
        </span>
      </p>
      {target && <TargetRangeBar current={consumed} range={target} className="mt-1" />}
    </div>
  );
};

const CalorieHistory = () => {
  const { meals, loading: mealsLoading } = useMeals();
  const { sessions, loading: sessionsLoading } = useGymSessions();
  const { activities, loading: activitiesLoading } = useExtraActivities();
  const { data: personalData, loading: personalLoading } = usePersonalData();
  const { settings } = useUserSettings();
  const { entries: weightEntries, loading: weightLoading } = useWeight();
  const { entries: whoopEntries, loading: whoopLoading } = useWhoopData();
  // Targets, totals and the "no data" message are only meaningful once every source has answered.
  const loading = mealsLoading || sessionsLoading || activitiesLoading || personalLoading || weightLoading || whoopLoading;
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const rows = useMemo<DayRow[]>(() => {
    const dates = new Set<string>();
    meals.forEach((m) => dates.add(m.date));
    sessions.forEach((s) => dates.add(s.date));
    activities.forEach((a) => dates.add(a.date));

    const sortedWeights = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date));
    const weightOn = (date: string) => {
      let value: number | null = null;
      for (const entry of sortedWeights) {
        if (entry.date <= date) value = entry.weight;
        else break;
      }
      return value ?? sortedWeights[0]?.weight ?? null;
    };

    return Array.from(dates)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => {
        const dayMeals = meals.filter((m) => m.date === date);
        const consumedCalories = dayMeals.reduce((s, m) => s + m.calories, 0);
        const consumedProtein = dayMeals.reduce((s, m) => s + (m.protein || 0), 0);
        const consumedCarbs = dayMeals.reduce((s, m) => s + (m.carbs || 0), 0);

        const workedOut = sessions.some((s) => s.date === date);
        const extraCalories = activities
          .filter((a) => a.date === date)
          .reduce((s, a) => s + (a.calories || 0), 0);

        const r = resolveCalorieRange(personalData, settings.daily_calorie_goal, workedOut, extraCalories);
        const target: Range = { min: r.min, max: r.max };

        const weight = weightOn(date);
        const proteinTarget = macroRange(personalData.protein_multiplier, personalData.protein_multiplier_max, weight);
        const carbTarget = macroRange(personalData.carb_multiplier, personalData.carb_multiplier_max, weight);

        return {
          date,
          workedOut,
          extraCalories,
          calories: { consumed: consumedCalories, target },
          protein: { consumed: consumedProtein, target: proteinTarget },
          carbs: { consumed: consumedCarbs, target: carbTarget },
        };
      });
  }, [meals, sessions, activities, personalData, settings.daily_calorie_goal, weightEntries]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (startDate && endDate) return row.date >= startDate && row.date <= endDate;
      if (startDate) return row.date === startDate;
      if (endDate) return row.date <= endDate;
      return true;
    });
  }, [rows, startDate, endDate]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const summary = useMemo(() => {
    const n = filteredRows.length;
    if (!n) return null;
    const avg = (f: (r: DayRow) => number) => Math.round(filteredRows.reduce((s, r) => s + f(r), 0) / n);
    const inRange = (k: 'calories' | 'protein' | 'carbs') => {
      const withT = filteredRows.filter((r) => r[k].target);
      return { hit: withT.filter((r) => rangeStatus(r[k].consumed, r[k].target!) === 'within').length, of: withT.length };
    };
    return {
      days: n,
      gym: filteredRows.filter((r) => r.workedOut).length,
      cal: avg((r) => r.calories.consumed),
      protein: avg((r) => r.protein.consumed),
      carbs: avg((r) => r.carbs.consumed),
      calHit: inRange('calories'),
      proteinHit: inRange('protein'),
      carbHit: inRange('carbs'),
    };
  }, [filteredRows]);

  // WHOOP burn for a day comes from the cycle recorded the following day (matches the dashboard).
  const projection = useMemo(() => {
    const burnedByDate = new Map<string, number>();
    whoopEntries.forEach((e) => {
      if (e.kilojoule == null) return;
      const balanceDate = balanceDateForCycle(e.date);
      if (!balanceDate) return;
      burnedByDate.set(balanceDate, Math.round(Number(e.kilojoule) / 4.184));
    });
    return projectMassChange(filteredRows.map((r) => ({ consumed: r.calories.consumed, burned: burnedByDate.get(r.date) || 0 })));
  }, [filteredRows, whoopEntries]);

  const today = new Date().toISOString().slice(0, 10);
  const quickRange = (days: number | null) => {
    if (days === null) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    setStartDate(d.toISOString().slice(0, 10));
    setEndDate(today);
  };
  const activeQuick = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    return startDate === d.toISOString().slice(0, 10) && endDate === today;
  };

  return (
    <PageContainer>
      <PageHeader
        icon={History}
        title="Calorie History"
        description="Daily targets versus what you actually ate, with protein and carbs."
      />

      <PageSection title="Target adherence" hideTitle>
        {loading ? <Skeleton className="h-40" aria-hidden="true" /> : <TargetAdherenceGrid rows={rows} />}
      </PageSection>

      <PageSection title="Search and summary" hideTitle>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-5 w-5 text-primary" aria-hidden="true" />
                Search by date
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[7, 14, 30].map((d) => (
                  <Button key={d} size="touch" aria-pressed={activeQuick(d)} variant={activeQuick(d) ? 'default' : 'outline'} onClick={() => quickRange(d)}>
                    {d}D
                  </Button>
                ))}
                <Button size="touch" aria-pressed={!startDate && !endDate} variant={!startDate && !endDate ? 'default' : 'outline'} onClick={() => quickRange(null)}>
                  All
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <div className="space-y-2">
                  <Label htmlFor="start-date">From</Label>
                  <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">To</Label>
                  <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => quickRange(null)}>
                Clear
              </Button>
              <p className="text-sm text-muted-foreground">
                Select a single date to filter that day, or choose a range.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-md lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Summary for selected days</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <PageLoading label="Loading summary" rows={2} />
              ) : !summary ? (
                <p className="text-muted-foreground">No days in this selection.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full border px-3 py-1">{summary.days} days</span>
                    <span className="flex items-center gap-1 rounded-full border px-3 py-1"><Dumbbell className="h-3 w-3" aria-hidden="true" /> {summary.gym} gym</span>
                    <span className="flex items-center gap-1 rounded-full border px-3 py-1"><Moon className="h-3 w-3" aria-hidden="true" /> {summary.days - summary.gym} rest</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: 'Avg calories', value: `${summary.cal} cal`, hit: summary.calHit },
                      { label: 'Avg protein', value: `${summary.protein} g`, hit: summary.proteinHit },
                      { label: 'Avg carbs', value: `${summary.carbs} g`, hit: summary.carbHit },
                    ].map((t) => (
                      <div key={t.label} className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</p>
                        <p className="mt-1 text-2xl font-bold">{t.value}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.hit.of ? (
                            <>In range <span className="font-semibold text-chart-min">{t.hit.hit}</span> of {t.hit.of} days ({Math.round((t.hit.hit / t.hit.of) * 100)}%)</>
                          ) : 'No target set'}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Energy balance &amp; projected body mass</p>
                    {projection.days === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">No days in this selection have both meals and WHOOP calories burned.</p>
                    ) : (
                      <>
                        <p className={`mt-1 text-2xl font-bold ${projection.deficit >= 0 ? 'text-chart-min' : 'text-chart-max'}`}>
                          {projection.kg <= 0 ? '−' : '+'}{Math.abs(projection.kg).toFixed(2)} kg
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Net {projection.deficit >= 0 ? 'deficit' : 'surplus'} of {Math.abs(Math.round(projection.deficit)).toLocaleString()} cal over {projection.days} day{projection.days === 1 ? '' : 's'} with WHOOP data (≈7,700 cal per kg). An estimate, not a measurement.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageSection>

      <PageSection title="Daily records" hideTitle>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-primary" aria-hidden="true" />
              Daily records{loading ? '' : ` (${filteredRows.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <PageLoading label="Loading daily records" rows={4} />
            ) : filteredRows.length === 0 ? (
              <PageEmptyState
                icon={History}
                title="No data logged yet"
                description="Meals, workouts and extra activities will show up here by day."
              />
            ) : (
              <>
                {pageRows.map((row) => (
                  <div key={row.date} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {new Date(`${row.date}T00:00:00Z`).toLocaleDateString('en-US', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {row.workedOut ? (
                            <>
                              <Dumbbell className="h-3 w-3" aria-hidden="true" /> Gym day
                            </>
                          ) : (
                            <>
                              <Moon className="h-3 w-3" aria-hidden="true" /> Rest day
                            </>
                          )}
                        </span>
                      </div>
                      {row.extraCalories > 0 && (
                        <span className="text-xs text-muted-foreground">
                          +{row.extraCalories} cal from extra activity
                        </span>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MacroCell
                        label="Calories"
                        consumed={row.calories.consumed}
                        target={row.calories.target}
                        unit="cal"
                      />
                      <MacroCell
                        label="Protein"
                        consumed={row.protein.consumed}
                        target={row.protein.target}
                        unit="g"
                      />
                      <MacroCell
                        label="Carbs"
                        consumed={row.carbs.consumed}
                        target={row.carbs.target}
                        unit="g"
                      />
                    </div>
                  </div>
                ))}
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredRows.length}
                  onPageChange={setPage}
                  hasNextPage={currentPage < totalPages}
                  hasPrevPage={currentPage > 1}
                />
              </>
            )}
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
};

export default CalorieHistory;
