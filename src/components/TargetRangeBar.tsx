import { cn } from '@/lib/utils';
import { Range } from '@/lib/targets';
import { STATUS_META, describeTarget } from '@/lib/targetStatus';
import { formatNumber } from '@/lib/chartTheme';

interface TargetRangeBarProps {
  current: number;
  range: Range;
  className?: string;
  /** Unit for the screen-reader text, e.g. "cal" or "g". */
  unit?: string;
  /** What the bar measures, for screen readers. */
  label?: string;
}

/**
 * Fill colour = status (under min: amber, on target: green, over max: red).
 * The bar shows where the limits sit (thin ticks at their true positions); the words and numbers
 * live in a plain row underneath, Min on the left and Max on the right. Labels never depend on
 * how close the two values are, so "2,000" and "2,200" can never overlap at any width. The status is
 * also announced as text, so nothing depends on colour alone.
 */
export const TargetRangeBar = ({ current, range, className, unit = '', label = 'Intake against target' }: TargetRangeBarProps) => {
  const scale = Math.max(range.max * 1.15, current, 1);
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const { status, text } = describeTarget(current, range, unit);
  const fill = STATUS_META[status].fill;
  const single = Math.round(range.max) === Math.round(range.min);
  const amount = (v: number) => `${formatNumber(Math.round(v), 0)}${unit ? ` ${unit}` : ''}`;
  const limits = single
    ? [{ key: 'target', word: 'Target', value: range.max, tick: 'bg-chart-min' }]
    : [
        { key: 'min', word: 'Min', value: range.min, tick: 'bg-chart-min' },
        { key: 'max', word: 'Max', value: range.max, tick: 'bg-chart-max' },
      ];
  return (
    <div className={cn('relative pt-1', className)}>
      <div className="relative">
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={Math.round(scale)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${Math.round(current)}${unit ? ` ${unit}` : ''}. ${text}`}
          className="relative h-3 w-full overflow-hidden rounded-full bg-progress-track"
        >
          <div className={cn('h-full transition-all motion-reduce:transition-none', fill)} style={{ width: pos(current) }} />
          <div
            className="absolute inset-y-0 right-0"
            style={{
              left: pos(range.max),
              backgroundImage: 'repeating-linear-gradient(45deg, hsl(var(--chart-max) / 0.35) 0 3px, transparent 3px 7px)',
            }}
          />
        </div>
        {limits.map((m) => (
          <div
            key={m.key}
            aria-hidden="true"
            data-limit-tick={m.key}
            className={cn('pointer-events-none absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded-full', m.tick)}
            style={{ left: pos(m.value) }}
          />
        ))}
      </div>
      <dl data-limit-labels className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs leading-tight">
        {limits.map((m) => (
          <div key={m.key} data-limit-label={m.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('h-3 w-0.5 shrink-0 rounded-full', m.tick)} />
            <dt className="font-medium text-foreground">{m.word}</dt>
            <dd className="m-0 tabular-nums text-muted-foreground">{amount(m.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
