import { useMemo, useState } from 'react';
import { clampPage, packGroupsIntoPages, pageGroupRange, type PageableGroup, type PagingOptions } from '@/lib/historyPaging';

/**
 * Pages made of whole groups. `resetKey` changes (filters, search, sort) send the list back to page 1.
 * The page itself is kept here, so a day or week is never cut in half between pages.
 */
export const useGroupPagination = <G extends PageableGroup>(groups: readonly G[], options: PagingOptions & { resetKey: string }) => {
  const { maxGroups, targetItems, resetKey } = options;
  const pages = useMemo(() => packGroupsIntoPages(groups, { maxGroups, targetItems }), [groups, maxGroups, targetItems]);
  const [state, setState] = useState({ page: 1, key: resetKey });
  const page = state.key !== resetKey ? 1 : clampPage(state.page, pages.length);
  const goToPage = (next: number) => setState({ page: clampPage(next, pages.length), key: resetKey });
  return {
    pageGroups: pages[page - 1] ?? [],
    page,
    totalPages: Math.max(1, pages.length),
    range: pageGroupRange(pages, page),
    goToPage,
    hasNextPage: page < pages.length,
    hasPrevPage: page > 1,
  };
};
