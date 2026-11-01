/**
 * Plain-words messages for opening Compare from a link. Pure, so the wording is tested on its own.
 *
 * Two outputs, deliberately the same sentences:
 *  - `notice`        shown on screen when something in the link could not be used.
 *  - `announcement`  spoken once through the page's polite status region (notice + which records are A and B).
 * Nothing here guesses: a record that is not there is said to be missing, never swapped for another one.
 */
import { CATEGORY_INFO, selectionStatus, type Category, type ComparableEntry, type Slot } from './compareModel';
import type { CompareUrlIssue } from '@/lib/compareUrl';

export interface LinkMessage {
  /** On-screen text, or null when everything in the link worked. */
  notice: string | null;
  /** Spoken text. Never empty. */
  announcement: string;
}

/** What was wrong with the address itself, before any data is needed. null when nothing was. */
export const describeUrlIssues = (issues: readonly CompareUrlIssue[], category: Category | null): string | null => {
  const has = (i: CompareUrlIssue) => issues.includes(i);
  const parts: string[] = [];
  if (has('unknown-category')) parts.push("That link names a metric we don't know, so none is selected. Choose one in step 1.");
  if (has('ids-without-category')) parts.push('That link names records but not a metric, so none were selected.');
  if (has('ids-unsupported-category') && category) {
    parts.push(`Links can only open weigh-ins and sleep logs. ${CATEGORY_INFO[category].label} is open, so pick the records below.`);
  }
  if (has('invalid-id') || has('duplicate-id') || has('extra-values') || has('b-without-a')) {
    parts.push('Part of that link could not be used and was ignored.');
  }
  return parts.length ? parts.join(' ') : null;
};

/**
 * The message after the records the link names have been checked against loaded data.
 *  - `requested`  how many ids the link asked for (1 or 2).
 *  - `missingSlots`  which of them (by their place in the link) are not among the person's records.
 *  - `found`  the records that do exist, in link order (this is the new A, then B).
 *  - `fromLink`  true when the ids came from the address; false when a pick was removed while the page was open.
 */
export const describeLinkResult = (args: { category: Category; requested: number; missingSlots: readonly Slot[]; found: readonly ComparableEntry[]; fromLink: boolean }): LinkMessage => {
  const { category, requested, missingSlots, found, fromLink } = args;
  const noun = CATEGORY_INFO[category].noun;
  const status = selectionStatus(found);
  if (missingSlots.length === 0) return { notice: null, announcement: `Opened from a link. ${status}` };

  let notice: string;
  if (!fromLink) {
    const which = missingSlots.join(' and ');
    notice = found.length === 0
      ? `Record ${which} is no longer available, so no records are selected. Pick two ${noun.many} below.`
      : `Record ${which} is no longer available, so it was removed from your picks. Pick one more ${noun.one} below.`;
  } else if (found.length === 0) {
    const origin = 'It may have been deleted, or belong to a different account.';
    notice = requested === 1
      ? `The ${noun.one} in this link isn't available. ${origin} Pick two ${noun.many} below.`
      : `The ${noun.many} in this link aren't available. ${origin} Pick two ${noun.many} below.`;
  } else {
    const origin = 'It may have been deleted, or belong to a different account.';
    const moved = missingSlots[0] === 'A' ? ' The other one is now A.' : '';
    notice = `Record ${missingSlots.join(' and ')} from this link isn't available. ${origin}${moved} Pick one more ${noun.one} below.`;
  }
  return { notice, announcement: `${notice} ${status}` };
};
