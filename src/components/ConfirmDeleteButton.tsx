import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { confirmedSuccess } from '@/lib/confirmedMutation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type Props = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  /**
   * Resolve (or return) `false`, or reject, when the action did NOT happen: the dialog then stays open
   * with an error so the person can retry or cancel. Any other result closes it.
   */
  onConfirm: () => unknown | Promise<unknown>;
  confirmationTitle: string;
  confirmationDescription: string;
  confirmLabel?: string;
};

/** AlertDialog blocks outside dismissal; only an explicit action can delete. */
export const ConfirmDeleteButton = ({
  onConfirm, confirmationTitle, confirmationDescription, confirmLabel = 'Yes, delete',
  children, ...buttonProps
}: Props) => {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const openedAt = useRef(0);
  const armTimer = useRef<number>();

  const clearArmTimer = () => {
    if (armTimer.current !== undefined) window.clearTimeout(armTimer.current);
    armTimer.current = undefined;
  };
  // A pending arm timer must never outlive the dialog (it could arm the next opening early).
  useEffect(() => clearArmTimer, []);

  const changeOpen = (next: boolean) => {
    if (busy.current) return;
    clearArmTimer();
    setOpen(next);
    setError(false);
    setReady(false);
    if (next) openedAt.current = Date.now();
  };

  const confirm = async () => {
    // Ignore trailing mobile taps and concurrent submissions.
    if (busy.current || Date.now() - openedAt.current < 350) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      // Only a confirmed success closes the dialog. `false` or a rejection is a failure: stay open, show why.
      if (await confirmedSuccess(onConfirm)) setOpen(false);
      else setError(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          aria-label={confirmationTitle.replace(/\?$/, '')}
          {...buttonProps}
          className={cn('[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11', buttonProps.className)}
        >
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        className="w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-lg"
        onOpenAutoFocus={() => {
          // Cancel gets initial focus. Arm the destructive action after the opening touch ends.
          clearArmTimer();
          armTimer.current = window.setTimeout(() => setReady(true), 350);
        }}
        onEscapeKeyDown={(event) => { if (busy.current) event.preventDefault(); }}
      >
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="break-words">{confirmationTitle}</AlertDialogTitle>
          <AlertDialogDescription className="break-words whitespace-pre-wrap">{confirmationDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">Could not complete this action. Please try again.</p>}
        {/* Announces when the destructive button becomes usable. */}
        <span role="status" className="sr-only">{ready && !pending ? 'Delete button is ready.' : ''}</span>
        <AlertDialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:space-x-0">
          <AlertDialogCancel disabled={pending} className="mt-0 min-h-11">No, keep it</AlertDialogCancel>
          {/* aria-disabled (not disabled) keeps it reachable by screen readers while it is "arming". */}
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 min-w-11"
            aria-disabled={!ready || pending ? true : undefined}
            loading={pending}
            loadingText="Please wait…"
            onClick={confirm}
          >
            {ready ? <Trash2 aria-hidden="true" /> : <Lock aria-hidden="true" />}
            {ready ? confirmLabel : 'Getting ready…'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};