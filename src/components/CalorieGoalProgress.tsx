import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target } from 'lucide-react';

interface CalorieGoalProgressProps {
  current: number;
  goal: number;
}

export const CalorieGoalProgress = ({ current, goal }: CalorieGoalProgressProps) => {
  const percentage = Math.min(Math.round((current / goal) * 100), 100);
  const remaining = Math.max(goal - current, 0);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" />
          Daily Calorie Goal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-semibold">{percentage}%</span>
        </div>
        <Progress value={percentage} className="h-3" />
        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{current}</p>
            <p className="text-xs text-muted-foreground">Consumed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{goal}</p>
            <p className="text-xs text-muted-foreground">Goal</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-chart-2">{remaining}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
