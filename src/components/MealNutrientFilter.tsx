import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NutrientFilterValue, normalizeNutrientInput, validNutrientInput, nutrientRangeInvalid } from '@/lib/mealNutrientFilter';

interface Props {
  label: string;
  unit: string;
  value: NutrientFilterValue;
  onChange: (value: NutrientFilterValue) => void;
}

export const MealNutrientFilter = ({ label, unit, value, onChange }: Props) => {
  const id = `meal-filter-${label.toLowerCase()}`;
  const update = (field: 'min' | 'max', input: string) => {
    const normalized = normalizeNutrientInput(input);
    if (validNutrientInput(normalized)) onChange({ ...value, [field]: normalized });
  };
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={`${id}-min`}>{label} <span className="text-muted-foreground">({unit})</span></Label>
      <Select value={value.mode} onValueChange={(mode: 'range' | 'exact') => onChange({ ...value, mode })}>
        <SelectTrigger aria-label={`${label} filter mode`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="range">Range</SelectItem>
          <SelectItem value="exact">Exact value</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Input id={`${id}-min`} type="text" inputMode="decimal" placeholder={value.mode === 'exact' ? 'Value' : 'Min'}
          aria-label={`${label} ${value.mode === 'exact' ? 'value' : 'minimum'}`} value={value.min}
          onChange={(e) => update('min', e.target.value)} maxLength={12} />
        {value.mode === 'range' && (
          <>
            <span className="text-muted-foreground">–</span>
            <Input type="text" inputMode="decimal" placeholder="Max" aria-label={`${label} maximum`}
              value={value.max} onChange={(e) => update('max', e.target.value)} maxLength={12} />
          </>
        )}
      </div>
      {nutrientRangeInvalid(value) && <p role="alert" className="text-xs text-destructive">Max must be at least Min.</p>}
    </div>
  );
};