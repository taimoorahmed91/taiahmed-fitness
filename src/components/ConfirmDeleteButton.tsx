import { useRef, useState, type ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type Props = Omit<ComponentProps<typeof Button>, 'onClick'> & {
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

  const changeOpen = (next: boolean) => {
    if (busy.current) return;
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
      await onConfirm();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" aria-label={confirmationTitle.replace(/\?$/, '')} {...buttonProps}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        className="w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-lg"
        onOpenAutoFocus={() => {
          // Cancel gets initial focus. Arm the destructive action after the opening touch ends.
          window.setTimeout(() => setReady(true), 350);
        }}
        onEscapeKeyDown={(event) => { if (busy.current) event.preventDefault(); }}
      >
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="break-words">{confirmationTitle}</AlertDialogTitle>
          <AlertDialogDescription className="break-words whitespace-pre-wrap">{confirmationDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">Could not complete this action. Please try again.</p>}
        <AlertDialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:space-x-0">
          <AlertDialogCancel disabled={pending} className="mt-0 min-h-11">No, keep it</AlertDialogCancel>
          <Button type="button" variant="destructive" className="min-h-11" disabled={!ready || pending} onClick={confirm}>
            {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Please wait…</> : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};