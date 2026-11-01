/**
 * The Compare address, as one pure contract (no React, no router, no components).
 *
 *     /compare?category=weight&a=<recordId>&b=<recordId>
 *
 *  - `category`  one of `meals`, `gym`, `weight`, `sleep`. It says which metric is open, so Back / Forward and a
 *                refresh keep it. Any other value is dropped.
 *  - `a`, `b`    the stored id of the first and the second pick. ORDER IS MEANING: A is the baseline and the change
 *                is always B minus A. Ids are never sorted by date and never matched by date.
 *
 * Which records a link may name ("eligible"): ONLY exact Weight entries (`category=weight`) and exact MANUAL Sleep logs
 * (`category=sleep`). Waist is not supported, a WHOOP sleep row is not a manual sleep log, and a daily or weekly
 * aggregate is not a record. Meals and Gym can be opened as a metric (`category=meals`) but their picks are not
 * written to the address, so `a` / `b` next to them are ignored.
 *
 * Reading never throws and never guesses: bad, repeated, duplicated or third values are ignored and reported as
 * `issues`; the person's other query parameters are never touched. Whether an id still exists is NOT decided here:
 * that needs the loaded rows, so the page checks it after its data has loaded (see components/compare/useCompareLink.ts).
 *
 * The chart owner builds a link with `buildCompareHref` / `buildCompareHrefFromRefs`; nothing else should assemble this
 * address by hand.
 */

export const COMPARE_PATH = '/compare';
export const COMPARE_CATEGORY_PARAM = 'category';
export const COMPARE_A_PARAM = 'a';
export const COMPARE_B_PARAM = 'b';

/** Same four values as the Compare page's `Category` (tests/compareUrl.test.ts keeps them equal). */
export const COMPARE_URL_CATEGORIES = ['meals', 'gym', 'weight', 'sleep'] as const;
export type CompareUrlCategory = (typeof COMPARE_URL_CATEGORIES)[number];

/** The categories whose exact records a link may name. */
export const COMPARE_LINK_CATEGORIES = ['weight', 'sleep'] as const;
export type CompareLinkCategory = (typeof COMPARE_LINK_CATEGORIES)[number];

export const MAX_COMPARE_IDS = 2;
/** Ids are database uuids; this is a sanity bound, not a format rule. */
const MAX_ID_LENGTH = 128;

export const isCompareUrlCategory = (value: unknown): value is CompareUrlCategory =>
  typeof value === 'string' && (COMPARE_URL_CATEGORIES as readonly string[]).includes(value);

export const isCompareLinkCategory = (value: unknown): value is CompareLinkCategory =>
  typeof value === 'string' && (COMPARE_LINK_CATEGORIES as readonly string[]).includes(value);

/** A usable record id: text, trimmed, no spaces or control characters, not absurdly long. */
export const isCompareRecordId = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return false; // control characters and spaces
  }
  return !/\s/.test(value); // other whitespace, such as a no-break space
};

const toParams = (search: string | URLSearchParams): URLSearchParams => (search instanceof URLSearchParams ? search : new URLSearchParams(search));

/** Stable text for comparing two addresses' queries ("?a=1" and "a=1" are the same). */
export const searchKey = (search: string | URLSearchParams): string => toParams(search).toString();

/** `?x=1` or `` (never a lone `?`), ready for `navigate({ search })`. */
export const toSearchString = (params: URLSearchParams): string => {
  const text = params.toString();
  return text ? `?${text}` : '';
};

/* ------------------------------------------------------------------ reading */

export type CompareUrlIssue =
  /** `category` was present but is not one of the four metrics. */
  | 'unknown-category'
  /** `a` / `b` were given without a usable `category`, so there is no way to know what they point at. */
  | 'ids-without-category'
  /** `a` / `b` were given for Meals or Gym, whose picks are not link-addressable. */
  | 'ids-unsupported-category'
  /** An id was empty, had spaces or was too long. */
  | 'invalid-id'
  /** The same id was given twice. */
  | 'duplicate-id'
  /** `a` or `b` was repeated (`a=1&a=2`). Only the first value counts. */
  | 'extra-values'
  /** `b` was given but `a` was missing or unusable, so the only record moved to A. */
  | 'b-without-a';

