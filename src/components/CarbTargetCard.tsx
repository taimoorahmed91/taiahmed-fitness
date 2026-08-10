import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Wheat } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CarbTargetCardProps {
  multiplier: number | null;
  currentWeight: number | null;
  todayCarbs: number;
}

export const CarbTargetCard = ({ multiplier, currentWeight, todayCarbs }: CarbTargetCardProps) => {
  const target = multiplier && currentWeight ? multiplier * currentWeight : null;
  const goal = target ?? 0;
  const current = todayCarbs;
  const percentage = goal > 0 ? Math.min(Math.round((current / goal) * 100), 100) : 0;
  const remaining = Math.max(goal - current, 0);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wheat className="h-5 w-5 text-chart-3" />
          Daily Carb Target
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {target === null ? (
          <p className="text-sm text-muted-foreground">
            Set a carb multiplier in Personal Data and log a weight entry to see your daily target.
          </p>
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{percentage}%</span>
            </div>
            <Progress value={percentage} className="h-3" />
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{Math.round(current)}</p>
                <p className="text-xs text-muted-foreground">Consumed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{Math.round(goal)}</p>
                <p className="text-xs text-muted-foreground">Goal</p>
              </div>
              <div className="text-center">
                <p className={cn('text-2xl font-bold', 'text-chart-3')}>
                  {Math.round(remaining)}
                </p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
