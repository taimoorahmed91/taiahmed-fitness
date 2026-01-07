import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Target, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface YesterdayStatusProps {
  yesterdayCalories: number;
  goal: number;
}

export const YesterdayStatus = ({ yesterdayCalories, goal }: YesterdayStatusProps) => {
  const difference = yesterdayCalories - goal;
  const percentageOfGoal = Math.round((yesterdayCalories / goal) * 100);
  
  // Determine status: within 10% of goal is "on track"
  const tolerance = goal * 0.1;
  const isOnTrack = Math.abs(difference) <= tolerance;
  const isUnder = difference < -tolerance;
  const isOver = difference > tolerance;

  const getStatusConfig = () => {
    if (yesterdayCalories === 0) {
      return {
        icon: Calendar,
        title: 'No Data',
        description: 'No meals logged yesterday',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
      };
    }
    if (isOnTrack) {
      return {
        icon: Target,
        title: 'On Track!',
        description: `You hit ${percentageOfGoal}% of your goal`,
        color: 'text-chart-2',
        bgColor: 'bg-chart-2/10',
      };
    }
    if (isUnder) {
      return {
        icon: TrendingDown,
        title: 'Under Goal',
        description: `${Math.abs(difference)} calories under your goal`,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
      };
    }
    return {
      icon: TrendingUp,
      title: 'Over Goal',
      description: `${difference} calories over your goal`,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <Card className={cn('shadow-md', config.bgColor)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className={cn('h-5 w-5', config.color)} />
          Yesterday's Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{yesterdayStr}</p>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-3xl font-bold', config.color)}>
              {yesterdayCalories > 0 ? yesterdayCalories : '—'}
            </span>
            {yesterdayCalories > 0 && (
              <span className="text-muted-foreground">/ {goal} cal</span>
            )}
          </div>
          <p className={cn('text-sm font-medium', config.color)}>{config.title}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </CardContent>
    </Card>
  );
};
