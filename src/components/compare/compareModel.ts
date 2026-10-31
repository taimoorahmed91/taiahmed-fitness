/**
 * Pure logic behind the Compare page: which records can be picked, how a pick changes, and what the
 * comparison says. No React in here, so every rule is tested on its own (tests/compareModel.test.ts).
 *
 * Rules this file keeps:
 *  - Dates are plain "YYYY-MM-DD" calendar days. They are formatted in UTC (never `new Date('YYYY-MM-DD')`
 *    in local time, which shows the day before west of UTC).
 *  - Change is always B minus A ("from A to B"), the same way for every metric.
 *  - Wording is neutral ("higher" / "lower"). More calories, a heavier weight or a longer session is not
 *    objectively good or bad, so nothing here says "better" or "worse", and nothing is coloured red or green.
 *  - A missing value is "Not logged", never 0. A change is only worked out when both sides have a number.
 */
import type { GymSession, Meal } from '@/types';
import type { WeightEntry } from '@/hooks/useWeight';
import type { SleepEntry } from '@/hooks/useSleep';
import { dayDiff, isoDayToMs } from '@/lib/historyDates';
import { tableView, type TableView } from '@/components/feedback/tableView';
import type { SharedTable, SharedTableState } from '@/lib/sharedData';

export type Category = 'meals' | 'gym' | 'weight' | 'sleep';
export type Slot = 'A' | 'B';
export const SLOTS: readonly Slot[] = ['A', 'B'];
export const MAX_SELECTED = 2;

export interface Unit {
  /** Shown next to values: "cal", "kg". */
  short: string;
  /** Used in sentences, so it can be pluralised: "hours". */
  singular: string;
  plural: string;
}

export interface CategoryInfo {
  id: Category;
  label: string;
  /** One line telling the person what a record of this kind holds. */
  hint: string;
  /** What the first number in the comparison is. */
  primaryLabel: string;
  unit: Unit;
  /** Page that lists these records, for the "log one first" link. */
  routeKey: 'meals' | 'gym' | 'weight' | 'sleep';
  /** Plural noun for counts: "3 meals". */
  noun: { one: string; many: string };
}

export const CATEGORY_INFO: Record<Category, CategoryInfo> = {
  meals: {
    id: 'meals',
    label: 'Meals',
    hint: 'Calories, protein and carbs',
    primaryLabel: 'Calories',
    unit: { short: 'cal', singular: 'calorie', plural: 'calories' },
    routeKey: 'meals',
    noun: { one: 'meal', many: 'meals' },
  },
  gym: {
    id: 'gym',
    label: 'Gym',
    hint: 'Duration, exercises and sets',
    primaryLabel: 'Duration',
    unit: { short: 'min', singular: 'minute', plural: 'minutes' },
    routeKey: 'gym',
    noun: { one: 'workout', many: 'workouts' },
  },
  weight: {
    id: 'weight',
    label: 'Weight',
    hint: 'Body weight in kg',
    primaryLabel: 'Weight',
    unit: { short: 'kg', singular: 'kg', plural: 'kg' },
    routeKey: 'weight',
    noun: { one: 'weigh-in', many: 'weigh-ins' },
  },
  sleep: {
    id: 'sleep',
    label: 'Sleep',
    hint: 'Hours slept per night',
    primaryLabel: 'Sleep',
    unit: { short: 'h', singular: 'hour', plural: 'hours' },
    routeKey: 'sleep',
    noun: { one: 'sleep log', many: 'sleep logs' },
  },
};

export const CATEGORY_ORDER: readonly Category[] = ['meals', 'gym', 'weight', 'sleep'];

export const isCategory = (value: unknown): value is Category => typeof value === 'string' && value in CATEGORY_INFO;

/* ---------------------------------------------------------------- dates */

const fmtUtc = (iso: string, options: Intl.DateTimeFormatOptions): string => {
  const ms = isoDayToMs(iso);
  if (ms === null) return iso;
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(ms);
};

