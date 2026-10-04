import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { TargetRangeBar } from '@/components/TargetRangeBar';

interface CalorieGoalProgressProps {
  current: number;
  goal: number;
  goalMax?: number;
  autoMode?: boolean;
  dayType?: 'gym' | 'rest';
}

export const CalorieGoalProgress = ({ current, goal, goalMax, autoMode = false, dayType }: CalorieGoalProgressProps) => {
  const range = { min: goal, max: Math.max(goal, goalMax ?? goal) };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Daily Calorie Goal
            {autoMode && dayType && (
              <span
                className={`text-xs font-semibold ${
                  dayType === 'gym' ? 'text-chart-2' : 'text-orange-500'
                }`}
              >
                {dayType === 'gym' ? 'Gym day' : 'Rest day'}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <TargetRangeBar current={current} range={range} />
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm text-muted-foreground">Consumed</span>
          <span className="text-2xl font-bold text-primary">{current}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border border-green-500/40 bg-green-500/5 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              Min <span className="font-semibold text-green-500">{Math.round(range.min)}</span>
            </span>
            <span className="text-sm text-green-500 font-medium">Remaining {Math.max(range.min - current, 0)}</span>
            <span className="text-sm font-semibold">{Math.round((current / range.min) * 100)}%</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-orange-500/40 bg-orange-500/5 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              Max <span className="font-semibold text-orange-500">{Math.round(range.max)}</span>
            </span>
            <span className="text-sm text-orange-500 font-medium">Remaining {Math.max(range.max - current, 0)}</span>
            <span className="text-sm font-semibold">{Math.round((current / range.max) * 100)}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
