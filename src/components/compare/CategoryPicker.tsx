import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { AlertTriangle, Check, Dumbbell, Moon, Scale, Utensils, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_INFO, CATEGORY_ORDER, tileCountText, type Category, type CategoryAvailability } from './compareModel';

const ICONS: Record<Category, LucideIcon> = { meals: Utensils, gym: Dumbbell, weight: Scale, sleep: Moon };
// Theme-aware chart roles, same icons and colours the page always used for each metric.
const TONES: Record<Category, string> = { meals: 'bg-primary', gym: 'bg-chart-2', weight: 'bg-chart-min', sleep: 'bg-chart-5' };

interface CategoryPickerProps {
  value: Category | null;
  onChange: (category: Category) => void;
  /** How many records each metric has; undefined until it has loaded. */
  counts: Partial<Record<Category, number>>;
  /** Whether each metric is loading, loaded, or failed to load (a failed one is never described as empty). */
  availability: Record<Category, CategoryAvailability>;
}

/**
 * Step 1. Four metrics as a radio group (arrow keys move and select, Tab goes in and out once).
 * Before a choice the tiles are roomy and explain themselves; after it they shrink to a compact row so
 * the picker stays on screen as a "switch metric" control without pushing the records down.
 */
export const CategoryPicker = ({ value, onChange, counts, availability }: CategoryPickerProps) => {
  const compact = value !== null;
  return (
    <RadioGroupPrimitive.Root
      aria-label="Metric to compare"
      orientation="horizontal"
      value={value ?? ''}
      onValueChange={(next) => next && onChange(next as Category)}
      className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
    >
      {CATEGORY_ORDER.map((id) => {
        const info = CATEGORY_INFO[id];
        const Icon = ICONS[id];
        const selected = value === id;
        const failed = availability[id].view === 'error';
        return (
          <RadioGroupPrimitive.Item
            key={id}
            value={id}
            className={cn(
              'group relative flex min-h-11 w-full min-w-0 rounded-lg border bg-card text-left ring-offset-background',
              'transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              '[@media(hover:hover)]:hover:border-primary',
              compact ? 'items-center gap-2 px-3 py-2' : 'flex-col gap-2 p-3 sm:p-4',
              selected ? 'border-primary bg-primary/10 ring-2 ring-primary' : 'border-border',
            )}
          >
            <span className={cn('flex shrink-0 items-center justify-center rounded-full', TONES[id], compact ? 'h-7 w-7' : 'h-10 w-10')}>
              <Icon className={cn('text-background', compact ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden="true" />
            </span>
            <span className={cn('min-w-0 flex-1', selected && 'pr-6')}>
              <span className="block text-sm font-semibold text-foreground">{info.label}</span>
              {/* Kept in the DOM when compact (screen readers still get the hint); only hidden visually. */}
              <span className={cn('block text-xs text-muted-foreground', compact && 'sr-only')}>{info.hint}</span>
              {/* A failed metric keeps its status visible even in the compact row: it must never look merely empty. */}
              <span className={cn('flex items-center gap-1 text-xs', failed ? 'font-medium text-foreground' : 'text-muted-foreground', compact && !failed && 'sr-only')}>
                {failed && <AlertTriangle className="h-3 w-3 shrink-0 text-[hsl(var(--chart-warn))]" aria-hidden="true" />}
                {tileCountText(id, counts[id], availability[id])}
              </span>
            </span>
            {selected && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground',
                  compact ? 'top-1/2 -translate-y-1/2' : 'top-2',
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
};
