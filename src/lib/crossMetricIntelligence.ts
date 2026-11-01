// Pure cross-metric analytics: recovery vs gym, sleep vs nutrition, body recomposition.
// All dates are ISO YYYY-MM-DD strings; days are joined by exact date.

export const DEFAULT_RECOVERY_CUTOFF = 66;
export const DEFAULT_SLEEP_CUTOFF = 6.5;
export const MIN_COHORT_DAYS = 3;

type Session = { date: string; duration: number; notes?: string };
type Recovery = { date: string; recovery_score: number | null; /** Orders duplicate rows for one date: the latest wins. */ stamp?: string | null };
type Sleep = { date: string; hours: number };
type MealLike = { date: string; calories: number; carbs?: number | null };
type Measure = { date: string; value: number };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const avgOrNull = (xs: number[]) => (xs.length ? avg(xs) : null);
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);
const pctOrNull = (a: number | null, b: number | null) => (a == null || b == null || b <= 0 ? null : ((a - b) / b) * 100);
const byDateAsc = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

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

// ---- Evidence ---------------------------------------------------------------
// Every result below carries the exact days it was computed from, taken in the SAME pass that produced
// its numbers, so the counts shown in copy and the lists shown as evidence can never disagree.

/** Inclusive ISO date window. `null` means open-ended on that side. */
export type EvidenceWindow = { from: string | null; to: string | null };

const inWindow = (date: string, w?: Partial<EvidenceWindow>) =>
  (!w?.from || date >= w.from) && (!w?.to || date <= w.to);
const normalizeWindow = (w?: Partial<EvidenceWindow>): EvidenceWindow => ({ from: w?.from ?? null, to: w?.to ?? null });

