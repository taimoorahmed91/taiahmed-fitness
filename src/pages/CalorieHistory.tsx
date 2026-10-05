import { useMemo, useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TargetRangeBar } from '@/components/TargetRangeBar';
import { Range, resolveCalorieRange, macroRange, rangeStatus, formatRange } from '@/lib/targets';
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
  const { meals } = useMeals();
  const { sessions } = useGymSessions();
  const { activities } = useExtraActivities();
  const { data: personalData } = usePersonalData();
  const { settings } = useUserSettings();
  const { entries: weightEntries } = useWeight();
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
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Calorie History</h1>
            <p className="text-muted-foreground mt-1">
              Daily targets versus what you actually ate, with protein and carbs.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-5 w-5 text-primary" />
                Search by date
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[7, 14, 30].map((d) => (
                  <Button key={d} size="sm" variant={activeQuick(d) ? 'default' : 'outline'} onClick={() => quickRange(d)}>
                    {d}D
                  </Button>
                ))}
                <Button size="sm" variant={!startDate && !endDate ? 'default' : 'outline'} onClick={() => quickRange(null)}>
                  All
                </Button>
              </div>
              <div className="grid gap-4 grid-cols-2">
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
              {!summary ? (
                <p className="text-muted-foreground">No days in this selection.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full border px-3 py-1">{summary.days} days</span>
                    <span className="flex items-center gap-1 rounded-full border px-3 py-1"><Dumbbell className="h-3 w-3" /> {summary.gym} gym</span>
                    <span className="flex items-center gap-1 rounded-full border px-3 py-1"><Moon className="h-3 w-3" /> {summary.days - summary.gym} rest</span>
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>


        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-primary" />
              Daily records ({filteredRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredRows.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data logged yet.</p>
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
                              <Dumbbell className="h-3 w-3" /> Gym day
                            </>
                          ) : (
                            <>
                              <Moon className="h-3 w-3" /> Rest day
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
      </div>
    </div>
  );
};

export default CalorieHistory;
