// Pure workout math: session volume and all-time personal records.

type SetLike = Record<string, string | undefined>;
const SET_KEYS = ['set1', 'set2', 'set3', 'set4', 'set5', 'set6'] as const;

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Working-set volume (reps x kg) for one exercise; warmups are excluded. */
export const exerciseVolume = (sets: SetLike | undefined, defaultWeight = ''): number => {
  if (!sets) return 0;
  return SET_KEYS.reduce((sum, k) => {
    const reps = num(sets[k]);
    const weight = num(sets[`${k}Weight`] || defaultWeight);
    return sum + reps * weight;
  }, 0);
};

/** Heaviest working-set weight (with at least one rep) in a sets object. */
export const heaviestSet = (sets: SetLike | undefined): number => {
  if (!sets) return 0;
  return SET_KEYS.reduce((best, k) => (num(sets[k]) > 0 ? Math.max(best, num(sets[`${k}Weight`])) : best), 0);
};

/** Best weights per exercise name across many parsed sessions. */
export const bestWeights = (sessions: Record<string, SetLike>[]): Record<string, number> => {
  const best: Record<string, number> = {};
  sessions.forEach((s) =>
    Object.entries(s).forEach(([name, sets]) => {
      const w = heaviestSet(sets);
      if (w > (best[name] || 0)) best[name] = w;
    }),
  );
  return best;
};

/** A PR needs history for the exercise and a strictly heavier working set. */
export const isPersonalRecord = (current: SetLike | undefined, previousBest: number | undefined): boolean =>
  !!previousBest && previousBest > 0 && heaviestSet(current) > previousBest;
