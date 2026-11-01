// The one place exercise merges are read from and written to localStorage (this device only, never the account).
// Every screen that shows or changes merges goes through a store like this, so a merge made on the Records tab is
// seen by an open workout detail without a second copy of the storage rules.
import {
  EXERCISE_ALIAS_STORAGE_KEY,
  normalizeAliases,
  parseAliasStorage,
  serializeAliases,
  type ExerciseAliases,
} from '@/lib/exerciseAliases';

export interface AliasStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const EMPTY: ExerciseAliases = Object.freeze(Object.create(null)) as ExerciseAliases;

export interface ExerciseAliasStore {
  /** The current merges. The same object is returned until they change (safe for useSyncExternalStore). */
  getSnapshot: () => ExerciseAliases;
  /** Saves new merges and tells every subscriber. Returns false when the browser would not store them (kept in memory only). */
  set: (next: ExerciseAliases) => boolean;
  subscribe: (listener: () => void) => () => void;
}

/** `getStorage` is called each time so a blocked or missing localStorage is handled where it happens. */
export const createExerciseAliasStore = (getStorage: () => AliasStorageLike | null): ExerciseAliasStore => {
  const listeners = new Set<() => void>();
  // Only set while the browser refuses to store: the merges then live in memory for this page view.
  let memoryRaw: string | undefined;
  let cache: { raw: string | null; value: ExerciseAliases } | null = null;

  const readRaw = (): string | null => {
    if (memoryRaw !== undefined) return memoryRaw;
    try {
      return getStorage()?.getItem(EXERCISE_ALIAS_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };

  const getSnapshot = () => {
    const raw = readRaw();
    if (cache && cache.raw === raw) return cache.value;
    const value = raw === null ? EMPTY : parseAliasStorage(raw);
    cache = { raw, value };
    return value;
  };

  const notify = () => listeners.forEach((listener) => listener());

  const set = (next: ExerciseAliases) => {
    const clean = normalizeAliases(next);
    const raw = serializeAliases(clean);
    let stored = true;
    try {
      const storage = getStorage();
      if (!storage) throw new Error('no storage');
      storage.setItem(EXERCISE_ALIAS_STORAGE_KEY, raw);
      memoryRaw = undefined;
    } catch {
      memoryRaw = raw;
      stored = false;
    }
    cache = { raw, value: clean };
    notify();
    return stored;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === EXERCISE_ALIAS_STORAGE_KEY) listener();
    };
    const target = typeof window !== 'undefined' ? window : null;
    target?.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      target?.removeEventListener('storage', onStorage);
    };
  };

  return { getSnapshot, set, subscribe };
};