/** "Fri, Oct 30, 2026" - always with the year, because two compared records can be far apart. */
export const formatFullDay = (iso: string): string => fmtUtc(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 30, 2026" - the shorter form for tight columns. */
export const formatCompactDay = (iso: string): string => fmtUtc(iso, { month: 'short', day: 'numeric', year: 'numeric' });

/** How far apart the two records are, from A to B. null when either date is not a real day. */
export const describeGap = (aIso: string, bIso: string): string | null => {
  const diff = dayDiff(bIso, aIso);
  if (diff === null) return null;
  if (diff === 0) return 'Both on the same day';
  const n = Math.abs(diff);
  const days = `${n} ${n === 1 ? 'day' : 'days'}`;
  return diff > 0 ? `B is ${days} after A` : `B is ${days} before A`;
};

/* ---------------------------------------------------------------- numbers */

/** Rounds to at most two decimals, so 70.5 - 70.2 reads 0.3 and not 0.2999999999999972. */
export const roundValue = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const formatNumber = (n: number): string => String(roundValue(n));

export const formatWithUnit = (n: number | null | undefined, unit: Unit): string =>
  isNum(n) ? `${formatNumber(n)} ${unit.short}` : 'Not logged';

export type Direction = 'higher' | 'lower' | 'same';

export interface Delta {
  /** B minus A, rounded. */
  value: number;
  direction: Direction;
  /** "+12 cal", "−0.3 kg", "No change". Carries its own sign so it never relies on colour. */
  text: string;
  /** "Higher", "Lower" or "No change": the word that goes with the glyph. */
  word: string;
  /** Full sentence part: "12 cal higher". */
  phrase: string;
}

const MINUS = '\u2212';

/** B minus A. null unless both are real numbers. */
export const computeDelta = (a: number | null | undefined, b: number | null | undefined, unit: Unit): Delta | null => {
  if (!isNum(a) || !isNum(b)) return null;
  const value = roundValue(b - a);
  if (value === 0) return { value: 0, direction: 'same', text: 'No change', word: 'No change', phrase: 'no different' };
  const size = formatNumber(Math.abs(value));
  const direction: Direction = value > 0 ? 'higher' : 'lower';
  return {
    value,
    direction,
    text: `${value > 0 ? '+' : MINUS}${size} ${unit.short}`,
    word: value > 0 ? 'Higher' : 'Lower',
    phrase: `${size} ${Math.abs(value) === 1 ? unit.singular : unit.plural} ${direction}`,
  };
};

/* ---------------------------------------------------------------- selection */

/**
 * Tick / untick a record. At most two can be picked: ticking a third drops the earliest pick (A) and the
 * old B becomes A, so the newest pick is always B. Same rule the page always had.
 */
export const toggleSelection = (selected: readonly string[], id: string): string[] => {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (selected.length >= MAX_SELECTED) return [selected[selected.length - 1], id];
  return [...selected, id];
};

export const swapSelection = (selected: readonly string[]): string[] => (selected.length === 2 ? [selected[1], selected[0]] : [...selected]);

/** Drops picks that no longer exist (a record was deleted elsewhere), keeping order. */
export const pruneSelection = (selected: readonly string[], availableIds: ReadonlySet<string>): string[] => selected.filter((id) => availableIds.has(id));

export const slotOf = (selected: readonly string[], id: string): Slot | null => {
  const i = selected.indexOf(id);
  return i === -1 ? null : SLOTS[i] ?? null;
};

/* ---------------------------------------------------------------- records */

export type RecordData = Meal | GymSession | WeightEntry | SleepEntry;

export interface ComparableEntry {
  id: string;
  date: string;
  /** The headline of the record: the food, the exercise, the weight. */
  primary: string;
  /** Supporting facts: "320 cal · 12:30". */
  secondary: string;
  /** One plain sentence naming the record, for accessible names and the picked tray. */
  summary: string;
  data: RecordData;
}

const clock = (time: string | undefined): string => (time ? time.slice(0, 5) : '');

export const buildEntries = (
  category: Category | null,
  source: { meals: Meal[]; gym: GymSession[]; weight: WeightEntry[]; sleep: SleepEntry[] },
): ComparableEntry[] => {
  switch (category) {
    case 'meals':
      return source.meals.map((m) => ({
        id: m.id,
        date: m.date,
        primary: m.food,
        secondary: [`${formatNumber(m.calories)} cal`, clock(m.time)].filter(Boolean).join(' · '),
        summary: `${m.food}, ${formatNumber(m.calories)} cal`,
        data: m,
      }));
    case 'gym':
      return source.gym.map((s) => ({
        id: s.id,
        date: s.date,
        primary: s.exercise,
        secondary: `${formatNumber(s.duration)} min`,
        summary: `${s.exercise}, ${formatNumber(s.duration)} min`,
        data: s,
      }));
    case 'weight':
      return source.weight.map((w) => ({
        id: w.id,
        date: w.date,
        primary: `${formatNumber(w.weight)} kg`,
        secondary: w.notes ?? '',
        summary: `${formatNumber(w.weight)} kg`,
        data: w,
      }));
    case 'sleep':
      return source.sleep.map((s) => ({
        id: s.id,
        date: s.date,
        primary: `${formatNumber(s.hours)} h`,
        secondary: s.notes ?? '',
        summary: `${formatNumber(s.hours)} hours`,
        data: s,
      }));
    default:
      return [];
  }
};

/* ---------------------------------------------------------------- comparison */

export interface ComparisonRow {
  key: string;
  label: string;
  a: string;
  b: string;
  /** Equal as typed (both "Not logged" counts as equal). */
  same: boolean;
  delta: Delta | null;
}

export interface PrimaryComparison {
  label: string;
  a: string;
  b: string;
  delta: Delta | null;
}

export interface Comparison {
  category: Category;
  aDate: string;
  bDate: string;
  gap: string | null;
  primary: PrimaryComparison;
  /** One plain sentence that answers "what is different". */
  headline: string;
  rows: ComparisonRow[];
}

const textOrDash = (v: string | null | undefined): string => (v && v.trim() ? v.trim() : 'Not logged');

const textRow = (key: string, label: string, a: string | null | undefined, b: string | null | undefined): ComparisonRow => {
  const ta = textOrDash(a);
  const tb = textOrDash(b);
  return { key, label, a: ta, b: tb, same: ta === tb, delta: null };
};

const numberRow = (key: string, label: string, a: number | null | undefined, b: number | null | undefined, unit: Unit): ComparisonRow => ({
  key,
  label,
  a: formatWithUnit(a, unit),
  b: formatWithUnit(b, unit),
  same: (isNum(a) ? roundValue(a) : null) === (isNum(b) ? roundValue(b) : null),
  delta: computeDelta(a, b, unit),
});

const GRAMS: Unit = { short: 'g', singular: 'g', plural: 'g' };

/** "7 days later" / "3 days earlier" / "on the same day" (B relative to A). null when a date is invalid. */
export const gapPhrase = (aIso: string, bIso: string): string | null => {
  const diff = dayDiff(bIso, aIso);
  if (diff === null) return null;
  if (diff === 0) return 'on the same day';
  const n = Math.abs(diff);
  return `${n} ${n === 1 ? 'day' : 'days'} ${diff > 0 ? 'later' : 'earlier'}`;
};

/** "B is 12 calories higher than A, 7 days later." / "Calories are the same on both, on the same day." */
export const buildHeadline = (info: CategoryInfo, delta: Delta | null, when: string | null): string => {
  const tail = when ? `, ${when}` : '';
  if (!delta) return `${info.primaryLabel} was not logged on both records, so there is no change to show.`;
  if (delta.direction === 'same') return `${info.primaryLabel} is the same on both records${tail}.`;
  return `B is ${delta.phrase} than A${tail}.`;
};

export const buildComparison = (category: Category, a: RecordData, b: RecordData): Comparison => {
  const info = CATEGORY_INFO[category];
  const gap = describeGap(a.date, b.date);
  let primaryA: number | null | undefined;
  let primaryB: number | null | undefined;
  let rows: ComparisonRow[] = [];

  if (category === 'meals') {
    const ma = a as Meal;
    const mb = b as Meal;
    primaryA = ma.calories;
    primaryB = mb.calories;
    rows = [
      textRow('food', 'Food', ma.food, mb.food),
      textRow('time', 'Time', clock(ma.time), clock(mb.time)),
      numberRow('protein', 'Protein', ma.protein, mb.protein, GRAMS),
      numberRow('carbs', 'Carbs', ma.carbs, mb.carbs, GRAMS),
    ];
  } else if (category === 'gym') {
    const ga = a as GymSession;
    const gb = b as GymSession;
    primaryA = ga.duration;
    primaryB = gb.duration;
    rows = [textRow('exercise', 'Workout', ga.exercise, gb.exercise)];
  } else if (category === 'weight') {
    const wa = a as WeightEntry;
    const wb = b as WeightEntry;
    primaryA = wa.weight;
    primaryB = wb.weight;
    if (wa.notes || wb.notes) rows = [textRow('notes', 'Notes', wa.notes, wb.notes)];
  } else {
    const sa = a as SleepEntry;
    const sb = b as SleepEntry;
    primaryA = sa.hours;
    primaryB = sb.hours;
    if (sa.notes || sb.notes) rows = [textRow('notes', 'Notes', sa.notes, sb.notes)];
  }

  const delta = computeDelta(primaryA, primaryB, info.unit);
  return {
    category,
    aDate: a.date,
    bDate: b.date,
    gap,
    primary: {
      label: info.primaryLabel,
      a: formatWithUnit(primaryA, info.unit),
      b: formatWithUnit(primaryB, info.unit),
      delta,
    },
    headline: buildHeadline(info, delta, gapPhrase(a.date, b.date)),
    rows,
  };
};

/* ---------------------------------------------------------------- gym notes */

export interface ParsedSet {
  label: string;
  reps?: string;
  weight?: string;
  time?: string;
}
export interface ParsedExercise {
  name: string;
  seq?: number;
  sets: ParsedSet[];
  note?: string;
}
export interface ParsedGymNotes {
  startTime?: string;
  endTime?: string;
  exercises: ParsedExercise[];
}

/** Reads the saved " | "-separated workout notes. Same parsing the page always used. */
export const parseGymNotes = (notes: string | undefined): ParsedGymNotes => {
  const result: ParsedGymNotes = { exercises: [] };
  if (!notes) return result;
  const parts = notes.split(' | ').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^Start:/i.test(part) && !part.includes(': S') && !part.includes(': W')) {
      const sm = part.match(/Start:\s*(\d{1,2}:\d{2})/i);
      const em = part.match(/End:\s*(\d{1,2}:\d{2})/i);
      if (sm) result.startTime = sm[1];
      if (em) result.endTime = em[1];
      continue;
    }
    let working = part;
    let noteText = '';
    const noteMatch = working.match(/\s*\[note:\s*([^\]]*)\]\s*$/i);
    if (noteMatch) {
      noteText = noteMatch[1].trim();
      working = working.slice(0, noteMatch.index).trim();
    }
    const colonIdx = working.indexOf(':');
    if (colonIdx === -1) continue;
    let header = working.slice(0, colonIdx).trim();
    const setsText = working.slice(colonIdx + 1).trim();
    let seq: number | undefined;
    const seqMatch = header.match(/^(\d+)\.(.*)$/);
    if (seqMatch) {
      seq = parseInt(seqMatch[1], 10);
      header = seqMatch[2].trim();
    }
    const sets: ParsedSet[] = [];
    const wMatch = setsText.match(/(?:^|\s)W:(\d+(?:\.\d+)?)(?:@(\d+(?:\.\d+)?)kg)?(?:@(\d{1,2}:\d{2}))?/);
    if (wMatch) sets.push({ label: 'Warmup', reps: wMatch[1], weight: wMatch[2], time: wMatch[3] });
    const setRegex = /S([1-6]):(\d+(?:\.\d+)?)(?:@(\d+(?:\.\d+)?)kg)?(?:@(\d{1,2}:\d{2}))?/g;
    let m: RegExpExecArray | null;
    while ((m = setRegex.exec(setsText)) !== null) {
      sets.push({ label: `Set ${m[1]}`, reps: m[2], weight: m[3], time: m[4] });
    }
    result.exercises.push({ name: header, seq, sets, note: noteText || undefined });
  }
  result.exercises.sort((x, y) => (x.seq ?? 999) - (y.seq ?? 999));
  return result;
};

