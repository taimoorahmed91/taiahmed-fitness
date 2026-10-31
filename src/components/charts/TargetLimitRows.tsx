import { STATUS_META, describeLimit } from '@/lib/targetStatus';
import { formatNumber } from '@/lib/chartTheme';
import { cn } from '@/lib/utils';

const Row = ({ kind, value, current, unit }: { kind: 'min' | 'max'; value: number; current: number; unit: string }) => {
  const meta = kind === 'min' ? STATUS_META.within : STATUS_META.over;
  const { text, pct } = describeLimit(current, value, kind, unit);
  return (
    <div className={cn('flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm', meta.border, meta.tint)}>
      <span className="text-muted-foreground">
        {kind === 'min' ? 'Min' : 'Max'} <span className={cn('font-semibold', meta.text)}>{formatNumber(Math.round(value), 0)} {unit}</span>
      </span>
      <span className={cn('font-medium', meta.text)}>{text}</span>
      <span className="font-semibold tabular-nums">{pct}%</span>
    </div>
  );
};

/** The Min / Max rows under a target bar. Min uses the "on target" colour, Max the "over" colour. */
export const TargetLimitRows = ({ current, min, max, unit }: { current: number; min: number; max: number; unit: string }) => (
  <div className="space-y-2">
    <Row kind="min" value={min} current={current} unit={unit} />
    <Row kind="max" value={max} current={current} unit={unit} />
  </div>
);
