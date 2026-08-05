import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Beef } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProteinTargetCardProps {
  multiplier: number | null;
  currentWeight: number | null;
  todayProtein: number;
}

export const ProteinTargetCard = ({ multiplier, currentWeight, todayProtein }: ProteinTargetCardProps) => {
  const target = multiplier && currentWeight ? multiplier * currentWeight : null;
  const pct = target ? Math.min(100, Math.round((todayProtein / target) * 100)) : 0;
  const reached = target !== null && todayProtein >= target;

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Beef className="h-5 w-5 text-chart-2" />
          Daily Protein Target
        </CardTitle>
      </CardHeader>
      <CardContent>
        {target === null ? (
          <p className="text-sm text-muted-foreground">
            Set a protein multiplier in Personal Data and log a weight entry to see your daily target.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {multiplier} g/kg × {currentWeight} kg
            </p>
            <div className="flex items-baseline gap-2">
              <span className={cn('text-3xl font-bold', reached ? 'text-chart-2' : 'text-foreground')}>
                {Math.round(target)}
              </span>
              <span className="text-muted-foreground">g protein / day</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', reached ? 'bg-chart-2' : 'bg-primary')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round(todayProtein)} g logged today ({pct}% of target)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
