import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TargetRangeBar } from '@/components/TargetRangeBar';
import { Range, formatRange } from '@/lib/targets';

interface Props {
  title: string;
  icon: ReactNode;
  range: Range | null;
  current: number;
  emptyText: string;
}

export const MacroTargetCard = ({ title, icon, range, current, emptyText }: Props) => (
  <Card className="shadow-md">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-lg">{icon}{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      {range === null ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold">{Math.round((current / range.min) * 100)}% of min</span>
          </div>
          <TargetRangeBar current={current} range={range} />
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{Math.round(current)}</p>
              <p className="text-xs text-muted-foreground">Consumed</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{formatRange(range)}</p>
              <p className="text-xs text-muted-foreground">Min–Max</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-chart-2">
                {formatRange({ min: Math.max(range.min - current, 0), max: Math.max(range.max - current, 0) })}
              </p>
              <p className="text-xs text-muted-foreground">Remaining</p>
            </div>
          </div>
        </>
      )}
    </CardContent>
  </Card>
);
