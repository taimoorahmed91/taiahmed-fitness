import { cn } from '@/lib/utils';
import { BMI_BANDS, bmiBandIndex, bmiMarkerPercent, computeBmi, formatNumber } from './model';

/**
 * BMI from the height being typed and the latest logged weight, with the four standard bands.
 * Each band has a colour role, a glyph and a name, so the result reads without colour.
 */
export const BmiMeter = ({ heightCm, weightKg }: { heightCm: number | null; weightKg: number | null }) => {
  const bmi = computeBmi(heightCm, weightKg);
  const activeIdx = bmiBandIndex(bmi);
  const activeBand = activeIdx >= 0 ? BMI_BANDS[activeIdx] : null;

  if (bmi === null) {
    return <p className="text-sm text-muted-foreground">Enter your height and log a weight entry to see your BMI.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-bold tabular-nums">{bmi.toFixed(1)}</span>
        {activeBand && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-background', activeBand.fill)}>
            <span aria-hidden="true">{activeBand.glyph}</span>
            {activeBand.label}
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          from {formatNumber(weightKg as number)} kg and {formatNumber(heightCm as number)} cm
        </span>
      </div>

      {/* The band names and ranges below, plus the marker position, give the same answer as the colours. */}
      <div aria-hidden="true" className="relative flex h-3 gap-0.5 rounded-full">
        {BMI_BANDS.map((band, i) => (
          <div
            key={band.label}
            className={cn(
              'flex-1',
              band.fill,
              i === 0 && 'rounded-l-full',
              i === BMI_BANDS.length - 1 && 'rounded-r-full',
              i !== activeIdx && 'opacity-60',
            )}
          />
        ))}
        <div
          className="absolute -top-1 h-5 w-1 rounded bg-foreground ring-2 ring-background"
          style={{ left: `calc(${bmiMarkerPercent(bmi)}% - 2px)` }}
        />
      </div>
      <ul className="grid grid-cols-2 gap-1 text-center text-xs text-muted-foreground sm:grid-cols-4">
        {BMI_BANDS.map((band, i) => (
          <li
            key={band.label}
            aria-current={i === activeIdx ? 'true' : undefined}
            className={cn('rounded-md px-1 py-1', i === activeIdx && 'border border-foreground/40 bg-muted/60')}
          >
            <div className="font-medium text-foreground">
              <span aria-hidden="true">{band.glyph} </span>{band.label}
            </div>
            <div>{band.range}</div>
            {i === activeIdx && <div className="font-semibold text-foreground">Your BMI</div>}
          </li>
        ))}
      </ul>
    </div>
  );
};