const SET_ORDER = ['Warmup', 'Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5', 'Set 6'];

export interface SetChange {
  /** "+2 reps" / "−5 kg" */
  text: string;
  direction: Direction;
}

export interface SetComparison {
  label: string;
  /** Two short lines for a narrow column: reps, then weight and time. */
  a: string[];
  b: string[];
  same: boolean;
  changes: SetChange[];
}

export type ExerciseStatus = 'same' | 'different' | 'only-a' | 'only-b';

export interface ExerciseComparison {
  name: string;
  status: ExerciseStatus;
  sets: SetComparison[];
  noteA?: string;
  noteB?: string;
}

export interface GymSetComparison {
  /** "Start / End" cells, or null when neither workout stored times. */
  timing: { a: string; b: string } | null;
  exercises: ExerciseComparison[];
}

const setLines = (s?: ParsedSet): string[] => {
  if (!s) return ['Not logged'];
  const lines = [`${s.reps ?? '–'} reps`];
  const extra = [s.weight ? `@ ${s.weight} kg` : '', s.time ? `(${s.time})` : ''].filter(Boolean).join(' ');
  if (extra) lines.push(extra);
  return lines;
};

const changeFor = (a: string | undefined, b: string | undefined, unit: string): SetChange | null => {
  if (a === undefined || b === undefined || a === '' || b === '') return null;
  const diff = roundValue(parseFloat(b) - parseFloat(a));
  if (!Number.isFinite(diff) || diff === 0) return null;
  return { text: `${diff > 0 ? '+' : MINUS}${formatNumber(Math.abs(diff))} ${unit}`, direction: diff > 0 ? 'higher' : 'lower' };
};

