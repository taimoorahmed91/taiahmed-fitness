/**
 * Pure logic behind the Calendar page: grouping records by day, building the month grid, and turning a
 * day's records into short summaries. No React in here, so every rule is tested on its own
 * (tests/calendarModel.test.ts).
 *
 * Rules this file keeps:
 *  - Record dates are plain "YYYY-MM-DD" calendar days. Every date here is built from year / month / day
 *    numbers and formatted in UTC, so a record always lands on the day it was logged on, in any time zone.
 *  - "Today" is the UTC calendar day, the same convention every other calculation in the app uses
 *    (see mealDateTime.ts).
 *  - Summaries only add up what was logged ("1,850 cal logged"). They never claim a day was complete,
 *    healthy or empty beyond "nothing logged"; while data is loading nothing is called empty.
 */
import type { GymSession, Meal } from '@/types';
import type { SleepEntry } from '@/hooks/useSleep';
import type { WeightEntry } from '@/hooks/useWeight';
import type { WaistEntry } from '@/hooks/useWaist';
import type { DailyNote } from '@/hooks/useDailyNotes';
import { addDaysIso, defaultToday, formatClock, isoDayToMs } from '@/lib/historyDates';
import { tableView } from '@/components/feedback/tableView';
import type { SharedTableState } from '@/lib/sharedData';

/* ---------------------------------------------------------------- kinds and groups */

export type DisplayFilter = 'all' | 'meals' | 'gym' | 'weight' | 'sleep' | 'waist' | 'notes';

export const FILTER_OPTIONS: ReadonlyArray<{ value: DisplayFilter; label: string }> = [
  { value: 'all', label: 'All entries' },
  { value: 'meals', label: 'Meals only' },
  { value: 'gym', label: 'Gym only' },
  { value: 'weight', label: 'Weight only' },
  { value: 'sleep', label: 'Sleep only' },
  { value: 'waist', label: 'Waist only' },
  { value: 'notes', label: 'Notes only' },
];

export type DayEntry =
  | { type: 'meal'; data: Meal }
  | { type: 'gym'; data: GymSession }
  | { type: 'weight'; data: WeightEntry }
  | { type: 'sleep'; data: SleepEntry }
  | { type: 'waist'; data: WaistEntry }
  | { type: 'note'; data: DailyNote };

/** The five things a day cell talks about. Weight and waist are both "body"; sleep is "recovery". */
export type Group = 'meals' | 'workouts' | 'body' | 'recovery' | 'notes';
export const GROUP_ORDER: readonly Group[] = ['meals', 'workouts', 'body', 'recovery', 'notes'];

export const GROUP_LABEL: Record<Group, string> = {
  meals: 'Meals',
  workouts: 'Workouts',
  body: 'Body',
  recovery: 'Recovery',
  notes: 'Notes',
};

export const groupOf = (type: DayEntry['type']): Group => {
  switch (type) {
    case 'meal':
      return 'meals';
    case 'gym':
      return 'workouts';
    case 'weight':
    case 'waist':
      return 'body';
    case 'sleep':
      return 'recovery';
    default:
      return 'notes';
  }
};

export interface CalendarSources {
  meals: Meal[];
  sessions: GymSession[];
  weight: WeightEntry[];
  sleep: SleepEntry[];
  waist: WaistEntry[];
  notes: DailyNote[];
}

/** Every record keyed by its date, in the order meals, gym, weight, sleep, waist, notes; limited by the filter. */
export const groupEntriesByDate = (source: CalendarSources, filter: DisplayFilter): Map<string, DayEntry[]> => {
  const map = new Map<string, DayEntry[]>();
  const add = (date: string, entry: DayEntry) => {
    const list = map.get(date);
    if (list) list.push(entry);
    else map.set(date, [entry]);
  };
  if (filter === 'all' || filter === 'meals') source.meals.forEach((data) => add(data.date, { type: 'meal', data }));
  if (filter === 'all' || filter === 'gym') source.sessions.forEach((data) => add(data.date, { type: 'gym', data }));
  if (filter === 'all' || filter === 'weight') source.weight.forEach((data) => add(data.date, { type: 'weight', data }));
  if (filter === 'all' || filter === 'sleep') source.sleep.forEach((data) => add(data.date, { type: 'sleep', data }));
  if (filter === 'all' || filter === 'waist') source.waist.forEach((data) => add(data.date, { type: 'waist', data }));
  if (filter === 'all' || filter === 'notes') source.notes.forEach((data) => add(data.date, { type: 'note', data }));
  return map;
};

