import { useMemo, useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
  calories: { consumed: number; target: number };
  protein: { consumed: number; target: number | null };
  carbs: { consumed: number; target: number | null };
  extraCalories: number;
}

const pct = (consumed: number, target: number | null) =>
  target && target > 0 ? Math.round((consumed / target) * 100) : null;

const pctTone = (p: number | null) => {
  if (p === null) return 'text-muted-foreground';
  if (p <= 90) return 'text-blue-500';
  if (p <= 105) return 'text-green-500';
  if (p <= 120) return 'text-yellow-500';
  return 'text-red-500';
};

const MacroCell = ({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: number | null;
  unit: string;
}) => {
  const p = pct(consumed, target);
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`text-sm font-semibold ${pctTone(p)}`}>{p !== null ? `${p}%` : '—'}</span>
      </div>
      <p className="mt-1 text-sm font-medium">
        {Math.round(consumed)}
        <span className="text-muted-foreground">
          {' '}
          / {target != null ? Math.round(target) : '—'} {unit}
        </span>
      </p>
      <Progress value={Math.min(p ?? 0, 100)} className="mt-2 h-1.5" />
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

        const gymTarget = personalData.gym_day_calorie_target;
        const restTarget = personalData.rest_day_calorie_target;
        const auto = gymTarget != null || restTarget != null;
        let target = settings.daily_calorie_goal;
        if (auto) {
          if (workedOut && gymTarget != null) target = gymTarget;
          else if (!workedOut && restTarget != null) target = restTarget;
          else if (gymTarget != null) target = gymTarget;
          else if (restTarget != null) target = restTarget;
        }
        target += extraCalories;

        const weight = weightOn(date);
        const proteinTarget =
          personalData.protein_multiplier && weight ? personalData.protein_multiplier * weight : null;
        const carbTarget =
          personalData.carb_multiplier && weight ? personalData.carb_multiplier * weight : null;

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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
              <History className="h-5 w-5 text-primary" />
              Daily records ({rows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.length === 0 ? (
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
                  totalItems={rows.length}
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
