/**
 * Pure helpers for the Personal Data page. Nothing here touches React, the network or the clock
 * (the clock is always passed in), so every rule can be tested on its own.
 *
 * Conventions kept from the page before the redesign:
 *  - numbers are typed as text and parsed on save (comma becomes a dot while typing);
 *  - a blank "max" is saved as the "min" value, so a target is always a range;
 *  - dates are UTC calendar days (a date of birth is "YYYY-MM-DD"; history times are shown in UTC).
 */
import type { PersonalData } from '@/hooks/usePersonalData';

// --------------------------------------------------------------------------- weekdays

/** Monday first, as people read a week. `v` is the stored weekday number (0 = Sunday). */
export const WEEKDAYS = [
  { v: 1, long: 'Monday', short: 'Mon' },
  { v: 2, long: 'Tuesday', short: 'Tue' },
  { v: 3, long: 'Wednesday', short: 'Wed' },
  { v: 4, long: 'Thursday', short: 'Thu' },
  { v: 5, long: 'Friday', short: 'Fri' },
  { v: 6, long: 'Saturday', short: 'Sat' },
  { v: 0, long: 'Sunday', short: 'Sun' },
] as const;

// --------------------------------------------------------------------------- numbers and text

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const formatNumber = (n: number): string => NUMBER_FORMAT.format(n);

