/**
 * The look of each kind of history, kept in one place so a list and its headings never drift apart.
 *
 * Every variant is made only from the app's existing colour tokens (no new hues), and every class name is written
 * out in full so Tailwind can see it. Colour is only ever decoration here: each cue also has a word, a shape or a
 * position, so nothing depends on seeing a hue.
 *
 *  - default      the quiet grey look (Weight, WHOOP). Unchanged.
 *  - meal         warm, the brand colour: a daily ledger with a timeline of meals.
 *  - workout      cool and structured: a weekly log with metric strips.
 *  - sleep        calm and soft: a restful tint with a duration bar.
 *  - measurement  neutral ink: a ruler-like axis with tick marks, no good/bad colour.
 */
export type HistoryVariant = 'default' | 'meal' | 'workout' | 'sleep' | 'measurement';

export interface HistoryVariantStyle {
  /** Group heading surface: a faint tint over the card, plus a thin inset bar on the left edge. */
  header: string;
  /** Icon tile beside a group heading. */
  marker: string;
  /** Accent for small glyphs and the open chevron. */
  text: string;
  /** Solid accent fill (dots, bars, filled squares). */
  fill: string;
  /** Outline accent (hollow dots). */
  edge: string;
  /** A row that is open: a faint tint and a bar on its left edge. */
  open: string;
  /** The panel that opens under a row. */
  panel: string;
  /** Rule between rows in a group. */
  divide: string;
}

export const HISTORY_VARIANTS: Record<HistoryVariant, HistoryVariantStyle> = {
  default: {
    header: 'bg-muted',
    marker: 'bg-card text-muted-foreground border',
    text: 'text-muted-foreground',
    fill: 'bg-muted-foreground',
    edge: 'border-muted-foreground',
    open: 'bg-muted/30',
    panel: 'border-t border-dashed',
    divide: 'divide-y divide-border',
  },
  meal: {
    header: 'bg-accent/40 shadow-[inset_3px_0_0_0_hsl(var(--primary))]',
    marker: 'bg-primary/10 text-primary',
    text: 'text-primary',
    fill: 'bg-primary',
    edge: 'border-primary',
    open: 'bg-accent/25 shadow-[inset_3px_0_0_0_hsl(var(--primary))]',
    panel: 'border-t border-primary/20',
    divide: '',
  },
  workout: {
    header: 'bg-chart-2/[0.07] shadow-[inset_3px_0_0_0_hsl(var(--chart-2))]',
    marker: 'bg-chart-2/10 text-chart-2',
    text: 'text-chart-2',
    fill: 'bg-chart-2',
    edge: 'border-chart-2',
    open: 'bg-chart-2/[0.06] shadow-[inset_3px_0_0_0_hsl(var(--chart-2))]',
    panel: 'border-t border-chart-2/25',
    divide: 'divide-y divide-border/70',
  },
  sleep: {
    header: 'bg-chart-3/[0.07] shadow-[inset_3px_0_0_0_hsl(var(--chart-3))]',
    marker: 'bg-chart-3/10 text-chart-3',
    text: 'text-chart-3',
    fill: 'bg-chart-3',
    edge: 'border-chart-3',
    open: 'bg-chart-3/[0.06] shadow-[inset_3px_0_0_0_hsl(var(--chart-3))]',
    panel: 'border-t border-chart-3/25',
    divide: 'divide-y divide-border/50',
  },
  measurement: {
    header: 'bg-muted/60 shadow-[inset_3px_0_0_0_hsl(var(--foreground)/0.6)]',
    marker: 'bg-foreground/[0.07] text-foreground',
    text: 'text-foreground',
    fill: 'bg-foreground/70',
    edge: 'border-foreground/70',
    open: 'bg-muted/50 shadow-[inset_3px_0_0_0_hsl(var(--foreground)/0.6)]',
    panel: 'border-t border-border',
    divide: '',
  },
};
