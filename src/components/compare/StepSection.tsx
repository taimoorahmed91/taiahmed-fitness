import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One numbered step of the Compare flow (1 choose a metric, 2 select records, 3 inspect).
 * A real section with an h2, so the page outline reads as three steps. The number sits in a circle;
 * a finished step swaps it for a check mark (a different shape) and adds "(done)" for screen readers, so progress is never colour-only.
 */
interface StepSectionProps {
  step: number;
  title: ReactNode;
  /** One line under the title that says what to do (or what was picked). */
  hint?: ReactNode;
  done?: boolean;
  /** Controls on the right of the heading (wraps below on phones). */
  actions?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}

export const StepSection = ({ step, title, hint, done = false, actions, id, className, children }: StepSectionProps) => {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className={cn('min-w-0', className)}>
      <Card className="overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b px-[var(--card-pad)] py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                done ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/60 text-foreground',
              )}
            >
              {done ? <Check className="h-4 w-4" /> : step}
            </span>
            <div className="min-w-0">
              <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold leading-tight tracking-tight focus:outline-none">
                <span className="sr-only">Step {step}: </span>
                {title}
                {done && <span className="sr-only"> (done)</span>}
              </h2>
              {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        <div className="p-[var(--card-pad)]">{children}</div>
      </Card>
    </section>
  );
};
