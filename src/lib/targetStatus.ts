import { formatNumber } from './chartTheme.ts';

export type TargetStatus = 'under' | 'within' | 'over' | 'none';
export interface TargetRange { min: number; max: number }

export const targetStatusOf = (value: number, r: TargetRange): Exclude<TargetStatus, 'none'> =>
  value < r.min ? 'under' : value > r.max ? 'over' : 'within';

/**
 * One meaning, one colour, one glyph, one word. Class names are written out in
 * full so Tailwind can see them.
 *   within -> chart-min (green)   under -> chart-warn (amber)
 *   over   -> chart-max (red)     none  -> muted
 */
export const STATUS_META: Record<TargetStatus, {
  label: string;
  glyph: string;
  /** Text colour for text on the normal card surface. */
  text: string;
  /** Solid fill (bars, cells); pair with `onFill` for text on top. */
  fill: string;
  onFill: string;
  /** Soft tinted panel. */
  tint: string;
  border: string;
  cssVar: string;
}> = {
  within: { label: 'On target', glyph: '\u2713', text: 'text-chart-min', fill: 'bg-chart-min', onFill: 'text-background', tint: 'bg-chart-min/10', border: 'border-chart-min/40', cssVar: 'hsl(var(--chart-min))' },
  under: { label: 'Under min', glyph: '\u2193', text: 'text-chart-warn', fill: 'bg-chart-warn', onFill: 'text-background', tint: 'bg-chart-warn/10', border: 'border-chart-warn/40', cssVar: 'hsl(var(--chart-warn))' },
  over: { label: 'Over max', glyph: '\u2191', text: 'text-chart-max', fill: 'bg-chart-max', onFill: 'text-background', tint: 'bg-chart-max/10', border: 'border-chart-max/40', cssVar: 'hsl(var(--chart-max))' },
  none: { label: 'Not logged', glyph: '\u2013', text: 'text-muted-foreground', fill: 'bg-muted', onFill: 'text-muted-foreground', tint: 'bg-muted/50', border: 'border-border', cssVar: 'hsl(var(--muted-foreground))' },
};

const n = (value: number) => formatNumber(Math.round(value), 0);

export const formatTargetRange = (r: TargetRange) =>
  Math.round(r.min) === Math.round(r.max) ? n(r.min) : `${n(r.min)}\u2013${n(r.max)}`;

/** Plain-language status line, e.g. "130 cal over your maximum". */
export const describeTarget = (value: number, r: TargetRange, unit: string) => {
  const status = targetStatusOf(value, r);
  const text =
    status === 'under' ? `${n(r.min - value)} ${unit} under your minimum`
    : status === 'over' ? `${n(value - r.max)} ${unit} over your maximum`
    : `Within your ${formatTargetRange(r)} ${unit} target`;
  return { status, label: STATUS_META[status].label, text };
};

/** Copy for the Min / Max rows of a target card. */
export const describeLimit = (value: number, limit: number, kind: 'min' | 'max', unit: string) => {
  const pct = limit > 0 ? Math.round((value / limit) * 100) : 0;
  const gap = Math.round(limit - value);
  const text =
    kind === 'min'
      ? gap > 0 ? `${n(gap)} ${unit} to go` : 'Reached'
      : gap >= 0 ? `${n(gap)} ${unit} left` : `${n(-gap)} ${unit} over`;
  return { text, pct };
};

/** Accessible label for one day of the adherence grid. */
export const adherenceCellLabel = (isoDate: string, status: TargetStatus | null) => `${isoDate}: ${STATUS_META[status ?? 'none'].label}`;
