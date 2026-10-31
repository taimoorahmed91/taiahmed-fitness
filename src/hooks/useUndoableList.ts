import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** Pure helpers (exported so they can be tested without React). */
export function removeAt<T>(items: readonly T[], index: number): T[] {
  if (index < 0 || index >= items.length) return [...items];
  return items.filter((_, i) => i !== index);
}

export function restoreAt<T>(items: readonly T[], index: number, value: T): T[] {
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, value);
  return next;
}

export interface RemovedItem<T> {
  index: number;
  value: T;
}

/**
 * Remove an item from a local (unsaved) list right away, with a short window to take it back.
 * Use this for form rows that are not saved anywhere yet. Saved records still need a confirmation.
 */
export function useUndoableList<T>(items: T[], setItems: Dispatch<SetStateAction<T[]>>, windowMs = 8000) {
  const [removed, setRemoved] = useState<RemovedItem<T> | null>(null);

  useEffect(() => {
    if (!removed) return;
    const id = window.setTimeout(() => setRemoved(null), windowMs);
    return () => window.clearTimeout(id);
  }, [removed, windowMs]);

  const remove = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) return;
      setRemoved({ index, value: items[index] });
      setItems((prev) => removeAt(prev, index));
    },
    [items, setItems],
  );

  const undo = useCallback(() => {
    if (!removed) return;
    setItems((prev) => restoreAt(prev, removed.index, removed.value));
    setRemoved(null);
  }, [removed, setItems]);

  const dismiss = useCallback(() => setRemoved(null), []);

  return { removed, remove, undo, dismiss };
}
