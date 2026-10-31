import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { InlineError } from './InlineError';
import { FieldLabel, SettingsRow } from './SettingsRow';
import { SpokenText } from './SpokenText';
import { effectiveRange, formatNumber, formatRangeText, gramsPerDay, isRangeInverted } from './model';

export interface RangeFieldProps {
  /** The target's name, for example "Gym day calories". */
  label: string;
  /** One sentence on what the range is used for. */
  description: string;
  /** Unit written in both input labels and after the value in use, for example "kcal" or "g/kg". */
  unit: string;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
  placeholders: [string, string];
  /** Said when no minimum is set. */
  emptyNote: string;
  /** When given (grams per kg fields), the grams a day this range means at that body weight is shown too. */
  bodyWeightKg?: number | null;
  /** The saved history, shown under the range. */
  history?: ReactNode;
}

/**
 * A minimum and a maximum that belong together: one labelled group, both units visible, the range that will
 * actually be used written out ("In use: 2,300–2,600 kcal"), and the error shown right under the inputs.
 */
export const RangeField = ({
  label, description, unit, min, max, onMin, onMax, placeholders, emptyNote, bodyWeightKg, history,
}: RangeFieldProps) => {
  const uid = useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const inUseId = `${uid}-in-use`;
  const invalid = isRangeInverted(min, max);
  const describedBy = [hintId, invalid ? errorId : null, invalid ? null : inUseId].filter(Boolean).join(' ');

  const inUse = invalid ? null : effectiveRange(min, max);
  const grams = unit === 'g/kg' ? gramsPerDay(inUse, bodyWeightKg ?? null) : null;

  return (
    <SettingsRow label={label} labelId={labelId} description={description} descriptionId={hintId}>
      <div role="group" aria-labelledby={labelId} className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor={`${uid}-min`}>Min ({unit})</FieldLabel>
            <Input
              id={`${uid}-min`}
              inputMode="decimal"
              value={min}
              onChange={(e) => onMin(e.target.value)}
              placeholder={placeholders[0]}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={cn(invalid && 'border-destructive')}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor={`${uid}-max`}>Max ({unit})</FieldLabel>
            <Input
              id={`${uid}-max`}
              inputMode="decimal"
              value={max}
              onChange={(e) => onMax(e.target.value)}
              placeholder={placeholders[1]}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={cn(invalid && 'border-destructive')}
            />
          </div>
        </div>
        <InlineError id={errorId} message={invalid ? 'Max must be the same as or higher than Min.' : null} />
        {!invalid && (
          <p id={inUseId} className="text-sm text-muted-foreground">
            {inUse ? (
              <>
                In use: <strong className="font-semibold text-foreground"><SpokenText value={formatRangeText(inUse, unit)} /></strong>
                {grams && bodyWeightKg ? (
                  <> &middot; about <SpokenText value={formatRangeText(grams, 'g a day')} /> at {formatNumber(bodyWeightKg)} kg</>
                ) : null}
                {inUse.min === inUse.max && max.trim() === '' ? ' (Max is empty, so Min is used)' : null}
              </>
            ) : (
              emptyNote
            )}
          </p>
        )}
        {history}
      </div>
    </SettingsRow>
  );
};
