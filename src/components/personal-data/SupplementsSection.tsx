import { Pill, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { SettingsSection } from './SettingsSection';
import { SettingsRow, FieldLabel } from './SettingsRow';
import { WEEKDAYS } from './model';
import type { Supplement } from './supplements';

interface Props {
  supplements: Supplement[];
  onChange: (supplements: Supplement[]) => void;
  disabled?: boolean;
}

export function SupplementsSection({ supplements, onChange, disabled }: Props) {
  const update = (id: string, patch: Partial<Supplement>) =>
    onChange(supplements.map((supplement) => supplement.id === id ? { ...supplement, ...patch } : supplement));

  return (
    <SettingsSection id="supplements" title="Supplements" icon={Pill}>
      {supplements.length === 0 && <p className="pb-4 text-sm text-muted-foreground">No supplements added.</p>}
      {supplements.map((supplement, index) => (
        <SettingsRow key={supplement.id} label={`Supplement ${index + 1}`} htmlFor={`supplement-name-${supplement.id}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor={`supplement-name-${supplement.id}`}>Name</FieldLabel>
                <Input id={`supplement-name-${supplement.id}`} value={supplement.name} disabled={disabled}
                  placeholder="e.g. Creatine" onChange={(event) => update(supplement.id, { name: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor={`supplement-usage-${supplement.id}`}>Dose / usage</FieldLabel>
                <Input id={`supplement-usage-${supplement.id}`} value={supplement.usage} disabled={disabled}
                  placeholder="e.g. 5 g or 1 capsule with food" onChange={(event) => update(supplement.id, { usage: event.target.value })} />
              </div>
            </div>
            <ConfirmDeleteButton variant="ghost" size="icon" disabled={disabled}
              confirmationTitle={`Remove ${supplement.name.trim() || 'supplement'}?`}
              confirmationDescription="Remove this supplement and its weekly schedule? Save your changes to update your account."
              onConfirm={() => onChange(supplements.filter((item) => item.id !== supplement.id))}>
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </ConfirmDeleteButton>
          </div>
          <fieldset className="min-w-0 space-y-1.5" disabled={disabled}>
            <legend className="text-xs font-medium text-muted-foreground">Days to take</legend>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((day) => (
                <Button key={day.v} type="button" variant={supplement.days.includes(day.v) ? 'default' : 'outline'}
                  aria-label={`${day.long} for ${supplement.name || `supplement ${index + 1}`}`}
                  aria-pressed={supplement.days.includes(day.v)} disabled={disabled}
                  className="min-h-11 min-w-0 px-0 text-xs"
                  onClick={() => update(supplement.id, { days: supplement.days.includes(day.v)
                    ? supplement.days.filter((value) => value !== day.v) : [...supplement.days, day.v] })}>
                  {day.short}
                </Button>
              ))}
            </div>
          </fieldset>
        </SettingsRow>
      ))}
      <div className="pt-4">
        <Button type="button" variant="outline" disabled={disabled} onClick={() =>
          onChange([...supplements, { id: crypto.randomUUID(), name: '', usage: '', days: [] }])}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add supplement
        </Button>
      </div>
    </SettingsSection>
  );
}