/** Lines up the exercises and sets of two workouts, matched by exercise name and set label. */
export const buildGymSetComparison = (a: GymSession, b: GymSession): GymSetComparison => {
  const pa = parseGymNotes(a.notes);
  const pb = parseGymNotes(b.notes);
  const names = Array.from(new Set([...pa.exercises.map((e) => e.name), ...pb.exercises.map((e) => e.name)]));

  const exercises = names.map<ExerciseComparison>((name) => {
    const ea = pa.exercises.find((e) => e.name === name);
    const eb = pb.exercises.find((e) => e.name === name);
    const labels = Array.from(new Set([...(ea?.sets ?? []).map((s) => s.label), ...(eb?.sets ?? []).map((s) => s.label)]));
    labels.sort((x, y) => SET_ORDER.indexOf(x) - SET_ORDER.indexOf(y));
    const sets = labels.map<SetComparison>((label) => {
      const sa = ea?.sets.find((s) => s.label === label);
      const sb = eb?.sets.find((s) => s.label === label);
      const same = !!sa && !!sb && sa.reps === sb.reps && (sa.weight || '') === (sb.weight || '');
      const changes = [changeFor(sa?.reps, sb?.reps, 'reps'), changeFor(sa?.weight, sb?.weight, 'kg')].filter((c): c is SetChange => c !== null);
      return { label, a: setLines(sa), b: setLines(sb), same, changes };
    });
    const status: ExerciseStatus = !eb ? 'only-a' : !ea ? 'only-b' : sets.every((s) => s.same) ? 'same' : 'different';
    return { name, status, sets, noteA: ea?.note, noteB: eb?.note };
  });

  const hasTiming = pa.startTime || pb.startTime || pa.endTime || pb.endTime;
  return {
    timing: hasTiming ? { a: `${pa.startTime || '–'} / ${pa.endTime || '–'}`, b: `${pb.startTime || '–'} / ${pb.endTime || '–'}` } : null,
    exercises,
  };
};

