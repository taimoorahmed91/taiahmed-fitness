/**
 * Scrolls a history row into view and moves keyboard focus onto it. Used when something outside the list (a chart point's
 * "Jump to entry") points at one exact row.
 *
 * Rows carry `data-history-row="<record id>"` (HistoryRow's `rowId`). Where the row has a disclosure button (every phone
 * row, and desktop rows with long notes) the button gets focus: it is a real control with a name and a focus ring.
 * Otherwise the row itself is focused (HistoryRow makes it focusable with tabindex -1 for this).
 * Returns the focused element, or null when the row is not on screen.
 */
export const focusHistoryRow = (root: ParentNode | null, rowId: string): HTMLElement | null => {
  if (!root) return null;
  const row = [...root.querySelectorAll<HTMLElement>('[data-history-row]')].find((el) => el.getAttribute('data-history-row') === rowId);
  if (!row) return null;
  const target = row.querySelector<HTMLElement>(':scope > div > button[aria-expanded]') ?? row;
  const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  // preventScroll: the scroll above already placed the row (a second, instant scroll would cancel the smooth one).
  target.focus({ preventScroll: true });
  return target;
};