export interface ParsedCompareUrl {
  /** The metric to open, or null. */
  category: CompareUrlCategory | null;
  /** Ordered picks: A first, B second. Empty unless the category is a link category. At most two, no duplicates. */
  ids: string[];
  /** Everything that was ignored or changed, in no particular order, each kind at most once. */
  issues: CompareUrlIssue[];
}

export const parseCompareSearch = (search: string | URLSearchParams): ParsedCompareUrl => {
  const params = toParams(search);
  const issues = new Set<CompareUrlIssue>();

  const rawCategory = params.get(COMPARE_CATEGORY_PARAM);
  let category: CompareUrlCategory | null = null;
  if (rawCategory !== null) {
    if (isCompareUrlCategory(rawCategory)) category = rawCategory;
    else issues.add('unknown-category');
  }
  if (params.getAll(COMPARE_CATEGORY_PARAM).length > 1) issues.add('extra-values');

  const readSlot = (name: string): string | null => {
    const all = params.getAll(name);
    if (all.length > 1) issues.add('extra-values');
    if (all.length === 0) return null;
    if (isCompareRecordId(all[0])) return all[0];
    issues.add('invalid-id');
    return null;
  };
  const a = readSlot(COMPARE_A_PARAM);
  const b = readSlot(COMPARE_B_PARAM);

  const named = [a, b].some((v) => v !== null) || params.has(COMPARE_A_PARAM) || params.has(COMPARE_B_PARAM);
  let ids: string[] = [];
  if (named) {
    if (category === null) issues.add('ids-without-category');
    else if (!isCompareLinkCategory(category)) issues.add('ids-unsupported-category');
    else {
      if (a !== null && b !== null && a === b) {
        issues.add('duplicate-id');
        ids = [a];
      } else {
        ids = [a, b].filter((v): v is string => v !== null);
        if (a === null && b !== null) issues.add('b-without-a');
      }
    }
  }
  return { category, ids, issues: [...issues] };
};

/** The address's issues are worth rewriting when anything was ignored. A clean address is left exactly as typed. */
export const compareSearchNeedsNormalizing = (parsed: ParsedCompareUrl): boolean => parsed.issues.length > 0;

/* ------------------------------------------------------------------ writing */

export interface CompareSelection {
  category: CompareUrlCategory | null;
  ids: readonly string[];
}

/**
 * A copy of the query with the Compare parameters set to `selection`. Every other parameter keeps its place and value.
 * `a` / `b` are only written for a link category (and only the first two distinct, valid ids); with no category all three are removed.
 */
export const withCompareSelection = (search: string | URLSearchParams, selection: CompareSelection): URLSearchParams => {
  const next = new URLSearchParams(toParams(search));
  next.delete(COMPARE_CATEGORY_PARAM);
  next.delete(COMPARE_A_PARAM);
  next.delete(COMPARE_B_PARAM);
  if (!selection.category) return next;
  next.set(COMPARE_CATEGORY_PARAM, selection.category);
  if (isCompareLinkCategory(selection.category)) {
    const ids = selection.ids.filter((id, i, all) => isCompareRecordId(id) && all.indexOf(id) === i).slice(0, MAX_COMPARE_IDS);
    if (ids[0] !== undefined) next.set(COMPARE_A_PARAM, ids[0]);
    if (ids[1] !== undefined) next.set(COMPARE_B_PARAM, ids[1]);
  }
  return next;
};

/** The same query with everything bad removed, from what `parseCompareSearch` understood. */
export const normalizeCompareSearch = (search: string | URLSearchParams): URLSearchParams => {
  const parsed = parseCompareSearch(search);
  return withCompareSelection(search, { category: parsed.category, ids: parsed.ids });
};

/* ------------------------------------------------------------------ history */

/**
 * Why the address is being rewritten.
 *  - `category`   the person chose a metric, or started over.
 *  - `pick`       the person ticked, removed, swapped or cleared a record.
 *  - `normalize`  the address held something unusable and is being cleaned.
 *  - `prune`      a named record turned out not to exist (after the data loaded).
 *  - `account`    a different account signed in, so nothing from the last one may stay in the address.
 */
export type CompareHistoryCause = 'category' | 'pick' | 'normalize' | 'prune' | 'account';

export type HistoryMode = 'push' | 'replace';

/**
 * One rule for the browser history, so Back never walks through a pile of tick marks:
 *  - Choosing a DIFFERENT metric (or starting over) adds an entry: Back returns to the metric and picks you had.
 *  - Everything else (picks, swaps, cleanups, pruning, account reset) REPLACES the current entry.
 *  - Hydrating from the address never writes at all.
 */
