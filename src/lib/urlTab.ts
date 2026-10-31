/**
 * Keeps "which tab is open" in the page address (for example `/gym?tab=templates`),
 * so a refresh, a shared link and the browser Back / Forward buttons all land on
 * the tab the person was looking at.
 *
 * Rules:
 *  - Only tab names the page lists are accepted. Anything else (a typo, an old
 *    link) quietly falls back to the default tab. The address is not rewritten.
 *  - The default tab is never written to the address, so `/gym` stays clean and
 *    going back to the default tab simply removes the `tab` part.
 *  - Other query parameters are kept as they were.
 */

export const TAB_PARAM = 'tab';

const toParams = (search: string | URLSearchParams): URLSearchParams =>
  search instanceof URLSearchParams ? search : new URLSearchParams(search);

/** The tab named in the address, or `fallback` when it is missing or not one of `allowed`. */
export const readTabParam = <T extends string>(
  search: string | URLSearchParams,
  allowed: readonly T[],
  fallback: T,
  param: string = TAB_PARAM,
): T => {
  const value = toParams(search).get(param);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
};

/** A copy of the query with `tab` set (or removed when it is the default). Other parameters are kept. */
export const withTabParam = <T extends string>(
  search: string | URLSearchParams,
  tab: T,
  defaultTab: T,
  param: string = TAB_PARAM,
): URLSearchParams => {
  const next = new URLSearchParams(toParams(search));
  if (tab === defaultTab) next.delete(param);
  else next.set(param, tab);
  return next;
};