/* ---------------------------------------------------------------- dates and months */

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** "2026-10-30" from numbers. Always zero-padded, never touches the local time zone. */
export const toIsoDay = (year: number, month: number, day: number): string => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** The UTC calendar day today, as "YYYY-MM-DD" (the app-wide "today"). */
export const todayIso = (): string => defaultToday();

/** "2026-10" for a day or month string. */
export const monthOf = (iso: string): string => iso.slice(0, 7);

const parseMonth = (month: string): { year: number; month: number } | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? { year: y, month: mo } : null;
};

export const isValidMonth = (month: string): boolean => parseMonth(month) !== null;

/** "2026-12" + 1 = "2027-01". An invalid month is returned unchanged. */
export const shiftMonth = (month: string, delta: number): string => {
  const p = parseMonth(month);
  if (!p) return month;
  const index = p.year * 12 + (p.month - 1) + delta;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
};

export const daysInMonth = (month: string): number => {
  const p = parseMonth(month);
  return p ? new Date(Date.UTC(p.year, p.month, 0)).getUTCDate() : 0;
};

const fmtUtc = (ms: number, options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(ms);

/** "October 2026" */
export const formatMonthLabel = (month: string): string => {
  const p = parseMonth(month);
  return p ? fmtUtc(Date.UTC(p.year, p.month - 1, 1), { month: 'long', year: 'numeric' }) : month;
};

/** "Friday, October 30, 2026" */
export const formatLongDay = (iso: string): string => {
  const ms = isoDayToMs(iso);
  return ms === null ? iso : fmtUtc(ms, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

/** "Fri, Oct 30" */
export const formatBriefDay = (iso: string): string => {
  const ms = isoDayToMs(iso);
  return ms === null ? iso : fmtUtc(ms, { weekday: 'short', month: 'short', day: 'numeric' });
};

export const WEEKDAYS_SUN_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAYS_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface MonthGrid {
  /** Empty cells before day 1 so it lands under the right weekday. */
  leading: number;
  /** Every day of the month as "YYYY-MM-DD". */
  days: string[];
  /** Empty cells after the last day, so the final week is a full row of seven. */
  trailing: number;
}

/** weekStartsOn: 0 = Sunday (what the calendar has always used), 1 = Monday. */
export const buildMonthGrid = (month: string, weekStartsOn: 0 | 1 = 0): MonthGrid => {
  const p = parseMonth(month);
  if (!p) return { leading: 0, days: [], trailing: 0 };
  const firstWeekday = new Date(Date.UTC(p.year, p.month - 1, 1)).getUTCDay();
  const count = daysInMonth(month);
  const leading = (firstWeekday - weekStartsOn + 7) % 7;
  return {
    leading,
    days: Array.from({ length: count }, (_, i) => toIsoDay(p.year, p.month, i + 1)),
    trailing: (7 - ((leading + count) % 7)) % 7,
  };
};

/** The same day one step earlier or later (crosses month and year ends correctly). */
export const stepDay = (iso: string, delta: number): string => addDaysIso(iso, delta);

/* ---------------------------------------------------------------- day summaries */

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const num = (n: number): string => String(Math.round((n + Number.EPSILON) * 100) / 100);
const withCommas = (n: number): string => Math.round(n).toLocaleString('en-US');

export interface GroupSummary {
  group: Group;
  count: number;
  /** Very short, for a day cell: "1,850 cal", "45 min", "70.5 kg", "2 notes". */
  short: string;
  /** Plain words, for the day's accessible name and the detail header: "2 meals, 1,850 cal logged". */
  long: string;
}

export interface DaySummary {
  total: number;
  groups: GroupSummary[];
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export const summarizeDay = (entries: readonly DayEntry[]): DaySummary => {
  const groups: GroupSummary[] = [];
  for (const group of GROUP_ORDER) {
    const mine = entries.filter((e) => groupOf(e.type) === group);
    if (mine.length === 0) continue;
    switch (group) {
      case 'meals': {
        const meals = mine.map((e) => e.data as Meal);
        const cal = meals.reduce((sum, m) => sum + (finite(m.calories) ? m.calories : 0), 0);
        groups.push({ group, count: meals.length, short: `${withCommas(cal)} cal`, long: `${plural(meals.length, 'meal')}, ${withCommas(cal)} cal logged` });
        break;
      }
      case 'workouts': {
        const sessions = mine.map((e) => e.data as GymSession);
        const minutes = sessions.reduce((sum, s) => sum + (finite(s.duration) ? s.duration : 0), 0);
        groups.push({ group, count: sessions.length, short: `${num(minutes)} min`, long: `${plural(sessions.length, 'workout')}, ${num(minutes)} min` });
        break;
      }
      case 'body': {
        const weights = mine.filter((e) => e.type === 'weight').map((e) => (e.data as WeightEntry).weight);
        const waists = mine.filter((e) => e.type === 'waist').map((e) => (e.data as WaistEntry).waist);
        // One reading shows its value. Several readings are not averaged or picked from: they are counted.
        const parts: string[] = [];
        if (weights.length === 1) parts.push(`weight ${num(weights[0])} kg`);
        else if (weights.length > 1) parts.push(`${weights.length} weigh-ins`);
        if (waists.length === 1) parts.push(`waist ${num(waists[0])} cm`);
        else if (waists.length > 1) parts.push(`${waists.length} waist logs`);
        const short = weights.length === 1 ? `${num(weights[0])} kg` : waists.length === 1 && weights.length === 0 ? `${num(waists[0])} cm` : plural(mine.length, 'log');
        groups.push({ group, count: mine.length, short, long: parts.join(', ') });
        break;
      }
      case 'recovery': {
        const sleeps = mine.map((e) => e.data as SleepEntry);
        const hours = sleeps.reduce((sum, s) => sum + (finite(s.hours) ? s.hours : 0), 0);
        groups.push({ group, count: sleeps.length, short: `${num(hours)} h`, long: `sleep ${num(hours)} hours${sleeps.length > 1 ? ` in ${sleeps.length} logs` : ''}` });
        break;
      }
      default:
        groups.push({ group, count: mine.length, short: plural(mine.length, 'note'), long: plural(mine.length, 'note') });
    }
  }
  return { total: entries.length, groups };
};

export interface DayLabelOptions {
  today?: string;
  loading?: boolean;
  /** Areas that failed to load. A day with nothing in the loaded data is then NOT called empty. */
  missing?: readonly CalendarTable[];
}

/** The accessible name of a day button: weekday and date first, then "today", then what was logged. */
export const dayAriaLabel = (iso: string, summary: DaySummary, { today = todayIso(), loading = false, missing = [] }: DayLabelOptions = {}): string => {
  const date = `${formatLongDay(iso)}${iso === today ? ', today' : ''}`;
  if (loading) return date;
  if (summary.total === 0) return missing.length > 0 ? `${date}, no entries in the data that loaded` : `${date}, nothing logged`;
  return `${date}, ${plural(summary.total, 'entry', 'entries')}: ${summary.groups.map((g) => g.long).join('; ')}`;
};

/** How many marker lines a roomy cell shows before collapsing the rest into "+N more". */
export const CELL_LINE_LIMIT = 4;

export const splitForCell = (summary: DaySummary, limit = CELL_LINE_LIMIT): { shown: GroupSummary[]; more: number } => {
  if (summary.groups.length <= limit) return { shown: summary.groups, more: 0 };
  // Keep room for the "+N more" line itself.
  const shown = summary.groups.slice(0, limit - 1);
  return { shown, more: summary.groups.length - shown.length };
};

/* ---------------------------------------------------------------- where the data really is */

/** The six shared tables the calendar reads. */
export type CalendarTable = 'meals' | 'gym_sessions' | 'weight' | 'sleep' | 'waist' | 'daily_notes';
export const CALENDAR_TABLES: readonly CalendarTable[] = ['meals', 'gym_sessions', 'weight', 'waist', 'sleep', 'daily_notes'];

/** Plain words for people, used in notices and the day sentence. */
export const TABLE_LABEL: Record<CalendarTable, string> = {
  meals: 'meals',
  gym_sessions: 'workouts',
  weight: 'weigh-ins',
  waist: 'waist logs',
  sleep: 'sleep logs',
  daily_notes: 'notes',
};

const FILTER_TABLE: Record<Exclude<DisplayFilter, 'all'>, CalendarTable> = {
  meals: 'meals',
  gym: 'gym_sessions',
  weight: 'weight',
  sleep: 'sleep',
  waist: 'waist',
  notes: 'daily_notes',
};

/** The tables a view needs: everything for "All entries", one table for a single-area filter. */
export const requiredTables = (filter: DisplayFilter): CalendarTable[] => (filter === 'all' ? [...CALENDAR_TABLES] : [FILTER_TABLE[filter]]);

/**
 * - `loading`:     something needed is still on its first load (and nothing has failed). Dashes, no claims.
 * - `unavailable`: the first load FAILED and no needed table has loaded, so there is nothing true to show.
 * - `partial`:     some needed tables loaded, some failed. Show what loaded and name what is missing.
 * - `ready`:       everything needed loaded (rows may be stale if a refresh failed; see `stale`).
 */
export type CalendarMode = 'loading' | 'unavailable' | 'partial' | 'ready';

export interface CalendarAvailability {
  mode: CalendarMode;
  required: CalendarTable[];
  /** First load failed. */
  failed: CalendarTable[];
  /** Still on the first load. */
  loading: CalendarTable[];
  /** A refresh failed over rows that did load. */
  stale: CalendarTable[];
  /** Everything that cannot be trusted to be complete right now: failed, plus still loading. */
  missing: CalendarTable[];
}

export const resolveCalendarAvailability = (filter: DisplayFilter, states: Record<CalendarTable, SharedTableState>): CalendarAvailability => {
  const required = requiredTables(filter);
  const view = (t: CalendarTable) => tableView(states[t]);
  const failed = required.filter((t) => view(t) === 'error');
  const loading = required.filter((t) => view(t) === 'loading');
  const stale = required.filter((t) => view(t) === 'ready' && states[t].refreshFailed);
  const readyCount = required.length - failed.length - loading.length;
  const mode: CalendarMode =
    failed.length > 0 ? (readyCount === 0 ? 'unavailable' : 'partial') : loading.length > 0 ? 'loading' : 'ready';
  return { mode, required, failed, loading, stale, missing: [...failed, ...loading] };
};

/** "meals", "meals and notes", "meals, weigh-ins and notes". */
export const joinTableLabels = (tables: readonly CalendarTable[]): string => {
  const labels = tables.map((t) => TABLE_LABEL[t]);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

/** The line under the month name. Never a count that is not true yet. */
export const monthSubtitle = (availability: CalendarAvailability, daysLogged: number): string => {
  switch (availability.mode) {
    case 'loading':
      return 'Loading…';
    case 'unavailable':
      return "Couldn't load your entries";
    case 'partial':
      return `Some entries are missing`;
    default:
      return `${daysLogged} ${daysLogged === 1 ? 'day' : 'days'} with entries`;
  }
};

/* ---------------------------------------------------------------- month totals */

export interface MonthStats {
  /** Days that have at least one record of any kind (not affected by the filter). */
  daysLogged: number;
  daysWithMeals: number;
  workouts: number;
  weighIns: number;
  sleepLogs: number;
  waistLogs: number;
  notes: number;
}

/** The numbers shown above the grid. Always from all records, whatever the filter says. */
export const monthStats = (month: string, source: CalendarSources): MonthStats => {
  const inMonth = (d: string) => d.startsWith(month);
  const logged = new Set<string>();
  const mark = <T extends { date: string }>(rows: T[]): T[] => {
    const mine = rows.filter((r) => inMonth(r.date));
    mine.forEach((r) => logged.add(r.date));
    return mine;
  };
  const meals = mark(source.meals);
  const sessions = mark(source.sessions);
  const weight = mark(source.weight);
  const sleep = mark(source.sleep);
  const waist = mark(source.waist);
  const notes = mark(source.notes);
  return {
    daysLogged: logged.size,
    daysWithMeals: new Set(meals.map((m) => m.date)).size,
    workouts: sessions.length,
    weighIns: weight.length,
    sleepLogs: sleep.length,
    waistLogs: waist.length,
    notes: notes.length,
  };
};

/* ---------------------------------------------------------------- daily agenda */

export interface AgendaItem {
  key: string;
  /** "12:30" when the record stores a time. */
  time: string | null;
  title: string;
  /** Supporting facts under the title. */
  details: string[];
  /** Tags of a daily note. */
  tags?: string[];
}

export interface AgendaSection {
  group: Group;
  heading: string;
  /** Facts shown next to the heading: "2 meals", "1,850 cal logged". */
  facts: string[];
  items: AgendaItem[];
}

const byTimeAsc = (a: AgendaItem, b: AgendaItem): number => {
  if (a.time === b.time) return 0;
  if (a.time === null) return 1;
  if (b.time === null) return -1;
  return a.time < b.time ? -1 : 1;
};

const itemFor = (entry: DayEntry, index: number): AgendaItem => {
  const key = `${entry.type}-${'id' in entry.data ? entry.data.id : index}`;
  switch (entry.type) {
    case 'meal': {
      const m = entry.data;
      const macros = [finite(m.protein) ? `${num(m.protein)} g protein` : '', finite(m.carbs) ? `${num(m.carbs)} g carbs` : ''].filter(Boolean);
      return { key, time: formatClock(m.time), title: m.food, details: [`${num(m.calories)} cal`, ...macros] };
    }
    case 'gym': {
      const s = entry.data;
      const details = [`${num(s.duration)} min`];
      const start = formatClock(s.start_time);
      const end = formatClock(s.end_time);
      if (start && end) details.push(`${start}–${end}`);
      return { key, time: start, title: s.exercise, details };
    }
    case 'weight':
      return { key, time: null, title: `${num(entry.data.weight)} kg`, details: entry.data.notes ? [entry.data.notes] : [] };
    case 'waist':
      return { key, time: null, title: `Waist ${num(entry.data.waist)} cm`, details: entry.data.notes ? [entry.data.notes] : [] };
    case 'sleep':
      return { key, time: null, title: `${num(entry.data.hours)} hours`, details: entry.data.notes ? [entry.data.notes] : [] };
    default: {
      const n = entry.data;
      const details = [n.severity ? `Severity ${n.severity}/5` : '', n.notes ?? ''].filter(Boolean);
      return { key, time: null, title: n.tags.length > 0 ? n.tags.join(', ') : 'Daily note', details, tags: n.tags };
    }
  }
};

/** A day's records grouped by area: meals in time order, everything else in the order saved. */
export const buildAgenda = (entries: readonly DayEntry[]): AgendaSection[] => {
  const summary = summarizeDay(entries);
  const sections: AgendaSection[] = [];
  for (const group of GROUP_ORDER) {
    const mine = entries.map((e, i) => ({ e, i })).filter(({ e }) => groupOf(e.type) === group);
    if (mine.length === 0) continue;
    const items = mine.map(({ e, i }) => itemFor(e, i));
    if (group === 'meals') items.sort(byTimeAsc);
    const sum = summary.groups.find((g) => g.group === group);
    sections.push({ group, heading: GROUP_LABEL[group], facts: sum ? [sum.long] : [], items });
  }
  return sections;
};

const FILTER_NOUN: Record<DisplayFilter, string> = { all: '', meals: 'meal', gym: 'workout', weight: 'weight', sleep: 'sleep', waist: 'waist', notes: 'note' };

/**
 * One sentence under the day's title. "Nothing logged" is only said when every needed table loaded; if some
 * failed, the sentence says what was found in the data that did load and names what is missing.
 */
export const describeDayTotals = (summary: DaySummary, loading: boolean, filter: DisplayFilter, missing: readonly CalendarTable[] = []): string => {
  if (loading) return 'Loading entries…';
  const gap = missing.length > 0 ? ` Couldn't load your ${joinTableLabels(missing)}.` : '';
  if (summary.total === 0) {
    if (missing.length > 0) return `Nothing found in the data that loaded.${gap}`;
    return filter === 'all' ? 'Nothing logged on this day.' : `No ${FILTER_NOUN[filter]} entries on this day.`;
  }
  return `${plural(summary.total, 'entry', 'entries')} across ${plural(summary.groups.length, 'area')}.${gap}`;
};
