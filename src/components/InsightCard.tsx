import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CorrelationInsight } from '@/hooks/useReportData';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  insight: CorrelationInsight;
}

export const InsightCard = ({ insight }: InsightCardProps) => {
  const correlationStyles = {
    positive: {
      bg: 'bg-chart-min/10 border-chart-min/20',
      icon: TrendingUp,
      iconColor: 'text-chart-min',
      valueColor: 'text-chart-min',
    },
    negative: {
      bg: 'bg-chart-max/10 border-chart-max/20',
      icon: TrendingDown,
      iconColor: 'text-chart-max',
      valueColor: 'text-chart-max',
    },
    neutral: {
      bg: 'bg-muted/50 border-muted',
      icon: Minus,
      iconColor: 'text-muted-foreground',
      valueColor: 'text-muted-foreground',
    },
  };

  const style = correlationStyles[insight.correlation];
  const Icon = style.icon;

  return (
    <Card className={cn('border transition-colors', style.bg)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('h-4 w-4', style.iconColor)} />
              <h4 className="font-semibold text-sm">{insight.title}</h4>
            </div>
            <p className="text-sm text-muted-foreground">{insight.description}</p>
          </div>
          {insight.value && (
            <span className={cn('text-lg font-bold', style.valueColor)}>
              {insight.value}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