export const decideCompareHistory = (args: { cause: CompareHistoryCause; from: CompareUrlCategory | null; to: CompareUrlCategory | null }): HistoryMode =>
  args.cause === 'category' && args.from !== args.to ? 'push' : 'replace';

/* ------------------------------------------------------------------ links built by other pages (the chart owner) */

/** `/compare?category=weight&a=ID1&b=ID2`, or null when the category or an id is not usable, or there are not 1 to 2 distinct ids. Order is kept: first id is A. */
export const buildCompareHref = (category: unknown, recordIds: readonly unknown[]): string | null => {
  if (!isCompareLinkCategory(category)) return null;
  if (!recordIds.every(isCompareRecordId)) return null;
  const ids = recordIds.filter((id, i, all) => all.indexOf(id) === i);
  if (ids.length < 1 || ids.length > MAX_COMPARE_IDS) return null;
  const search = toSearchString(withCompareSelection('', { category, ids }));
  return `${COMPARE_PATH}${search}`;
};

/**
 * What a chart point is, in the same words as the app's SelectedDay origin (src/lib/selectedDay.ts), plus where the
 * row came from. Only the first three decide eligibility.
 */
export interface CompareRecordRef {
  kind: 'record' | 'daily-aggregate' | 'period-aggregate';
  /** "weight", "sleep", "waist"... the metric the chart shows. Never a display label. */
  metric: string;
  /** The stored row's id. Never an array index and never a date. */
  recordId?: string;
  /** Which table the row is from. Leave it out (or "manual") for the person's own logs; "whoop" or anything else is not eligible. */
  source?: string;
}

export type CompareIneligibleReason =
  | 'not-a-record'
  | 'missing-record-id'
  | 'unsupported-metric'
  | 'not-manual-source'
  | 'mixed-metrics'
  | 'wrong-record-count';

export type CompareEligibility = { eligible: true; category: CompareLinkCategory; recordId: string } | { eligible: false; reason: CompareIneligibleReason };

const METRIC_TO_CATEGORY: Readonly<Record<string, CompareLinkCategory>> = { weight: 'weight', sleep: 'sleep' };

/** Whether ONE chart point can be sent to Compare, and as which category. Waist, WHOOP rows and aggregates say no. */
export const compareEligibility = (ref: CompareRecordRef): CompareEligibility => {
  if (!ref || ref.kind !== 'record') return { eligible: false, reason: 'not-a-record' };
  if (!Object.prototype.hasOwnProperty.call(METRIC_TO_CATEGORY, ref.metric)) return { eligible: false, reason: 'unsupported-metric' };
  if (ref.source !== undefined && ref.source !== 'manual') return { eligible: false, reason: 'not-manual-source' };
  if (!isCompareRecordId(ref.recordId)) return { eligible: false, reason: 'missing-record-id' };
  return { eligible: true, category: METRIC_TO_CATEGORY[ref.metric], recordId: ref.recordId };
};

export type CompareHrefResult =
  | { ok: true; href: string; category: CompareLinkCategory; recordIds: string[] }
  | { ok: false; reason: CompareIneligibleReason };

/**
 * The link for one or two chart points, in the order given (first is A, second is B; never sorted by date).
 * Every point must be eligible and in the same category, otherwise there is no link and the reason says why,
 * so the chart can leave its Compare action out or explain it.
 */
export const buildCompareHrefFromRefs = (refs: readonly CompareRecordRef[]): CompareHrefResult => {
  if (refs.length < 1 || refs.length > MAX_COMPARE_IDS) return { ok: false, reason: 'wrong-record-count' };
  const good: Extract<CompareEligibility, { eligible: true }>[] = [];
  for (const ref of refs) {
    const check = compareEligibility(ref);
    if (check.eligible === true) good.push(check);
    else return { ok: false, reason: (check as { reason: CompareIneligibleReason }).reason };
  }
  if (good.some((g) => g.category !== good[0].category)) return { ok: false, reason: 'mixed-metrics' };
  const recordIds = good.map((g) => g.recordId).filter((id, i, all) => all.indexOf(id) === i);
  const href = buildCompareHref(good[0].category, recordIds);
  return href ? { ok: true, href, category: good[0].category, recordIds } : { ok: false, reason: 'wrong-record-count' };
};
