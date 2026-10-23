// Limits background "failed to fetch" toasts: never while offline, and at most
// once per data source every 10 minutes. Errors are still logged to the console.
const lastShown: Record<string, number> = {};
const QUIET_MS = 10 * 60 * 1000;

export const shouldShowFetchError = (key: string, now = Date.now()): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (lastShown[key] && now - lastShown[key] < QUIET_MS) return false;
  lastShown[key] = now;
  return true;
};
