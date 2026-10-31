/**
 * Paging for grouped history lists (days of meals, weeks of workouts).
 *
 * A group is never split across pages, so a day's or week's header and totals always describe
 * everything shown under it. A page closes once it has `maxGroups` groups or at least
 * `targetItems` rows, whichever comes first (one very busy group simply makes a bigger page).
 */
export interface PageableGroup {
  key: string;
  items: readonly unknown[];
}

export interface PagingOptions {
  maxGroups: number;
  targetItems: number;
}

export const packGroupsIntoPages = <G extends PageableGroup>(groups: readonly G[], { maxGroups, targetItems }: PagingOptions): G[][] => {
  const pages: G[][] = [];
  let current: G[] = [];
  let itemsOnPage = 0;
  for (const group of groups) {
    current.push(group);
    itemsOnPage += group.items.length;
    if (current.length >= Math.max(1, maxGroups) || itemsOnPage >= Math.max(1, targetItems)) {
      pages.push(current);
      current = [];
      itemsOnPage = 0;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
};

export const clampPage = (page: number, totalPages: number): number => Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, totalPages));

/** 1-based inclusive range of groups on a page, plus the total ("days 8–14 of 23"). */
export const pageGroupRange = (pages: readonly (readonly unknown[])[], page: number): { from: number; to: number; total: number } => {
  const total = pages.reduce((sum, p) => sum + p.length, 0);
  if (total === 0) return { from: 0, to: 0, total: 0 };
  const index = clampPage(page, pages.length) - 1;
  const before = pages.slice(0, index).reduce((sum, p) => sum + p.length, 0);
  return { from: before + 1, to: before + pages[index].length, total };
};
