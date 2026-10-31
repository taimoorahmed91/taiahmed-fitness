import { CHART_COLORS } from '@/lib/chartTheme';

/**
 * Marks a day that has a note. A diamond in the neutral foreground colour, so it
 * is not confused with status colours (over max etc.) and not colour-only.
 */
export const NoteDiamond = ({ cx, cy }: { cx?: number; cy?: number }) => {
  if (cx == null || cy == null) return null;
  const r = 7;
  return <path d={`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`} fill={CHART_COLORS.foreground} stroke={CHART_COLORS.card} strokeWidth={2} />;
};