/** The sets of an exercise only one workout has, on one line: "Set 1 10 reps @ 82.5 kg · Set 2 9 reps @ 82.5 kg". */
export const soloSummary = (exercise: ExerciseComparison): string =>
  exercise.sets.map((s) => `${s.label} ${(exercise.status === 'only-b' ? s.b : s.a).join(' ')}`).join(' · ');

/** "3 exercises are in both workouts, 4 only in A, 1 only in B." Empty string when no exercises were saved. */
export const exerciseOverview = (exercises: readonly ExerciseComparison[]): string => {
  if (exercises.length === 0) return '';
  const both = exercises.filter((e) => e.status === 'same' || e.status === 'different').length;
  const onlyA = exercises.filter((e) => e.status === 'only-a').length;
  const onlyB = exercises.filter((e) => e.status === 'only-b').length;
  const noun = (n: number) => `${n} ${n === 1 ? 'exercise is' : 'exercises are'}`;
  const parts = [`${noun(both)} in both workouts`];
  if (onlyA > 0) parts.push(`${onlyA} only in A`);
  if (onlyB > 0) parts.push(`${onlyB} only in B`);
  return `${parts.join(', ')}.`;
};

export const EXERCISE_STATUS_LABEL: Record<ExerciseStatus, string> = {
  same: 'Same',
  different: 'Different',
  'only-a': 'Only in A',
  'only-b': 'Only in B',
};

