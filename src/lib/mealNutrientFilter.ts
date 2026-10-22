export interface NutrientFilterValue {
  mode: 'range' | 'exact';
  min: string;
  max: string;
}

export const emptyNutrientFilter = (): NutrientFilterValue => ({ mode: 'range', min: '', max: '' });

export const normalizeNutrientInput = (value: string) => value.replace(/,/g, '.');

export const validNutrientInput = (value: string) => /^\d*\.?\d*$/.test(value);

const numberValue = (value: string) => value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export const nutrientRangeInvalid = (filter: NutrientFilterValue) => {
  const min = numberValue(filter.min);
  const max = numberValue(filter.max);
  return filter.mode === 'range' && min !== null && max !== null && min > max;
};

export const matchesNutrientFilter = (value: number | null | undefined, filter: NutrientFilterValue): boolean => {
  const min = numberValue(filter.min);
  const max = filter.mode === 'exact' ? min : numberValue(filter.max);
  if (min === null && max === null) return true;
  if (value == null || !Number.isFinite(value) || nutrientRangeInvalid(filter)) return false;
  return (min === null || value >= min) && (max === null || value <= max);
};