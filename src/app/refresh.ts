/**
 * App-wide "refresh my data" contract.
 *
 * The header's refresh action must not reload the whole page. Data lives in
 * per-feature hooks (useMeals, useWeight, ...) with no shared cache, so the
 * header can only ask for a refresh; a data owner has to answer it.
 *
 * To answer it, a data owner (for example useAutoRefresh) subscribes:
 *
 *   useEffect(() => {
 *     const onRefresh = (event: Event) => { event.preventDefault(); refetchAll(); };
 *     window.addEventListener(APP_REFRESH_EVENT, onRefresh);
 *     return () => window.removeEventListener(APP_REFRESH_EVENT, onRefresh);
 *   }, [refetchAll]);
 *
 * Calling preventDefault() tells the sender the request was handled.
 */
export const APP_REFRESH_EVENT = 'fittrack:refresh';

/** Ask the app to refresh its data. Returns true when something handled it. */
export const requestAppRefresh = (): boolean => {
  const event = new CustomEvent(APP_REFRESH_EVENT, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
