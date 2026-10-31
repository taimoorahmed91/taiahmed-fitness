import type { ReactNode } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { cn } from '@/lib/utils';

/**
 * Row actions for history lists, in the two shapes the lists use:
 *  - "tray": labelled, full-size (44px) buttons in a small grid, revealed inside an expanded row on phones.
 *  - "inline": compact icon buttons with tooltips beside the row on wider screens.
 * Both shapes take the same props, so an action is defined once. `label` is the accessible name
 * (say what it does to what: "Edit Chicken bowl"); `text` is the short visible word in the tray.
 */
export type HistoryActionVariant = 'tray' | 'inline';

/** Hover/focus reveal for inline actions. Where there is no hover (touch), they are always visible. */
const INLINE_REVEAL =
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 group-focus-within/row:opacity-100 transition-opacity motion-reduce:transition-none';

export const ActionTray = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div role="group" aria-label={label} className={className}>
    {/* A quiet caption and rule, so the buttons read as the end of the open row rather than a separate block. */}
    <p aria-hidden="true" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Actions
      <span className="h-px flex-1 bg-border" />
    </p>
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{children}</div>
  </div>
);

/** The compact icon cluster that sits beside a row on wider screens. Width is fixed so columns stay aligned. */
export const HistoryInlineActions = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div role="group" aria-label={label} className={cn('flex shrink-0 items-center justify-end gap-1 py-1.5 pr-2', INLINE_REVEAL, className)}>
    {children}
  </div>
);

interface HistoryActionProps {
  variant: HistoryActionVariant;
  label: string;
  text: string;
  /** Tooltip for the inline icon. Defaults to `text`. */
  tooltip?: string;
  icon: ReactNode;
  onClick: () => void;
  /** Toggle state (for example "pinned"). Adds aria-pressed and a filled look in the tray. */
  pressed?: boolean;
  /** Draws the eye first in the tray. */
  emphasis?: boolean;
  className?: string;
}

const TRAY_BUTTON = 'h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-center sm:w-auto sm:min-w-36 sm:flex-1 sm:basis-36 sm:max-w-52';

export const HistoryAction = ({ variant, label, text, tooltip, icon, onClick, pressed, emphasis, className }: HistoryActionProps) => {
  if (variant === 'inline') {
    return (
      <IconButton label={label} tooltip={tooltip ?? text} size="sm" aria-pressed={pressed} onClick={onClick} className={className}>
        {icon}
      </IconButton>
    );
  }
  return (
    <Button
      type="button"
      variant={emphasis ? 'default' : 'outline'}
      size="touch"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(TRAY_BUTTON, !emphasis && 'bg-card', pressed && !emphasis && 'border-primary bg-accent text-accent-foreground', className)}
    >
      {icon}
      {text}
      {/* A tick as well as the tint, so an "on" toggle never depends on colour. */}
      {pressed && <Check aria-hidden="true" />}
    </Button>
  );
};

interface HistoryDeleteProps {
  variant: HistoryActionVariant;
  /** Accessible name, for example "Delete Chicken bowl". */
  label: string;
  confirmationTitle: string;
  confirmationDescription: string;
  onConfirm: () => unknown | Promise<unknown>;
  className?: string;
}

/** Delete is always behind ConfirmDeleteButton (its dialog, cancel-first focus and arming delay), in either shape. */
export const HistoryDeleteAction = ({ variant, label, confirmationTitle, confirmationDescription, onConfirm, className }: HistoryDeleteProps) =>
  variant === 'inline' ? (
    <ConfirmDeleteButton
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', className)}
      onConfirm={onConfirm}
      confirmationTitle={confirmationTitle}
      confirmationDescription={confirmationDescription}
      aria-label={label}
    >
      <Trash2 aria-hidden="true" className="h-4 w-4 text-destructive" />
    </ConfirmDeleteButton>
  ) : (
    <ConfirmDeleteButton
      variant="outline"
      size="touch"
      className={cn(TRAY_BUTTON, 'border-destructive/50 text-destructive', className)}
      onConfirm={onConfirm}
      confirmationTitle={confirmationTitle}
      confirmationDescription={confirmationDescription}
      aria-label={label}
    >
      <Trash2 aria-hidden="true" />
      Delete
    </ConfirmDeleteButton>
  );
