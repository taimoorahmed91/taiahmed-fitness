import { AlertCircle } from 'lucide-react';

/** Inline, linked error text: the icon and the wording carry the meaning, not just the red colour. */
export const InlineError = ({ id, message }: { id: string; message?: string | null }) =>
  message ? (
    <p id={id} className="flex items-start gap-1.5 text-sm text-destructive">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  ) : null;
