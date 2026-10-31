import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface InlineUndoProps {
  /** e.g. `Removed “Squat”`. Pass null/undefined to hide. */
  message: string | null | undefined;
  onUndo: () => void;
}

/**
 * Undo that lives INSIDE a dialog or form. Toasts sit outside a modal dialog, where keyboard focus is
 * trapped, so they can't be reached there. The live region is always mounted so the message is announced.
 */
function InlineUndo({ message, onUndo }: InlineUndoProps) {
  return (
    <div role="status" aria-live="polite">
      {message ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-1.5 text-sm">
          <span className="min-w-0 break-words">{message}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onUndo} className="shrink-0">
            <Undo2 aria-hidden="true" />
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export { InlineUndo };
