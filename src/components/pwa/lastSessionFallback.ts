// Last-session lookup for the workout screen: the network answer first, this device's saved copy second.
// Pure (no React, no aliases) so the exact rule is unit tested.
interface SessionLike {
  id: string;
}

/**
 * - A session from the network always wins; the saved copy is not even read.
 * - The saved copy is used only when the network lookup came back empty (null) or could not run (threw).
 *   The existing lookup in useGymSessions reports every failure as null, so "empty" and "unreachable"
 *   look the same here; falling back is safe because the copy was written from a real server answer.
 * - Nothing is written, queued or invented. No session anywhere stays null.
 */
export const lastSessionWithFallback = async <T extends SessionLike>(
  templateName: string,
  fetchFromNetwork: (templateName: string) => Promise<T | null>,
  readSavedCopy: (templateName: string) => T | null,
): Promise<T | null> => {
  let fromNetwork: T | null = null;
  try {
    fromNetwork = await fetchFromNetwork(templateName);
  } catch {
    fromNetwork = null;
  }
  if (fromNetwork) return fromNetwork;
  try {
    return readSavedCopy(templateName);
  } catch {
    return null;
  }
};
