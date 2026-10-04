import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TargetRangeBar } from '@/components/TargetRangeBar';
import { Range } from '@/lib/targets';

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
          <TargetRangeBar current={current} range={range} />
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm text-muted-foreground">Consumed</span>
            <span className="text-2xl font-bold text-primary">{Math.round(current)}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-green-500/40 bg-green-500/5 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Min <span className="font-semibold text-green-500">{Math.round(range.min)}</span>
              </span>
              <span className="text-sm text-green-500 font-medium">Remaining {Math.max(Math.round(range.min - current), 0)}</span>
              <span className="text-sm font-semibold">{Math.round((current / range.min) * 100)}%</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-orange-500/40 bg-orange-500/5 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Max <span className="font-semibold text-orange-500">{Math.round(range.max)}</span>
              </span>
              <span className="text-sm text-orange-500 font-medium">Remaining {Math.max(Math.round(range.max - current), 0)}</span>
              <span className="text-sm font-semibold">{Math.round((current / range.max) * 100)}%</span>
            </div>
          </div>
        </>
      )}
    </CardContent>
  </Card>
);
