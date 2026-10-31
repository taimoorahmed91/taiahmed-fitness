import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * One setting, laid out the same everywhere on the page.
 *
 *   desktop (md+)   [ label + description ] [ controls ........................ ]
 *   phone           label + description, then the controls, full width
 *
 * The label column is a fixed width so every label, input and action lines up down the card.
 * Use `htmlFor` when one input answers the label, or `labelId` when the controls form a group
 * (the caller then adds role="group" aria-labelledby={labelId} on that group).
 */
export interface SettingsRowProps {
  label: ReactNode;
  htmlFor?: string;
  labelId?: string;
  description?: ReactNode;
  descriptionId?: string;
  className?: string;
  children: ReactNode;
}

export const SettingsRow = ({ label, htmlFor, labelId, description, descriptionId, className, children }: SettingsRowProps) => (
  <div className={cn('grid gap-x-8 gap-y-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]', className)}>
    <div className="min-w-0 space-y-1">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="text-sm font-semibold leading-snug">{label}</Label>
      ) : (
        <p id={labelId} className="text-sm font-semibold leading-snug">{label}</p>
      )}
      {description && <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>}
    </div>
    <div className="min-w-0 space-y-3">{children}</div>
  </div>
);

/** A small captioned field inside a row, for rows that hold two inputs side by side (date of birth and age, min and max). */
export const FieldLabel = ({ htmlFor, children }: { htmlFor: string; children: ReactNode }) => (
  <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{children}</Label>
);
