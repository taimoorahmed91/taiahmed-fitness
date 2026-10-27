// Pure cross-metric analytics: recovery vs gym, sleep vs nutrition, body recomposition.
// All dates are ISO YYYY-MM-DD strings; days are joined by exact date.

export const DEFAULT_RECOVERY_CUTOFF = 66;
export const DEFAULT_SLEEP_CUTOFF = 6.5;
export const MIN_COHORT_DAYS = 3;

type Session = { date: string; duration: number; notes?: string };
type Recovery = { date: string; recovery_score: number | null };
type Sleep = { date: string; hours: number };
type MealLike = { date: string; calories: number; carbs?: number | null };
type Measure = { date: string; value: number };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

export const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Working-set tonnage from saved notes ("S1:10@55kg"); warmups (W:) excluded. */
export const sessionVolume = (notes?: string) => {
  if (!notes) return 0;
  let total = 0;
  const re = /S[1-6]:(\d+)@(\d+(?:[.,]\d+)?)kg/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(notes))) total += parseInt(m[1], 10) * parseFloat(m[2].replace(',', '.'));
  return total;
};

export type RecoveryGymResult = {
  highDays: number; lowDays: number;
  highDuration: number; lowDuration: number;
  highVolume: number; lowVolume: number;
  durationDeltaPct: number; volumeDeltaPct: number;
};

/** Compares workouts on days at/above the recovery cutoff vs below it. Null when a cohort is too small. */
export const analyzeRecoveryVsGym = (recovery: Recovery[], sessions: Session[], cutoff = DEFAULT_RECOVERY_CUTOFF): RecoveryGymResult | null => {
  const score = new Map<string, number>();
  recovery.forEach(r => { if (r.recovery_score != null) score.set(r.date, r.recovery_score); });
  const byDay = new Map<string, { duration: number; volume: number }>();
  sessions.forEach(s => {
    const cur = byDay.get(s.date) || { duration: 0, volume: 0 };
    cur.duration += s.duration || 0;
    cur.volume += sessionVolume(s.notes);
    byDay.set(s.date, cur);
  });
  const high: { duration: number; volume: number }[] = [];
  const low: { duration: number; volume: number }[] = [];
  byDay.forEach((v, date) => {
    const r = score.get(date);
    if (r == null) return;
    (r >= cutoff ? high : low).push(v);
  });
  if (high.length < MIN_COHORT_DAYS || low.length < MIN_COHORT_DAYS) return null;
  const highDuration = avg(high.map(h => h.duration));
  const lowDuration = avg(low.map(l => l.duration));
  const highVolume = avg(high.map(h => h.volume));
  const lowVolume = avg(low.map(l => l.volume));
  return {
    highDays: high.length, lowDays: low.length,
    highDuration, lowDuration, highVolume, lowVolume,
    durationDeltaPct: pct(highDuration, lowDuration),
    volumeDeltaPct: pct(highVolume, lowVolume),
  };
};

export type SleepNutritionResult = {
  shortDays: number; normalDays: number;
  shortCarbs: number; normalCarbs: number;
  shortCalories: number; normalCalories: number;
  carbDeltaPct: number; calorieDelta: number;
};

/**
 * Sleep logged on date D is the night before day D's meals (same convention as the sleep page).
 * Carbs average only meals that have carbs recorded; missing carbs are unknown, not zero.
 */
export const analyzeSleepVsNutrition = (sleep: Sleep[], meals: MealLike[], cutoff = DEFAULT_SLEEP_CUTOFF): SleepNutritionResult | null => {
  const day = new Map<string, { calories: number; carbs: number; carbKnown: boolean }>();
  meals.forEach(m => {
    const cur = day.get(m.date) || { calories: 0, carbs: 0, carbKnown: false };
    cur.calories += m.calories || 0;
    if (m.carbs != null) { cur.carbs += m.carbs; cur.carbKnown = true; }
    day.set(m.date, cur);
  });
  const short: typeof day extends Map<string, infer V> ? V[] : never = [];
  const normal: typeof short = [];
  sleep.forEach(s => {
    const d = day.get(s.date);
    if (!d || !(s.hours > 0)) return;
    (s.hours < cutoff ? short : normal).push(d);
  });
  if (short.length < MIN_COHORT_DAYS || normal.length < MIN_COHORT_DAYS) return null;
  const shortCarbs = avg(short.filter(d => d.carbKnown).map(d => d.carbs));
  const normalCarbs = avg(normal.filter(d => d.carbKnown).map(d => d.carbs));
  const shortCalories = avg(short.map(d => d.calories));
  const normalCalories = avg(normal.map(d => d.calories));
  return {
    shortDays: short.length, normalDays: normal.length,
    shortCarbs, normalCarbs, shortCalories, normalCalories,
    carbDeltaPct: pct(shortCarbs, normalCarbs),
    calorieDelta: shortCalories - normalCalories,
  };
};

export type RecompStatus = 'recomp' | 'fat_loss' | 'surplus' | 'muscle_loss_risk' | 'stable' | 'insufficient';

export type RecompResult = {
  status: RecompStatus;
  weightDelta: number | null;
  waistDelta: number | null;
  weightDeltaPct: number | null;
  waistDeltaPct: number | null;
};

