import type { BandTone } from '@/lib/bodyHistory';
import { cn } from '@/lib/utils';

/**
 * A quality / recovery band as a chip: always the WORD, plus a dot and a border for a second cue.
 * Text stays text-foreground on bg-muted (high contrast in both themes); the hue is only ever on the dot and
 * the border, so meaning never depends on colour alone. Class names are written out so Tailwind can see them.
 */
const TONE: Record<BandTone, { border: string; dot: string }> = {
  good: { border: 'border-chart-min', dot: 'bg-chart-min' },
  fair: { border: 'border-chart-warn', dot: 'bg-chart-warn' },
  poor: { border: 'border-chart-max', dot: 'bg-chart-max' },
};

export const BandChip = ({ label, tone, className }: { label: string; tone: BandTone; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-foreground', TONE[tone].border, className)}>
    <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', TONE[tone].dot)} />
    {label}
  </span>
);
