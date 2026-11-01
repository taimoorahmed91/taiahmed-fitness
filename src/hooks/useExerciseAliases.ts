import { useCallback, useSyncExternalStore } from 'react';
import { createExerciseAliasStore } from '@/lib/exerciseAliasStore';
import { mergeExerciseNames, separateExerciseName, type ExerciseAliases } from '@/lib/exerciseAliases';

const store = createExerciseAliasStore(() => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
});

const EMPTY: ExerciseAliases = Object.freeze(Object.create(null)) as ExerciseAliases;

/**
 * Exercise name merges for this device. Every component using it sees the same merges and updates together,
 * including after a merge made in another tab of the browser. Merges are stored in localStorage, not in the account.
 */
export const useExerciseAliases = () => {
  const aliases = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);

  /** Merges the picked names into the first one. Returns the kept name, or null when fewer than two were picked. */
  const mergeNames = useCallback((picked: readonly string[]): string | null => {
    const merged = mergeExerciseNames(store.getSnapshot(), picked);
    if (!merged) return null;
    store.set(merged.aliases);
    return merged.keep;
  }, []);

  const separateName = useCallback((alias: string) => {
    store.set(separateExerciseName(store.getSnapshot(), alias));
  }, []);

  return { aliases, mergeNames, separateName };
};
