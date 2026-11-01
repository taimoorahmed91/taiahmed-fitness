import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserContext } from '@/contexts/userContextCore';
import type { TableView } from '@/components/feedback/tableView';
import {
  compareSearchNeedsNormalizing,
  decideCompareHistory,
  normalizeCompareSearch,
  parseCompareSearch,
  searchKey,
  toSearchString,
  withCompareSelection,
  type CompareHistoryCause,
} from '@/lib/compareUrl';
import { SLOTS, buildEntries, type Category, type CategoryAvailability, type ComparableEntry, type Slot } from './compareModel';
import { describeLinkResult, describeUrlIssues } from './compareLinkStatus';
import type { GymSession, Meal } from '@/types';
import type { WeightEntry } from '@/hooks/useWeight';
import type { SleepEntry } from '@/hooks/useSleep';

/**
 * Keeps the Compare picks and the page address (`?category=weight&a=<id>&b=<id>`) in step, in both directions.
 * The rules (tested in tests/compareUrl.test.ts and tests/mounted/compareUrl.dom.tsx):
 *
 *  - READ: the first render, a refresh and Back / Forward read the address. Nothing is written back except a cleanup of
 *    parts that could not be used (one `replace`), so opening a link never loops and never adds history.
 *  - WAIT: a named record is only called unavailable once its source has loaded for good (not loading, not failed, not
 *    showing stale rows after a failed refresh). While it loads or has failed, the address and the picks are kept.
 *  - NEVER GUESS: a record that is not in the person's rows is dropped (the remaining pick moves up: it becomes A).
 *    It is never matched by date or replaced by another row.
 *  - WRITE: choosing a different metric adds one history entry; ticking, removing, swapping, clearing and cleanups replace
 *    the current one. Other query parameters are kept.
 *  - ACCOUNT: when the signed-in account changes, picks and address parts are cleared in the same render, so the old
 *    account's ids can never meet the new account's rows.
 */

export interface CompareSources {
  meals: Meal[];
  gym: GymSession[];
  weight: WeightEntry[];
  sleep: SleepEntry[];
}

interface Selection {
  category: Category | null;
  ids: string[];
}

interface LinkStatus {
  notice: string | null;
  announcement: string;
}

const EMPTY: Selection = { category: null, ids: [] };
const NO_STATUS: LinkStatus = { notice: null, announcement: '' };

const sameSelection = (a: Selection, b: Selection): boolean => a.category === b.category && a.ids.length === b.ids.length && a.ids.every((id, i) => id === b.ids[i]);