/** Parses typed text. Empty or not a number gives null. */
export const parseNumber = (text: string | null | undefined): number | null => {
  if (text == null || text.trim() === '') return null;
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Text shown while typing: keeps digits and one dot, turns a comma into a dot. Returns null when the key press must be ignored. */
export const sanitizeNumericInput = (raw: string): string | null => {
  const v = raw.replace(',', '.');
  return v === '' || /^\d*\.?\d*$/.test(v) ? v : null;
};

export interface TextWithSpoken {
  /** What is drawn on screen (uses an en dash for ranges). */
  text: string;
  /** What assistive tech reads ("2,300 to 2,600 kcal"). */
  spoken: string;
}

export interface NumberRange {
  min: number;
  max: number;
}

/**
 * The range that SAVING these two fields would store: the min, and the max or (when the max is blank
 * or not a number) the min again. null when there is no min.
 */
export const effectiveRange = (minText: string, maxText: string): NumberRange | null => {
  const min = parseNumber(minText);
  if (min === null) return null;
  const max = parseNumber(maxText);
  return { min, max: max ?? min };
};

/** True when both numbers are typed and the max is below the min (the save-blocking error). */
export const isRangeInverted = (minText: string, maxText: string): boolean =>
  !!minText && !!maxText && parseFloat(maxText) < parseFloat(minText);

export const formatRangeText = (range: NumberRange, unit: string): TextWithSpoken => {
  const suffix = unit ? ` ${unit}` : '';
  if (range.min === range.max) {
    const one = `${formatNumber(range.min)}${suffix}`;
    return { text: one, spoken: one };
  }
  return {
    text: `${formatNumber(range.min)}\u2013${formatNumber(range.max)}${suffix}`,
    spoken: `${formatNumber(range.min)} to ${formatNumber(range.max)}${suffix}`,
  };
};

/** Grams a day from a grams-per-kilo range and a body weight. null when either is missing. */
export const gramsPerDay = (perKg: NumberRange | null, weightKg: number | null): NumberRange | null =>
  perKg && weightKg && weightKg > 0
    ? { min: Math.round(perKg.min * weightKg), max: Math.round(perKg.max * weightKg) }
    : null;

// --------------------------------------------------------------------------- age and dates

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Whole years from a "YYYY-MM-DD" birth date to `now`, counted on UTC calendar days. null when the date is not a real day or is in the future. */
export const calcAge = (dob: string | null | undefined, now: Date = new Date()): number | null => {
  const m = ISO_DAY.exec(dob ?? '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const born = new Date(Date.UTC(y, mo, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== mo || born.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  const monthGap = now.getUTCMonth() - mo;
  if (monthGap < 0 || (monthGap === 0 && now.getUTCDate() < d)) age--;
  return age >= 0 ? age : null;
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Oct 1, 2026" for an ISO timestamp, in UTC like every other date in the app. Falls back to the raw text. */
export const formatChangedAt = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? DATE_FORMAT.format(t) : iso;
};

// --------------------------------------------------------------------------- the editable draft

/** Everything the main Save button stores. Numbers are kept as the text the person typed. */
export interface PersonalDraft {
  fullName: string;
  dob: string;
  age: string;
  gender: string;
  height: string;
  targetWeight: string;
  gymMin: string;
  gymMax: string;
  restMin: string;
  restMax: string;
  proteinMin: string;
  proteinMax: string;
  carbMin: string;
  carbMax: string;
  workoutDays: number[];
  dayTemplates: Record<string, string>;
}

export const draftFromData = (data: PersonalData, now: Date = new Date()): PersonalDraft => ({
  fullName: data.full_name || '',
  dob: data.dob || '',
  age: data.age?.toString() || (data.dob ? String(calcAge(data.dob, now) ?? '') : ''),
  gender: data.gender || '',
  height: data.height_cm?.toString() || '',
  targetWeight: data.target_weight_kg?.toString() || '',
  gymMin: data.gym_day_calorie_target?.toString() || '',
  gymMax: data.gym_day_calorie_target_max?.toString() || '',
  restMin: data.rest_day_calorie_target?.toString() || '',
  restMax: data.rest_day_calorie_target_max?.toString() || '',
  proteinMin: data.protein_multiplier?.toString() || '',
  proteinMax: data.protein_multiplier_max?.toString() || '',
  carbMin: data.carb_multiplier?.toString() || '',
  carbMax: data.carb_multiplier_max?.toString() || '',
  workoutDays: data.workout_days || [],
  dayTemplates: data.workout_day_templates || {},
});

/** The first range whose max is below its min, as the toast text the page has always shown. null when all are fine. */
export const findRangeError = (d: PersonalDraft): string | null => {
  const pairs: [string, string, string][] = [
    ['Gym day calories', d.gymMin, d.gymMax],
    ['Rest day calories', d.restMin, d.restMax],
    ['Protein multiplier', d.proteinMin, d.proteinMax],
    ['Carb multiplier', d.carbMin, d.carbMax],
  ];
  for (const [label, mn, mx] of pairs) {
    if (mn && mx && parseFloat(mx) < parseFloat(mn)) return `${label}: Max must be greater than or equal to Min`;
  }
  return null;
};

const int = (s: string) => (s ? parseInt(s, 10) : null);
const float = (s: string) => (s ? parseFloat(s) : null);
// A blank max saves as the min (so every target is a range); both blank saves null.
const maxOrMin = (mn: string, mx: string, parse: (s: string) => number | null) => (mx ? parse(mx) : mn ? parse(mn) : null);

/** The exact object the main Save button sends. Template picks for days that are off, or for deleted templates, are dropped. */
export const buildSavePayload = (d: PersonalDraft, validTemplateIds: readonly string[]): Omit<PersonalData, 'id'> => ({
  full_name: d.fullName || null,
  dob: d.dob || null,
  age: d.age ? parseInt(d.age, 10) : null,
  gender: d.gender || null,
  height_cm: float(d.height),
  target_weight_kg: float(d.targetWeight),
  gym_day_calorie_target: int(d.gymMin),
  rest_day_calorie_target: int(d.restMin),
  protein_multiplier: float(d.proteinMin),
  carb_multiplier: float(d.carbMin),
  gym_day_calorie_target_max: maxOrMin(d.gymMin, d.gymMax, int),
  rest_day_calorie_target_max: maxOrMin(d.restMin, d.restMax, int),
  protein_multiplier_max: maxOrMin(d.proteinMin, d.proteinMax, float),
  carb_multiplier_max: maxOrMin(d.carbMin, d.carbMax, float),
  workout_days: d.workoutDays,
  workout_day_templates: Object.fromEntries(
    Object.entries(d.dayTemplates).filter(([k, v]) => d.workoutDays.includes(Number(k)) && validTemplateIds.includes(v)),
  ),
});

/** True when saving the draft would store something different from what is saved now. */
export const isDraftDirty = (draft: PersonalDraft, saved: PersonalData, validTemplateIds: readonly string[], now: Date = new Date()): boolean =>
  JSON.stringify(buildSavePayload(draft, validTemplateIds)) !==
  JSON.stringify(buildSavePayload(draftFromData(saved, now), validTemplateIds));

// --------------------------------------------------------------------------- BMI

export interface BmiBand {
  label: string;
  range: string;
  min: number;
  max: number;
  /** Chart role colour class: the glyph and the name carry the meaning too, never colour alone. */
  fill: string;
  glyph: string;
}

export const BMI_BANDS: readonly BmiBand[] = [
  { label: 'Underweight', range: '< 18.5', min: 0, max: 18.5, fill: 'bg-chart-warn', glyph: '\u2193' },
  { label: 'Normal', range: '18.5 \u2013 24.9', min: 18.5, max: 25, fill: 'bg-chart-min', glyph: '\u2713' },
  { label: 'Overweight', range: '25 \u2013 29.9', min: 25, max: 30, fill: 'bg-chart-1', glyph: '\u2191' },
  { label: 'Obese', range: '30+', min: 30, max: Infinity, fill: 'bg-chart-max', glyph: '\u2191\u2191' },
];

export const computeBmi = (heightCm: number | null, weightKg: number | null): number | null =>
  heightCm && heightCm > 0 && weightKg && weightKg > 0 ? weightKg / Math.pow(heightCm / 100, 2) : null;

export const bmiBandIndex = (bmi: number | null): number =>
  bmi === null ? -1 : BMI_BANDS.findIndex((b) => bmi >= b.min && bmi < b.max);

/** Marker position on the scale: BMI 15 is the left end (0) and BMI 35 the right end (100). */
export const bmiMarkerPercent = (bmi: number): number => Math.max(0, Math.min(100, ((bmi - 15) / (35 - 15)) * 100));

// --------------------------------------------------------------------------- history

export interface HistoryPoint {
  id: string;
  value: number;
  changed_at: string;
}

/** One moment a target changed. For a single-value field `max` is null. */
export interface HistoryRow {
  id: string;
  changedAt: string;
  min: number;
  max: number | null;
}

const timeOf = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** The history of one number, newest first. */
export const singleHistoryRows = (points: readonly HistoryPoint[]): HistoryRow[] =>
  [...points]
    .sort((a, b) => timeOf(b.changed_at) - timeOf(a.changed_at))
    .map((p) => ({ id: p.id, changedAt: p.changed_at, min: Number(p.value), max: null }));

/**
 * One timeline for a min/max pair, newest first. The database logs the two numbers as separate rows, so a save
 * that changed both arrives as two rows a moment apart: rows within `windowMs` become ONE change, and each change
 * carries the value of the other number that was in force at that time. A max that was never logged stays null.
 */
export const rangeHistoryRows = (
  minPoints: readonly HistoryPoint[],
  maxPoints: readonly HistoryPoint[],
  windowMs = 2000,
): HistoryRow[] => {
  const events = [
    ...minPoints.map((p) => ({ kind: 'min' as const, p })),
    ...maxPoints.map((p) => ({ kind: 'max' as const, p })),
  ].sort((a, b) => timeOf(a.p.changed_at) - timeOf(b.p.changed_at));

  const rows: HistoryRow[] = [];
  let curMin: number | null = null;
  let curMax: number | null = null;
  let groupStart = -Infinity;
  let open: { ids: string[]; changedAt: string } | null = null;

  const flush = () => {
    if (open && curMin !== null) rows.push({ id: open.ids.join('+'), changedAt: open.changedAt, min: curMin, max: curMax });
    open = null;
  };

  for (const e of events) {
    const t = timeOf(e.p.changed_at);
    if (!open || t - groupStart > windowMs) {
      flush();
      groupStart = t;
      open = { ids: [], changedAt: e.p.changed_at };
    }
    open.ids.push(e.p.id);
    open.changedAt = e.p.changed_at;
    if (e.kind === 'min') curMin = Number(e.p.value);
    else curMax = Number(e.p.value);
  }
  flush();
  return rows.reverse();
};

/** "2,300\u20132,600 kcal" for a history row (a single number when there is no separate max). */
export const formatHistoryRow = (row: HistoryRow, unit: string): TextWithSpoken =>
  formatRangeText({ min: row.min, max: row.max ?? row.min }, unit);

// --------------------------------------------------------------------------- the summary at the top

export interface SummaryItem {
  label: string;
  /** What is drawn. "Not set" when empty. */
  value: string;
  /** What assistive tech reads when it differs from `value` (ranges say "to" instead of a dash). */
  spoken?: string;
  /** A second, quieter line. */
  detail?: string;
  /** False when nothing is saved: the value is shown in the quiet style, and the words "Not set" carry the meaning. */
  set: boolean;
}

export interface ProfileSummaryModel {
  body: SummaryItem[];
  nutrition: SummaryItem[];
  training: SummaryItem[];
}

const NOT_SET = 'Not set';
const item = (label: string, value: string | null, extra: Partial<SummaryItem> = {}): SummaryItem =>
  value === null ? { label, value: NOT_SET, set: false } : { label, value, set: true, ...extra };

const rangeItem = (label: string, min: number | null | undefined, max: number | null | undefined, unit: string, detail?: string): SummaryItem => {
  if (min == null) return item(label, null);
  const { text, spoken } = formatRangeText({ min, max: max != null && max >= min ? max : min }, unit);
  return { label, value: text, spoken, detail, set: true };
};

/** The saved settings in the order they are shown at the top of the page. `now` is only used to derive an age from a date of birth. */
export const buildProfileSummary = (
  data: PersonalData,
  latestWeightKg: number | null,
  templateCount: number,
  now: Date = new Date(),
): ProfileSummaryModel => {
  const age = data.age ?? calcAge(data.dob, now);
  const gender = data.gender === 'M' ? 'Male' : data.gender === 'F' ? 'Female' : null;
  const who = [data.full_name?.trim() || null, age !== null ? `${age} yrs` : null, gender].filter(Boolean).join(' \u00b7 ');
  const bmi = computeBmi(data.height_cm, latestWeightKg);
  const band = bmiBandIndex(bmi);

  const proteinPerKg = data.protein_multiplier != null ? effectiveRangeFromNumbers(data.protein_multiplier, data.protein_multiplier_max) : null;
  const carbPerKg = data.carb_multiplier != null ? effectiveRangeFromNumbers(data.carb_multiplier, data.carb_multiplier_max) : null;
  const perDay = (r: NumberRange | null) => {
    const g = gramsPerDay(r, latestWeightKg);
    return g ? `\u2248 ${formatRangeText(g, 'g a day').text} at ${formatNumber(latestWeightKg as number)} kg` : undefined;
  };

  const days = WEEKDAYS.filter((d) => data.workout_days.includes(d.v));
  const withTemplate = days.filter((d) => data.workout_day_templates[String(d.v)]).length;

  return {
    body: [
      item('Profile', who || null),
      item('Height', data.height_cm != null ? `${formatNumber(data.height_cm)} cm` : null),
      item('Latest weight', latestWeightKg != null ? `${formatNumber(latestWeightKg)} kg` : null,
        data.target_weight_kg != null ? { detail: `Target ${formatNumber(data.target_weight_kg)} kg` } : {}),
      bmi !== null && band >= 0
        ? { label: 'BMI', value: bmi.toFixed(1), detail: BMI_BANDS[band].label, set: true }
        : item('BMI', null),
    ],
    nutrition: [
      rangeItem('Gym days', data.gym_day_calorie_target, data.gym_day_calorie_target_max, 'kcal'),
      rangeItem('Rest days', data.rest_day_calorie_target, data.rest_day_calorie_target_max, 'kcal'),
      rangeItem('Protein', proteinPerKg?.min ?? null, proteinPerKg?.max ?? null, 'g/kg', perDay(proteinPerKg)),
      rangeItem('Carbs', carbPerKg?.min ?? null, carbPerKg?.max ?? null, 'g/kg', perDay(carbPerKg)),
    ],
    training: [
      days.length > 0
        ? { label: 'Workout days', value: days.map((d) => d.short).join(' \u00b7 '), spoken: days.map((d) => d.long).join(', '), detail: `${days.length} a week`, set: true }
        : item('Workout days', null),
      days.length > 0
        ? { label: 'Templates', value: `${withTemplate} of ${days.length} days`, detail: templateCount === 0 ? 'No templates created yet' : 'have a template', set: true }
        : item('Templates', null),
    ],
  };
};

function effectiveRangeFromNumbers(min: number, max: number | null | undefined): NumberRange {
  return { min, max: max != null && max >= min ? max : min };
}