/* ---------------------------------------------------------------- guidance */

/* ---------------------------------------------------------------- where the data really is */

/** The shared table each metric is read from. */
export const CATEGORY_TABLE: Record<Category, SharedTable> = {
  meals: 'meals',
  gym: 'gym_sessions',
  weight: 'weight',
  sleep: 'sleep',
};

export interface CategoryAvailability {
  /**
   * `loading`: the first load has not finished. `error`: the first load FAILED, so the records are unknown
   * (not empty). `ready`: loaded at least once, so an empty list really is empty.
   */
  view: TableView;
  /** A refresh failed but earlier rows are kept: the records on screen may be out of date. */
  stale: boolean;
}

export const categoryAvailability = (states: Record<Category, SharedTableState>): Record<Category, CategoryAvailability> => {
  const out = {} as Record<Category, CategoryAvailability>;
  for (const id of CATEGORY_ORDER) {
    const view = tableView(states[id]);
    out[id] = { view, stale: view === 'ready' && states[id].refreshFailed };
  }
  return out;
};

/**
 * What the page-level notice should say. A failed metric that is currently OPEN is explained (with its own
 * Try again) inside step 2, so it is left out of the notice to avoid two alerts for one problem; every other
 * failed metric, and every stale one (including the open one, whose rows stay on screen), is named here.
 */
export const noticeCategories = (
  availability: Record<Category, CategoryAvailability>,
  selected: Category | null,
): { failed: Category[]; stale: Category[] } => ({
  failed: CATEGORY_ORDER.filter((id) => availability[id].view === 'error' && id !== selected),
  stale: CATEGORY_ORDER.filter((id) => availability[id].stale),
});

/** What a metric tile says under its name. Unavailable is never worded like empty. */
export const tileCountText = (category: Category, count: number | undefined, availability: CategoryAvailability): string => {
  if (availability.view === 'error') return "Couldn't load";
  if (availability.view === 'loading' || count === undefined) return 'Loading…';
  if (count === 0) return 'None logged yet';
  const noun = CATEGORY_INFO[category].noun;
  return `${count} ${count === 1 ? noun.one : noun.many}`;
};

export type ResultsState =
  | { kind: 'no-category' }
  | { kind: 'loading' }
  | { kind: 'unavailable'; category: Category }
  | { kind: 'no-records'; category: Category }
  | { kind: 'needs-two'; picked: 0 | 1 }
  | { kind: 'ready' };

/**
 * Which message the results panel shows. One place, so every empty state tells the person the next step.
 * A failed first load is "unavailable" and is checked BEFORE "no records": unknown is not the same as empty.
 */
export const resultsState = (args: { category: Category | null; view: TableView; recordCount: number; pickedCount: number }): ResultsState => {
  if (!args.category) return { kind: 'no-category' };
  if (args.view === 'error') return { kind: 'unavailable', category: args.category };
  if (args.view === 'loading') return { kind: 'loading' };
  if (args.recordCount === 0) return { kind: 'no-records', category: args.category };
  if (args.pickedCount < MAX_SELECTED) return { kind: 'needs-two', picked: args.pickedCount === 1 ? 1 : 0 };
  return { kind: 'ready' };
};

/** "2 of 2 selected" style status that is spoken after every change. */
export const selectionStatus = (picked: readonly ComparableEntry[]): string => {
  if (picked.length === 0) return '0 of 2 records selected. Choose two to compare.';
  if (picked.length === 1) return `1 of 2 records selected: A is ${picked[0].summary} on ${formatCompactDay(picked[0].date)}. Choose one more.`;
  return `2 of 2 records selected: A is ${picked[0].summary} on ${formatCompactDay(picked[0].date)}, B is ${picked[1].summary} on ${formatCompactDay(picked[1].date)}. Comparison is ready below.`;
};