const windowDelta = (entries: Measure[], since: string, until: string) => {
  const inRange = entries.filter(e => e.date >= since && e.date <= until && e.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (inRange.length < 2) return null;
  const first = inRange[0].value;
  const last = inRange[inRange.length - 1].value;
  return { delta: last - first, pct: pct(last, first) };
};

/** Flat means within ±1% over the window. */
export const FLAT_PCT = 1;

export const classifyRecomp = (weightPct: number, waistPct: number): RecompStatus => {
  const w = weightPct > FLAT_PCT ? 'up' : weightPct < -FLAT_PCT ? 'down' : 'flat';
  const v = waistPct > FLAT_PCT ? 'up' : waistPct < -FLAT_PCT ? 'down' : 'flat';
  if (v === 'down' && w !== 'down') return 'recomp';
  if (v === 'down' && w === 'down') return 'fat_loss';
  if (w === 'down') return 'muscle_loss_risk';
  if (w === 'up' || v === 'up') return 'surplus';
  return 'stable';
};

export const computeBodyRecomposition = (weight: Measure[], waist: Measure[], days = 30, today = new Date().toISOString().slice(0, 10)): RecompResult => {
  const since = shiftDate(today, -(days - 1));
  const w = windowDelta(weight, since, today);
  const v = windowDelta(waist, since, today);
  return {
    status: w && v ? classifyRecomp(w.pct, v.pct) : 'insufficient',
    weightDelta: w?.delta ?? null,
    waistDelta: v?.delta ?? null,
    weightDeltaPct: w?.pct ?? null,
    waistDeltaPct: v?.pct ?? null,
  };
};

export const RECOMP_LABELS: Record<RecompStatus, { label: string; message: string; tone: 'good' | 'info' | 'warn' | 'bad' | 'muted' }> = {
  recomp: { label: 'Optimal recomposition', message: 'Waist is shrinking while weight holds — losing fat while keeping lean mass.', tone: 'good' },
  fat_loss: { label: 'Fat loss', message: 'Weight and waist are both dropping — a steady deficit.', tone: 'info' },
  surplus: { label: 'Surplus / mass phase', message: 'Weight or waist is rising — keep an eye on waist against your goals.', tone: 'warn' },
  muscle_loss_risk: { label: 'Muscle loss risk', message: 'Weight is dropping without the waist following — check your protein intake.', tone: 'bad' },
  stable: { label: 'Stable', message: 'Weight and waist are both holding steady.', tone: 'muted' },
  insufficient: { label: 'Not enough data', message: 'Log at least two weigh-ins and two waist measurements in this period.', tone: 'muted' },
};

// ---- Weekly executive digest -------------------------------------------------

type Dated = { date: string };
export type DigestInput = {
  meals: (Dated & { calories: number; protein?: number | null })[];
  gym: (Dated & { duration: number; notes?: string | null })[];
  weight: (Dated & { value: number })[];
  waist: (Dated & { value: number })[];
  sleep: (Dated & { hours: number })[];
  recovery: (Dated & { score: number | null })[];
};
export type DigestWeek = {
  workouts: number; minutes: number; tonnage: number;
  avgCalories: number | null; avgProtein: number | null;
  weightDelta: number | null; waistDelta: number | null;
  avgSleep: number | null; avgRecovery: number | null;
};

const shiftIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const delta = (rows: (Dated & { value: number })[]) => {
  const s = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return s.length >= 2 ? Math.round((s[s.length - 1].value - s[0].value) * 10) / 10 : null;
};
const setVolume = (notes?: string | null) => {
  if (!notes) return 0;
  let v = 0;
  const re = /S[1-6]:(\d+)@(\d+(?:[.,]\d+)?)kg/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(notes))) v += parseInt(m[1], 10) * parseFloat(m[2].replace(',', '.'));
  return v;
};

const digestWeek = (input: DigestInput, from: string, to: string): DigestWeek => {
  const inRange = <T extends Dated>(xs: T[]) => xs.filter((x) => x.date >= from && x.date <= to);
  const gym = inRange(input.gym);
  const perDay: Record<string, { cal: number; protein: number }> = {};
  inRange(input.meals).forEach((m) => {
    const d = (perDay[m.date] ||= { cal: 0, protein: 0 });
    d.cal += m.calories; d.protein += m.protein || 0;
  });
  const days = Object.values(perDay);
  const sleepByDay: Record<string, number> = {};
  inRange(input.sleep).forEach((s) => { sleepByDay[s.date] = Math.max(sleepByDay[s.date] || 0, s.hours); });
  return {
    workouts: gym.length,
    minutes: gym.reduce((t, g) => t + g.duration, 0),
    tonnage: Math.round(gym.reduce((t, g) => t + setVolume(g.notes), 0)),
    avgCalories: avg1(days.map((d) => d.cal)) == null ? null : Math.round(avg1(days.map((d) => d.cal))!),
    avgProtein: avg1(days.map((d) => d.protein)) == null ? null : Math.round(avg1(days.map((d) => d.protein))!),
    weightDelta: delta(inRange(input.weight)),
    waistDelta: delta(inRange(input.waist)),
    avgSleep: avg1(Object.values(sleepByDay)),
    avgRecovery: avg1(inRange(input.recovery).map((r) => r.score).filter((s): s is number => s != null)),
  };
};

/** This week = the 7 UTC days ending today; previous = the 7 days before it. */
export const weeklyDigest = (input: DigestInput, today: string) => ({
  current: digestWeek(input, shiftIso(today, -6), today),
  previous: digestWeek(input, shiftIso(today, -13), shiftIso(today, -7)),
});
