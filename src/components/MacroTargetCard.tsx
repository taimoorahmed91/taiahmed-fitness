import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TargetRangeBar } from '@/components/TargetRangeBar';
import { TargetLimitRows } from '@/components/charts/TargetLimitRows';
import { Range } from '@/lib/targets';
import { STATUS_META, describeTarget } from '@/lib/targetStatus';
import { formatNumber } from '@/lib/chartTheme';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  icon: ReactNode;
  range: Range | null;
  current: number;
  emptyText: string;
  /** Defaults to grams, which is what the macro cards use. */
  unit?: string;
}

export const MacroTargetCard = ({ title, icon, range, current, emptyText, unit = 'g' }: Props) => {
  const status = range ? describeTarget(current, range, unit) : null;
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><span aria-hidden="true" className="contents">{icon}</span>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {range === null || status === null ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <>
            <TargetRangeBar current={current} range={range} unit={unit} label={`${title} against target`} />
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-sm text-muted-foreground">Consumed</span>
              <span className="text-2xl font-bold text-primary">{formatNumber(Math.round(current), 0)} <span className="text-sm font-medium text-muted-foreground">{unit}</span></span>
            </div>
            <p className={cn('flex items-center gap-1.5 text-sm font-medium', STATUS_META[status.status].text)}>
              <span aria-hidden="true">{STATUS_META[status.status].glyph}</span>
              <span>{status.text}</span>
            </p>
            <TargetLimitRows current={current} min={range.min} max={range.max} unit={unit} />
          </>
        )}
      </CardContent>
    </Card>
  );
};
