import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Target, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_META, describeTarget, formatTargetRange } from '@/lib/targetStatus';
import { UNIT_LABEL, formatNumber } from '@/lib/chartTheme';
import { formatLongDay, yesterdayIso } from '@/lib/dayLabels';

interface YesterdayStatusProps {
  yesterdayCalories: number;
  goal: number;
  goalMax?: number;
  /**
   * The UTC calendar day (YYYY-MM-DD) the calories belong to. The label under the title is built from this
   * exact day. Omit it to use the UTC day before today, which is what the Dashboard totals.
   */
  date?: string;
}

export const YesterdayStatus = ({ yesterdayCalories, goal, goalMax, date }: YesterdayStatusProps) => {
  const max = Math.max(goal, goalMax ?? goal);
  const range = { min: goal, max };
  const unit = UNIT_LABEL.calories;

  // Same colours and words as the target bars: amber under min, green on target, red over max.
  const getStatusConfig = () => {
    if (yesterdayCalories === 0) {
      const none = STATUS_META.none;
      return { icon: Calendar, title: 'No data', description: 'No meals were logged yesterday', color: none.text, bgColor: none.tint };
    }
    const { status, text } = describeTarget(yesterdayCalories, range, unit);
    const meta = STATUS_META[status];
    const icon = status === 'under' ? TrendingDown : status === 'over' ? TrendingUp : Target;
    return { icon, title: meta.label, description: text, color: meta.text, bgColor: meta.tint };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const yesterdayStr = formatLongDay(date ?? yesterdayIso());

  return (
    <Card className={cn('shadow-md', config.bgColor)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className={cn('h-5 w-5', config.color)} aria-hidden="true" />
          Yesterday&apos;s Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-center">
          <p className="text-sm text-muted-foreground">{yesterdayStr}</p>
          <div className="flex items-baseline justify-center gap-2">
            <span className={cn('text-3xl font-bold', config.color)}>
              {yesterdayCalories > 0 ? formatNumber(yesterdayCalories, 0) : '\u2014'}
            </span>
            {yesterdayCalories > 0 && <span className="text-muted-foreground">/ {formatTargetRange(range)} {unit}</span>}
          </div>
          <p className={cn('text-sm font-medium', config.color)}>{config.title}</p>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
      </CardContent>
    </Card>
  );
};
