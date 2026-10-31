import { toast } from "sonner";

export interface UndoToastOptions {
  /** What just happened, e.g. "Meal deleted". */
  message: string;
  /** Reverses the change. May be async. If it throws, an error toast is shown. */
  onUndo: () => void | Promise<void>;
  /**
   * Optional: runs once when the toast goes away WITHOUT Undo (timeout or dismissed).
   * Use it to finish a deferred delete. Not called after Undo.
   */
  onCommit?: () => void | Promise<void>;
  description?: string;
  undoLabel?: string;
  /** Milliseconds. Default 8000 (long enough to notice and react). */
  duration?: number;
  /** Reuse an id to replace an earlier toast instead of stacking. */
  id?: string | number;
}

/** Toast with an Undo button. Undo and commit each run at most once. Returns the toast id. */
export function showUndoToast({
  message,
  onUndo,
  onCommit,
  description,
  undoLabel = "Undo",
  duration = 8000,
  id,
}: UndoToastOptions): string | number {
  let settled = false;

  const commit = () => {
    if (settled) return;
    settled = true;
    void Promise.resolve(onCommit?.()).catch(() => toast.error("Couldn't finish that change"));
  };

  return toast(message, {
    id,
    description,
    duration,
    action: {
      label: undoLabel,
      onClick: () => {
        if (settled) return;
        settled = true;
        void Promise.resolve(onUndo()).catch(() => toast.error("Couldn't undo that change"));
      },
    },
    onDismiss: commit,
    onAutoClose: commit,
  });
}
