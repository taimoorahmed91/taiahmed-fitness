import { cn } from '@/lib/utils';
import { Range, rangeStatus } from '@/lib/targets';

export const TargetRangeBar = ({ current, range, className }: { current: number; range: Range; className?: string }) => {
  const scale = Math.max(range.max * 1.15, current, 1);
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const status = rangeStatus(current, range);
  const fill = status === 'under' ? 'bg-amber-500' : status === 'within' ? 'bg-green-500' : 'bg-destructive';
  return (
    <div className={cn('relative pt-1 pb-5', className)}>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div className={cn('h-full transition-all', fill)} style={{ width: pos(current) }} />
      </div>
      {[{ v: range.min, l: 'Min' }, { v: range.max, l: 'Max' }].map((m, i) =>
        i === 1 && Math.round(range.max) === Math.round(range.min) ? null : (
          <div key={m.l} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: pos(m.v) }}>
            <div className="h-5 w-0.5 bg-foreground" />
            <span className="text-[10px] text-muted-foreground leading-none mt-0.5">{m.l}</span>
          </div>
        )
      )}
    </div>
  );
};
