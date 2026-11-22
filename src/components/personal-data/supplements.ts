export interface Supplement {
  id: string;
  name: string;
  usage: string;
  days: number[];
}

/** Keep account data safe to render, including backups made before supplements existed. */
export function readSupplements(value: unknown): Supplement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.usage !== 'string') return [];
    const days = Array.isArray(item.days)
      ? [...new Set<number>(item.days.filter((day: unknown): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6))]
      : [];
    return [{ id: item.id, name: item.name, usage: item.usage, days }];
  });
}

export function findSupplementError(supplements: readonly Supplement[]): string | null {
  for (const supplement of supplements) {
    if (!supplement.name.trim()) return 'Enter a name for each supplement.';
    if (!supplement.usage.trim()) return `Enter a dose or usage for ${supplement.name.trim()}.`;
    if (supplement.days.length === 0) return `Choose at least one day for ${supplement.name.trim()}.`;
  }
  return null;
}