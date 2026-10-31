// Change between consecutive measurements (weight, waist). Dates are ISO
// (YYYY-MM-DD) and compared as UTC calendar days.

export interface DeltaPoint {
  date: string; // MM/DD label of the later measurement
  isoDate: string;
  delta: number;
  days: number;
  perWeek: number;
}

export interface DeltaSummary {
  change: number;
  days: number;
  perWeek: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const utcMs = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
const daysBetween = (a: string, b: string) => Math.round((utcMs(b) - utcMs(a)) / DAY_MS);

export const computeDeltaSeries = (
  entries: { date: string; value: number }[],
  maxIntervals = 10,
): { points: DeltaPoint[]; last: DeltaPoint | null; overall: DeltaSummary | null } => {
  const sorted = entries.filter((e) => e.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return { points: [], last: null, overall: null };

  const all: DeltaPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const days = daysBetween(prev.date, curr.date);
    if (days > 0) {
      const delta = curr.value - prev.value;
      all.push({ date: curr.date.slice(5, 10).replace('-', '/'), isoDate: curr.date.slice(0, 10), delta, days, perWeek: (delta / days) * 7 });
    }
  }

  const first = sorted[0];
  const final = sorted[sorted.length - 1];
  const totalDays = daysBetween(first.date, final.date);
  const change = final.value - first.value;
  const overall = totalDays > 0 ? { change, days: totalDays, perWeek: (change / totalDays) * 7 } : null;

  return { points: all.slice(-maxIntervals), last: all.length ? all[all.length - 1] : null, overall };
};
