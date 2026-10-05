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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Calorie History</h1>
          <p className="text-muted-foreground mt-1">
            Daily targets versus what you actually ate, with protein and carbs.
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-primary" />
              Search by date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="start-date">From</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">To</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
              >
                Clear
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Select a single date to filter that day, or choose a range.
            </p>
          </CardContent>
        </Card>

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
