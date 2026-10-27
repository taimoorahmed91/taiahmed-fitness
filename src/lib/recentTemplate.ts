/** Days (UTC calendar) since this template was last logged, or null if never. */
export function daysSinceTemplate(
  sessions: { exercise?: string; date: string }[],
  templateName: string,
  todayIso: string,
): number | null {
  const name = templateName.trim().toLowerCase();
  let best: number | null = null;
  const today = Date.parse(todayIso + 'T00:00:00Z');
  for (const s of sessions) {
    if (s.exercise?.trim().toLowerCase() !== name) continue;
    const d = Math.round((today - Date.parse(s.date + 'T00:00:00Z')) / 86400000);
    if (d >= 0 && (best === null || d < best)) best = d;
  }
  return best;
}

/** Done 1 or 2 days ago → still recovering (under ~48h). */
export const isRecentlyDone = (days: number | null) => days === 1 || days === 2;
