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
        <div
          className="absolute inset-y-0 right-0"
          style={{
            left: pos(range.max),
            backgroundImage: 'repeating-linear-gradient(45deg, rgba(234,88,12,0.35) 0 3px, transparent 3px 7px)',
          }}
        />
      </div>
      {[{ v: range.min, l: 'Min', c: 'bg-green-500', t: 'text-green-500' }, { v: range.max, l: 'Max', c: 'bg-orange-500', t: 'text-orange-500' }].map((m, i) =>
        i === 1 && Math.round(range.max) === Math.round(range.min) ? null : (
          <div key={m.l} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: pos(m.v) }}>
            <div className={cn('h-5 w-0.5', m.c)} />
            <span className={cn('text-[10px] leading-none mt-0.5 font-medium', m.t)}>{m.l}</span>
          </div>
        )
      )}
    </div>
  );
};
