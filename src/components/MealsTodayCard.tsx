import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TargetRangeBar } from '@/components/TargetRangeBar';
import { Range, formatRange } from '@/lib/targets';
import { Target } from 'lucide-react';

interface Props {
  calories: number;
  protein: number;
  carbs: number;
  calorieRange: Range;
  proteinRange: Range | null;
  carbRange: Range | null;
  mealsToday: number;
  weekCalories: number;
  dayType: 'Gym day' | 'Rest day' | null;
}

const MetricRow = ({ label, unit, value, range }: { label: string; unit: string; value: number; range: Range | null }) => (
  <div>
    <div className="flex items-baseline justify-between">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">
        <span className="text-base font-bold text-foreground">{Math.round(value)}</span>
        {range ? ` / ${formatRange(range)} ${unit}` : ` ${unit}`}
      </span>
    </div>
    {range ? (
      <>
        <TargetRangeBar current={value} range={range} className="pb-4" />
        <div className="flex justify-between text-xs">
          <span className="text-chart-min">To min: {Math.max(0, Math.round(range.min - value))} {unit}</span>
          <span className="text-chart-max">To max: {Math.max(0, Math.round(range.max - value))} {unit}</span>
        </div>
      </>
    ) : (
      <p className="text-xs text-muted-foreground mt-1">Set a target on the Personal page.</p>
    )}
  </div>
);

export const MealsTodayCard = ({ calories, protein, carbs, calorieRange, proteinRange, carbRange, mealsToday, weekCalories, dayType }: Props) => {
  const pCal = protein * 4;
  const cCal = carbs * 4;
  const other = Math.max(0, calories - pCal - cCal);
  const total = Math.max(calories, pCal + cCal);
  const split = [
    { name: 'Protein', kcal: pCal, color: 'bg-primary' },
    { name: 'Carbs', kcal: cCal, color: 'bg-chart-min' },
    { name: 'Other', kcal: other, color: 'bg-chart-actual' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" />Today's targets</span>
          {dayType && <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">{dayType}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <MetricRow label="Calories" unit="cal" value={calories} range={calorieRange} />
        <MetricRow label="Protein" unit="g" value={protein} range={proteinRange} />
        <MetricRow label="Carbs" unit="g" value={carbs} range={carbRange} />

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Where today's calories come from</p>
          {total > 0 ? (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
                {split.map((s) => s.kcal > 0 && (
                  <div key={s.name} className={s.color} style={{ width: `${(s.kcal / total) * 100}%` }} />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {split.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-muted-foreground">
                    <span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} aria-hidden="true" />
                    {s.name} <span className="ml-auto font-semibold text-foreground">{Math.round((s.kcal / total) * 100)}%</span>
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Protein and carbs count as 4 cal per gram; "Other" is mostly fat.</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No meals logged today yet.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
          <span className="text-muted-foreground">Meals today: <span className="font-semibold text-foreground">{mealsToday}</span></span>
          <span className="text-right text-muted-foreground">Last 7 days: <span className="font-semibold text-foreground">{weekCalories.toLocaleString()}</span> cal</span>
        </div>
      </CardContent>
    </Card>
  );
};
