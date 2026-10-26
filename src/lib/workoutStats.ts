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

export type PersonalRecord = {
  exercise: string;
  weight: number;
  reps: number;
  date: string;
  template: string;
  sessions: number;
};

type SessionLike = { exercise: string; date: string; notes?: string };

/**
 * All-time PR per exercise from saved session notes ("1.Name: S1:10@55kg ...").
 * Heaviest working set wins; ties go to more reps, then the earliest date.
 */
export const personalRecords = (sessions: SessionLike[]): PersonalRecord[] => {
  const map: Record<string, PersonalRecord> = {};
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((s) => {
    if (!s.notes) return;
    s.notes.split(' | ').forEach((part) => {
      const cleaned = part.replace(/^\d+\./, '');
      const colon = cleaned.indexOf(':');
      if (colon === -1) return;
      const name = cleaned.substring(0, colon).trim();
      if (!name || /^Start$/i.test(name)) return;
      const re = /S[1-6]:(\d+)@(\d+(?:[.,]\d+)?)kg/g;
      let m: RegExpExecArray | null;
      let counted = false;
      while ((m = re.exec(cleaned.substring(colon + 1)))) {
        const reps = parseInt(m[1], 10);
        const weight = parseFloat(m[2].replace(',', '.'));
        if (!(reps > 0 && weight > 0)) continue;
        const cur = map[name] || { exercise: name, weight: 0, reps: 0, date: '', template: '', sessions: 0 };
        if (!counted) { cur.sessions += 1; counted = true; }
        if (weight > cur.weight || (weight === cur.weight && reps > cur.reps)) {
          Object.assign(cur, { weight, reps, date: s.date, template: s.exercise });
        }
        map[name] = cur;
      }
    });
  });
  return Object.values(map).sort((a, b) => a.exercise.localeCompare(b.exercise));
};