export const useCompareLink = ({ sources, availability }: { sources: CompareSources; availability: Record<Category, CategoryAvailability> }) => {
  const accountId = useContext(UserContext)?.user?.id ?? null;
  const location = useLocation();
  const navigate = useNavigate();

  const [sel, setSel] = useState<Selection>(() => {
    const parsed = parseCompareSearch(location.search);
    return { category: parsed.category, ids: parsed.ids };
  });
  const [status, setStatus] = useState<LinkStatus>(NO_STATUS);
  // Bumped when the address is read, so a link that names the same picks again still gets checked and announced.
  const [reads, setReads] = useState(0);

  // The account these picks belong to. A different account starts empty in the SAME render (never one frame of old ids).
  const [owner, setOwner] = useState<string | null>(accountId);
  if (owner !== accountId) {
    setOwner(accountId);
    if (owner !== null) setSel(EMPTY);
  }

  const expectedKey = useRef<string | null>(null); // null until the first read, so the first read goes through the same path
  const pending = useRef<{ fromLink: true } | null>(null);
  const latest = useRef({ location, navigate });
  useEffect(() => {
    latest.current = { location, navigate };
  });

  /** The one place the address is written. `replace` or `push` comes from decideCompareHistory. */
  const write = (next: Selection, cause: CompareHistoryCause, from: Category | null) => {
    const { location: loc, navigate: go } = latest.current;
    const params = withCompareSelection(loc.search, next);
    expectedKey.current = searchKey(params);
    setSel((prev) => (sameSelection(prev, next) ? prev : next));
    if (searchKey(params) === searchKey(loc.search)) return;
    const mode = decideCompareHistory({ cause, from, to: next.category });
    go({ pathname: loc.pathname, search: toSearchString(params), hash: loc.hash }, { replace: mode === 'replace' });
  };
  const writeRef = useRef(write);
  useEffect(() => {
    writeRef.current = write;
  });

  // READ the address: first render, refresh, Back / Forward. Our own writes are recognised by their key and skipped.
  useEffect(() => {
    const { location: loc, navigate: go } = latest.current;
    const key = searchKey(loc.search);
    if (key === expectedKey.current) return;
    expectedKey.current = key;
    const parsed = parseCompareSearch(loc.search);
    const next: Selection = { category: parsed.category, ids: parsed.ids };
    setSel((prev) => (sameSelection(prev, next) ? prev : next));
    pending.current = parsed.ids.length > 0 ? { fromLink: true } : null;
    const issueText = describeUrlIssues(parsed.issues, parsed.category);
    setStatus(issueText ? { notice: issueText, announcement: issueText } : NO_STATUS);
    setReads((n) => n + 1);
    if (compareSearchNeedsNormalizing(parsed)) {
      const clean = normalizeCompareSearch(loc.search);
      expectedKey.current = searchKey(clean);
      go({ pathname: loc.pathname, search: toSearchString(clean), hash: loc.hash }, { replace: true });
    }
  }, [location.search]);

  // ACCOUNT: the render above already emptied the picks; this clears the address and the messages.
  const previousAccount = useRef(accountId);
  useEffect(() => {
    const before = previousAccount.current;
    previousAccount.current = accountId;
    if (before !== null && before !== accountId) {
      pending.current = null;
      setStatus(NO_STATUS);
      writeRef.current(EMPTY, 'account', null);
    }
  }, [accountId]);

  const entries = useMemo<ComparableEntry[]>(
    () => buildEntries(sel.category, sources),
    [sel.category, sources.meals, sources.gym, sources.weight, sources.sleep], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const view: TableView = sel.category ? availability[sel.category].view : 'ready';
  const stale = sel.category ? availability[sel.category].stale : false;

  // CHECK the named records once their source has really loaded; announce the result.
  useEffect(() => {
    if (!sel.category || view !== 'ready' || stale) return;
    const have = new Map(entries.map((e) => [e.id, e]));
    const missingSlots: Slot[] = [];
    const found: ComparableEntry[] = [];
    sel.ids.forEach((id, i) => {
      const entry = have.get(id);
      if (entry) found.push(entry);
      else missingSlots.push(SLOTS[i]);
    });
    const fromLink = pending.current !== null;
    if (!fromLink && missingSlots.length === 0) return;
    pending.current = null;
    if (missingSlots.length > 0) writeRef.current({ category: sel.category, ids: found.map((e) => e.id) }, 'prune', sel.category);
    const message = describeLinkResult({ category: sel.category, requested: sel.ids.length, missingSlots, found, fromLink });
    // A link can carry both an address problem (already shown) and an unavailable record: say both, once.
    setStatus((prev) => {
      const earlier = fromLink ? prev.notice : null;
      return {
        notice: [earlier, message.notice].filter(Boolean).join(' ') || null,
        announcement: [earlier, message.announcement].filter(Boolean).join(' '),
      };
    });
  }, [sel, entries, view, stale, reads]);

  const selectCategory = (category: Category) => {
    pending.current = null;
    setStatus(NO_STATUS);
    write({ category, ids: [] }, 'category', sel.category);
  };
  const setIds = (ids: string[]) => {
    pending.current = null;
    setStatus(NO_STATUS);
    write({ category: sel.category, ids }, 'pick', sel.category);
  };
  const reset = () => {
    pending.current = null;
    setStatus(NO_STATUS);
    write(EMPTY, 'category', sel.category);
  };

  return { category: sel.category, ids: sel.ids, entries, view, stale, notice: status.notice, announcement: status.announcement, selectCategory, setIds, reset };
};