const signed = (n: number, unit = '%') => { const r = Math.round(n); return `${r > 0 ? '+' : r < 0 ? '\u2212' : ''}${Math.abs(r)}${unit}`; };
const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`;

export type RecoveryGymDay = {
  date: string;
  /** WHOOP recovery score (%) used for this date. */
  recovery: number;
  /** Total workout minutes that date; null when no duration was logged. */
  durationMin: number | null;
  /** Working-set tonnage that date; null when the notes hold no working sets. */
  volumeKg: number | null;
  /** Workouts logged on that date (they are summed into one day). */
  sessions: number;
};

export type RecoveryGymEvidence = {
  kind: 'recovery_vs_gym';
  window: EvidenceWindow;
  /** High cohort = recovery >= cutoff; low cohort = recovery < cutoff. */
  cutoff: number;
  minCohortDays: number;
  high: RecoveryGymDay[];
  low: RecoveryGymDay[];
  /** Cohort averages. Duration and volume average only the days where that value is known. */
  averages: Record<'high' | 'low', { recovery: number; durationMin: number | null; volumeKg: number | null }>;
  /** High minus low. Null when either side has no known days for that value. */
  differences: { durationMin: number | null; durationPct: number | null; volumeKg: number | null; volumePct: number | null };
  coverage: {
    /** Distinct ISO dates with at least one workout in the window. */
    workoutDays: number;
    /** Workout dates that also had a recovery score (high + low). */
    usedDays: number;
    /** Workout dates left out because no recovery score was logged. */
    noRecoveryDays: number;
    /** Dates with more than one WHOOP row; the latest row is used. */
    duplicateRecoveryDates: number;
    highDurationDays: number; lowDurationDays: number;
    highVolumeDays: number; lowVolumeDays: number;
  };
};

export type RecoveryGymResult = {
  highDays: number; lowDays: number;
  /** Averages are over days where the metric is known (see evidence.coverage); null when none are. */
  highDuration: number | null; lowDuration: number | null;
  highVolume: number | null; lowVolume: number | null;
  durationDeltaPct: number | null; volumeDeltaPct: number | null;
  evidence: RecoveryGymEvidence;
};

/**
 * Compares workouts on days at/above the recovery cutoff vs below it. Null when a cohort is too small.
 * One day = one distinct ISO date (several workouts on a date are summed). One recovery score per date:
 * the latest row (by `stamp`, then the higher score so the result never depends on array order).
 */
export const analyzeRecoveryVsGym = (
  recovery: Recovery[], sessions: Session[], cutoff = DEFAULT_RECOVERY_CUTOFF, window?: Partial<EvidenceWindow>,
): RecoveryGymResult | null => {
  const picked = new Map<string, { score: number; stamp: string; rows: number }>();
  recovery.forEach(r => {
    if (r.recovery_score == null || !inWindow(r.date, window)) return;
    const stamp = r.stamp ?? '';
    const cur = picked.get(r.date);
    if (!cur) { picked.set(r.date, { score: r.recovery_score, stamp, rows: 1 }); return; }
    cur.rows += 1;
    if (stamp > cur.stamp || (stamp === cur.stamp && r.recovery_score > cur.score)) { cur.score = r.recovery_score; cur.stamp = stamp; }
  });
  const byDay = new Map<string, { duration: number; volume: number; sessions: number }>();
  sessions.forEach(s => {
    if (!inWindow(s.date, window)) return;
    const cur = byDay.get(s.date) || { duration: 0, volume: 0, sessions: 0 };
    cur.duration += s.duration || 0;
    cur.volume += sessionVolume(s.notes);
    cur.sessions += 1;
    byDay.set(s.date, cur);
  });
  const high: RecoveryGymDay[] = [];
  const low: RecoveryGymDay[] = [];
  let noRecoveryDays = 0;
  byDay.forEach((v, date) => {
    const r = picked.get(date);
    if (r == null) { noRecoveryDays += 1; return; }
    const day: RecoveryGymDay = {
      date, recovery: r.score,
      durationMin: v.duration > 0 ? v.duration : null,
      volumeKg: v.volume > 0 ? v.volume : null,
      sessions: v.sessions,
    };
    (r.score >= cutoff ? high : low).push(day);
  });
  if (high.length < MIN_COHORT_DAYS || low.length < MIN_COHORT_DAYS) return null;
  high.sort(byDateAsc);
  low.sort(byDateAsc);
  const known = (days: RecoveryGymDay[], key: 'durationMin' | 'volumeKg') =>
    days.map(d => d[key]).filter((v): v is number => v != null);
  const highDuration = avgOrNull(known(high, 'durationMin'));
  const lowDuration = avgOrNull(known(low, 'durationMin'));
  const highVolume = avgOrNull(known(high, 'volumeKg'));
  const lowVolume = avgOrNull(known(low, 'volumeKg'));
  return {
    highDays: high.length, lowDays: low.length,
    highDuration, lowDuration, highVolume, lowVolume,
    durationDeltaPct: pctOrNull(highDuration, lowDuration),
    volumeDeltaPct: pctOrNull(highVolume, lowVolume),
    evidence: {
      kind: 'recovery_vs_gym',
      window: normalizeWindow(window),
      cutoff,
      minCohortDays: MIN_COHORT_DAYS,
      high, low,
      averages: {
        high: { recovery: avg(high.map(d => d.recovery)), durationMin: highDuration, volumeKg: highVolume },
        low: { recovery: avg(low.map(d => d.recovery)), durationMin: lowDuration, volumeKg: lowVolume },
      },
      differences: {
        durationMin: highDuration != null && lowDuration != null ? highDuration - lowDuration : null,
        durationPct: pctOrNull(highDuration, lowDuration),
        volumeKg: highVolume != null && lowVolume != null ? highVolume - lowVolume : null,
        volumePct: pctOrNull(highVolume, lowVolume),
      },
      coverage: {
        workoutDays: byDay.size,
        usedDays: high.length + low.length,
        noRecoveryDays,
        duplicateRecoveryDates: [...picked.values()].filter(p => p.rows > 1).length,
        highDurationDays: known(high, 'durationMin').length, lowDurationDays: known(low, 'durationMin').length,
        highVolumeDays: known(high, 'volumeKg').length, lowVolumeDays: known(low, 'volumeKg').length,
      },
    },
  };
};

export type SleepNutritionDay = {
  /** The date sleep was logged. Meals are those logged on the SAME date (no shifting). */
  date: string;
  hours: number;
  calories: number;
  /** Carbs for the day; null when any meal that day has no carbs recorded (unknown, never zero). */
  carbs: number | null;
  mealCount: number;
  carbMealCount: number;
};

export type SleepNutritionEvidence = {
  kind: 'sleep_vs_nutrition';
  window: EvidenceWindow;
  /** Short cohort = sleep < cutoff hours; normal cohort = sleep >= cutoff hours. */
  cutoff: number;
  minCohortDays: number;
  short: SleepNutritionDay[];
  normal: SleepNutritionDay[];
  /** Cohort averages. Carbs average only the days with carbs known (coverage holds those denominators). */
  averages: Record<'short' | 'normal', { hours: number; calories: number; carbs: number | null }>;
  /** Short minus normal. Carb figures are null unless both sides have enough known-carb days. */
  differences: { calories: number; carbsG: number | null; carbsPct: number | null };
  coverage: {
    /** Distinct ISO dates with a valid sleep record in the window. */
    sleepDates: number;
    /** Sleep dates that also had meals (short + normal). */
    usedDays: number;
    /** Sleep dates left out because no meals were logged that date. */
    noMealDays: number;
    /** Dates with more than one sleep record; the longest record is used (same rule as the weekly digest). */
    duplicateSleepDates: number;
    /** Days in each cohort whose carbs are fully known: the denominators of the carb averages. */
    shortCarbDays: number; normalCarbDays: number;
  };
};

export type SleepNutritionResult = {
  shortDays: number; normalDays: number;
  shortCarbDays: number; normalCarbDays: number;
  /** Carb averages cover only days with carbs known; null when none (or fewer than the minimum) are. */
  shortCarbs: number | null; normalCarbs: number | null;
  shortCalories: number; normalCalories: number;
  carbDeltaPct: number | null; calorieDelta: number;
  evidence: SleepNutritionEvidence;
};

/**
 * Sleep logged on date D is paired with day D's meals (same convention as the sleep page): no shifting.
 * One sleep record per date (the longest). A day's carbs are known only when every meal that day has carbs
 * recorded; unknown days are left out of the carb average (and its denominator), never counted as zero.
 */
export const analyzeSleepVsNutrition = (
  sleep: Sleep[], meals: MealLike[], cutoff = DEFAULT_SLEEP_CUTOFF, window?: Partial<EvidenceWindow>,
): SleepNutritionResult | null => {
  const day = new Map<string, { calories: number; carbs: number; meals: number; carbMeals: number }>();
  meals.forEach(m => {
    if (!inWindow(m.date, window)) return;
    const cur = day.get(m.date) || { calories: 0, carbs: 0, meals: 0, carbMeals: 0 };
    cur.calories += m.calories || 0;
    cur.meals += 1;
    if (m.carbs != null) { cur.carbs += m.carbs; cur.carbMeals += 1; }
    day.set(m.date, cur);
  });
  const nights = new Map<string, { hours: number; rows: number }>();
  sleep.forEach(s => {
    if (!(s.hours > 0) || !inWindow(s.date, window)) return;
    const cur = nights.get(s.date);
    if (!cur) nights.set(s.date, { hours: s.hours, rows: 1 });
    else { cur.rows += 1; cur.hours = Math.max(cur.hours, s.hours); }
  });
  const short: SleepNutritionDay[] = [];
  const normal: SleepNutritionDay[] = [];
  let noMealDays = 0;
  nights.forEach((n, date) => {
    const d = day.get(date);
    if (!d) { noMealDays += 1; return; }
    const row: SleepNutritionDay = {
      date, hours: n.hours, calories: d.calories,
      carbs: d.carbMeals === d.meals ? d.carbs : null,
      mealCount: d.meals, carbMealCount: d.carbMeals,
    };
    (n.hours < cutoff ? short : normal).push(row);
  });
  if (short.length < MIN_COHORT_DAYS || normal.length < MIN_COHORT_DAYS) return null;
  short.sort(byDateAsc);
  normal.sort(byDateAsc);
  const knownCarbs = (days: SleepNutritionDay[]) => days.map(d => d.carbs).filter((v): v is number => v != null);
  const shortKnown = knownCarbs(short);
  const normalKnown = knownCarbs(normal);
  const carbsComparable = shortKnown.length >= MIN_COHORT_DAYS && normalKnown.length >= MIN_COHORT_DAYS;
  const shortCarbs = carbsComparable ? avg(shortKnown) : null;
  const normalCarbs = carbsComparable ? avg(normalKnown) : null;
  const shortCalories = avg(short.map(d => d.calories));
  const normalCalories = avg(normal.map(d => d.calories));
  return {
    shortDays: short.length, normalDays: normal.length,
    shortCarbDays: shortKnown.length, normalCarbDays: normalKnown.length,
    shortCarbs, normalCarbs, shortCalories, normalCalories,
    carbDeltaPct: pctOrNull(shortCarbs, normalCarbs),
    calorieDelta: shortCalories - normalCalories,
    evidence: {
      kind: 'sleep_vs_nutrition',
      window: normalizeWindow(window),
      cutoff,
      minCohortDays: MIN_COHORT_DAYS,
      short, normal,
      averages: {
        short: { hours: avg(short.map(d => d.hours)), calories: shortCalories, carbs: shortCarbs },
        normal: { hours: avg(normal.map(d => d.hours)), calories: normalCalories, carbs: normalCarbs },
      },
      differences: {
        calories: shortCalories - normalCalories,
        carbsG: shortCarbs != null && normalCarbs != null ? shortCarbs - normalCarbs : null,
        carbsPct: pctOrNull(shortCarbs, normalCarbs),
      },
      coverage: {
        sleepDates: nights.size,
        usedDays: short.length + normal.length,
        noMealDays,
        duplicateSleepDates: [...nights.values()].filter(n => n.rows > 1).length,
        shortCarbDays: shortKnown.length, normalCarbDays: normalKnown.length,
      },
    },
  };
};

export type CrossMetricEvidence = RecoveryGymEvidence | SleepNutritionEvidence;

/** Leading words of every cross-metric claim: it describes logged days, not a cause or a judgment. */
export const OBSERVED_DIFFERENCE = 'Observed difference in logged days';

export type InsightCopy = { description: string; value: string | null; valueLabel: string | null };

/** Copy for the recovery-vs-gym card. Every count comes from the result's own evidence. */
export const recoveryGymCopy = (r: RecoveryGymResult): InsightCopy => {
  const { cutoff, coverage: c } = r.evidence;
  const parts: string[] = [];
  if (r.volumeDeltaPct != null && r.highVolume != null && r.lowVolume != null) {
    parts.push(`${kg(r.highVolume)} vs ${kg(r.lowVolume)} average volume (${signed(r.volumeDeltaPct)})`);
  }
  if (r.durationDeltaPct != null && r.highDuration != null && r.lowDuration != null) {
    parts.push(`${Math.round(r.highDuration)} vs ${Math.round(r.lowDuration)} min average duration (${signed(r.highDuration - r.lowDuration, ' min')})`);
  }
  const measured = parts.length ? parts.join(' and ') : 'no comparable volume or duration';
  const gaps: string[] = [];
  if (c.highVolumeDays < r.highDays || c.lowVolumeDays < r.lowDays) {
    gaps.push(`Volume is known for ${c.highVolumeDays} of ${r.highDays} higher and ${c.lowVolumeDays} of ${r.lowDays} lower recovery days.`);
  }
  return {
    description: `${OBSERVED_DIFFERENCE}: workouts on days with WHOOP recovery of ${cutoff}% or higher averaged ${measured}, compared with days below ${cutoff}%. Based on ${r.highDays} higher-recovery and ${r.lowDays} lower-recovery workout days.${gaps.length ? ` ${gaps.join(' ')}` : ''}`,
    value: r.volumeDeltaPct != null ? signed(r.volumeDeltaPct) : r.durationDeltaPct != null ? signed(r.durationDeltaPct) : null,
    valueLabel: r.volumeDeltaPct != null ? 'volume' : r.durationDeltaPct != null ? 'duration' : null,
  };
};

/** Copy for the sleep-vs-nutrition card. Carb counts are the known-carb days, not all sleep days. */
export const sleepNutritionCopy = (r: SleepNutritionResult): InsightCopy => {
  const { cutoff } = r.evidence;
  const carbs = r.carbDeltaPct != null && r.shortCarbs != null && r.normalCarbs != null
    ? `${Math.round(r.shortCarbs)} g vs ${Math.round(r.normalCarbs)} g average carbs (${signed(r.carbDeltaPct)}; carbs known on ${r.shortCarbDays} of ${r.shortDays} and ${r.normalCarbDays} of ${r.normalDays} days)`
    : `carbs not compared (known on ${r.shortCarbDays} of ${r.shortDays} and ${r.normalCarbDays} of ${r.normalDays} days; at least ${MIN_COHORT_DAYS} needed in each group)`;
  return {
    description: `${OBSERVED_DIFFERENCE}: on days with sleep logged under ${cutoff} h versus ${cutoff} h or more, ${carbs}. Average calories were ${Math.round(r.shortCalories).toLocaleString('en-US')} vs ${Math.round(r.normalCalories).toLocaleString('en-US')} (${signed(r.calorieDelta, ' cal')}). Based on ${r.shortDays} shorter-sleep and ${r.normalDays} longer-sleep days with meals logged.`,
    value: r.carbDeltaPct != null ? signed(r.carbDeltaPct) : signed(r.calorieDelta, ' cal'),
    valueLabel: r.carbDeltaPct != null ? 'carbs' : 'calories',
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
