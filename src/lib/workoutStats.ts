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
export const personalRecords = (sessions: SessionLike[], aliases: Record<string, string> = {}): PersonalRecord[] => {
  const map: Record<string, PersonalRecord> = {};
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((s) => {
    if (!s.notes) return;
    const counted = new Set<string>();
    s.notes.split(' | ').forEach((part) => {
      const cleaned = part.replace(/^\d+\./, '');
      const colon = cleaned.indexOf(':');
      if (colon === -1) return;
      const raw = cleaned.substring(0, colon).trim();
      if (!raw || /^Start$/i.test(raw)) return;
      const name = aliases[raw] || raw;
      const re = /S[1-6]:(\d+)@(\d+(?:[.,]\d+)?)kg/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(cleaned.substring(colon + 1)))) {
        const reps = parseInt(m[1], 10);
        const weight = parseFloat(m[2].replace(',', '.'));
        if (!(reps > 0 && weight > 0)) continue;
        const cur = map[name] || { exercise: name, weight: 0, reps: 0, date: '', template: '', sessions: 0 };
        if (!counted.has(name)) { cur.sessions += 1; counted.add(name); }
        if (weight > cur.weight || (weight === cur.weight && reps > cur.reps)) {
          Object.assign(cur, { weight, reps, date: s.date, template: s.exercise });
        }
        map[name] = cur;
      }
    });
  });
  return Object.values(map).sort((a, b) => a.exercise.localeCompare(b.exercise));
};

export type HistorySet = { reps: number; weight: number };
export type ExerciseHistoryEntry = { date: string; template: string; sets: HistorySet[]; topWeight: number; volume: number };

const parseNoteParts = (notes: string, aliases: Record<string, string>) => {
  const out: { name: string; sets: HistorySet[] }[] = [];
  notes.split(' | ').forEach((part) => {
    const cleaned = part.replace(/^\d+\./, '');
    const colon = cleaned.indexOf(':');
    if (colon === -1) return;
    const raw = cleaned.substring(0, colon).trim();
    if (!raw || /^Start$/i.test(raw)) return;
    const sets: HistorySet[] = [];
    const re = /S[1-6]:(\d+)@(\d+(?:[.,]\d+)?)kg/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned.substring(colon + 1)))) {
      const reps = parseInt(m[1], 10);
      const weight = parseFloat(m[2].replace(',', '.'));
      if (reps > 0 && weight > 0) sets.push({ reps, weight });
    }
    out.push({ name: aliases[raw] || raw, sets });
  });
  return out;
};

/** Oldest-first session timeline for one exercise (aliases merged), working sets only. */
export const exerciseHistory = (sessions: SessionLike[], exercise: string, aliases: Record<string, string> = {}): ExerciseHistoryEntry[] =>
  [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((s) => {
      if (!s.notes) return [];
      const sets = parseNoteParts(s.notes, aliases).filter((p) => p.name === exercise).flatMap((p) => p.sets);
      if (!sets.length) return [];
      return [{
        date: s.date,
        template: s.exercise,
        sets,
        topWeight: Math.max(...sets.map((x) => x.weight)),
        volume: sets.reduce((t, x) => t + x.reps * x.weight, 0),
      }];
    });

/** Total working-set volume (reps × kg) recorded in one saved session's notes. */
export const notesVolume = (notes: string | undefined): number =>
  notes ? parseNoteParts(notes, {}).reduce((t, p) => t + p.sets.reduce((u, x) => u + x.reps * x.weight, 0), 0) : 0;

/** Volume change vs the previous session; null when there is no prior volume to compare. */
export const volumeChange = (current: number, previous: number | null | undefined) =>
  previous && previous > 0 ? { diff: current - previous, pct: Math.round(((current - previous) / previous) * 1000) / 10 } : null;

export type Readiness = 'high' | 'medium' | 'low';
/** WHOOP bands: high ≥ 67, medium 34–66, low ≤ 33. */
export const readinessLevel = (score: number | null | undefined): Readiness | null =>
  score == null || !Number.isFinite(score) ? null : score >= 67 ? 'high' : score >= 34 ? 'medium' : 'low';
