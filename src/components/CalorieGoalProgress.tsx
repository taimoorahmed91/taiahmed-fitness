import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { TargetRangeBar } from '@/components/TargetRangeBar';
import { TargetLimitRows } from '@/components/charts/TargetLimitRows';
import { STATUS_META, describeTarget } from '@/lib/targetStatus';
import { UNIT_LABEL, formatNumber } from '@/lib/chartTheme';
import { cn } from '@/lib/utils';

interface CalorieGoalProgressProps {
  current: number;
  goal: number;
  goalMax?: number;
  autoMode?: boolean;
  dayType?: 'gym' | 'rest';
}

export const CalorieGoalProgress = ({ current, goal, goalMax, autoMode = false, dayType }: CalorieGoalProgressProps) => {
  const range = { min: goal, max: Math.max(goal, goalMax ?? goal) };
  const unit = UNIT_LABEL.calories;
  const status = describeTarget(current, range, unit);
  const meta = STATUS_META[status.status];

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex flex-wrap items-center gap-2">
            <Target className="h-5 w-5 text-primary" aria-hidden="true" />
            Daily Calorie Goal
            {autoMode && dayType && (
              // Day type is a category, not a status: gym and rest use two neutral chart hues.
              <span className={cn('text-xs font-semibold', dayType === 'gym' ? 'text-chart-2' : 'text-chart-4')}>
                {dayType === 'gym' ? 'Gym day' : 'Rest day'}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <TargetRangeBar current={current} range={range} unit={unit} label="Calories against daily goal" />
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm text-muted-foreground">Consumed</span>
          <span className="text-2xl font-bold text-primary">{formatNumber(current, 0)} <span className="text-sm font-medium text-muted-foreground">{unit}</span></span>
        </div>
        <p className={cn('flex items-center gap-1.5 text-sm font-medium', meta.text)}>
          <span aria-hidden="true">{meta.glyph}</span>
          <span>{status.text}</span>
        </p>
        <TargetLimitRows current={current} min={range.min} max={range.max} unit={unit} />
      </CardContent>
    </Card>
  );
};
