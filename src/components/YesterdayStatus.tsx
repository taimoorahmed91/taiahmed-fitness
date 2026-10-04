import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Target, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRange } from '@/lib/targets';

interface YesterdayStatusProps {
  yesterdayCalories: number;
  goal: number;
  goalMax?: number;
}

export const YesterdayStatus = ({ yesterdayCalories, goal, goalMax }: YesterdayStatusProps) => {
  const max = Math.max(goal, goalMax ?? goal);
  const range = { min: goal, max };

  const getStatusConfig = () => {
    if (yesterdayCalories === 0) {
      return { icon: Calendar, title: 'No Data', description: 'No meals logged yesterday', color: 'text-muted-foreground', bgColor: 'bg-muted/50' };
    }
    if (yesterdayCalories < goal) {
      return { icon: TrendingDown, title: 'Under Min', description: `${goal - yesterdayCalories} calories under your minimum`, color: 'text-amber-500', bgColor: 'bg-amber-500/10' };
    }
    if (yesterdayCalories > max) {
      return { icon: TrendingUp, title: 'Over Max', description: `${yesterdayCalories - max} calories over your maximum`, color: 'text-destructive', bgColor: 'bg-destructive/10' };
    }
    return { icon: Target, title: 'Within Range!', description: `Between ${formatRange(range)} cal`, color: 'text-chart-2', bgColor: 'bg-chart-2/10' };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <Card className={cn('shadow-md', config.bgColor)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className={cn('h-5 w-5', config.color)} />
          Yesterday's Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-center">
          <p className="text-sm text-muted-foreground">{yesterdayStr}</p>
          <div className="flex items-baseline justify-center gap-2">
            <span className={cn('text-3xl font-bold', config.color)}>
              {yesterdayCalories > 0 ? yesterdayCalories : '—'}
            </span>
            {yesterdayCalories > 0 && <span className="text-muted-foreground">/ {formatRange(range)} cal</span>}
          </div>
          <p className={cn('text-sm font-medium', config.color)}>{config.title}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </CardContent>
    </Card>
  );
};
