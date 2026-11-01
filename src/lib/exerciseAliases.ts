// Exercise name merges ("aliases"): pure rules shared by the Records tab, the workout detail and the history dialog.
//
// A merge says "these saved names are the same movement": { 'Seated Row': 'Cable Row' } shows Seated Row sets
// under Cable Row. The map lives in localStorage on THIS device only (it is not part of the account), so another
// browser or phone can group the same names differently. Nothing here touches storage; see useExerciseAliases.

/** Saved name -> the name it is merged into. */
export type ExerciseAliases = Record<string, string>;

/** localStorage key for the per-device merge map. Kept as it always was so existing merges keep working. */
export const EXERCISE_ALIAS_STORAGE_KEY = 'fittrack-exercise-aliases';

const MAX_HOPS = 8;

const has = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** A fresh map with no inherited keys, so a movement called "constructor" or "toString" can never match by accident. */
const emptyAliases = (): ExerciseAliases => Object.create(null) as ExerciseAliases;

/** The name as it is compared: trimmed. Case and spelling are NOT guessed at, to match how records are counted. */
export const cleanExerciseName = (name: unknown): string => (typeof name === 'string' ? name.trim() : '');

/**
 * Makes anything read from storage safe to use:
 *  - only string -> string pairs with real names survive;
 *  - a name merged into itself is dropped ("same-name alias");
 *  - chains collapse to their final name (A -> B -> C becomes A -> C);
 *  - a loop (A -> B -> A) is dropped rather than guessed at.
 * Always returns a new, prototype-free object.
 */
export const normalizeAliases = (value: unknown): ExerciseAliases => {
  const direct = emptyAliases();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [rawKey, rawTarget] of Object.entries(value as Record<string, unknown>)) {
      const key = cleanExerciseName(rawKey);
      const target = cleanExerciseName(rawTarget);
      if (key && target && key !== target) direct[key] = target;
    }
  }
  const result = emptyAliases();
  for (const key of Object.keys(direct)) {
    let current = direct[key];
    let hops = 0;
    while (has(direct, current) && hops < MAX_HOPS) {
      current = direct[current];
      hops += 1;
    }
    // Still an alias after MAX_HOPS, or back where it started: a loop.
    if (has(direct, current) || current === key) continue;
    result[key] = current;
  }
  return result;
};

/** Reads the stored JSON text. Missing, broken or wrong-shaped text gives an empty map. */
export const parseAliasStorage = (raw: string | null | undefined): ExerciseAliases => {
  if (!raw) return emptyAliases();
  try {
    return normalizeAliases(JSON.parse(raw));
  } catch {
    return emptyAliases();
  }
};

export const serializeAliases = (aliases: ExerciseAliases): string => JSON.stringify(aliases);

/** The name a saved exercise is counted under: its merge target, or itself when it is not merged. */
export const resolveExerciseName = (name: string, aliases: ExerciseAliases): string => {
  const clean = cleanExerciseName(name);
  return has(aliases, clean) && aliases[clean] ? aliases[clean] : clean;
};

/** `exercise` followed by every saved name merged into it, in the order they were merged. */
export const namesForExercise = (exercise: string, aliases: ExerciseAliases): string[] => {
  const canonical = resolveExerciseName(exercise, aliases);
  return [canonical, ...Object.keys(aliases).filter((alias) => aliases[alias] === canonical && alias !== canonical)];
};

/** Case-insensitive "is any of `list` one of `names`" (used to match templates to a merged exercise). */
export const listHasAnyName = (list: readonly string[], names: readonly string[]): boolean =>
  list.some((entry) => names.some((name) => name.toLowerCase() === entry.toLowerCase()));

/**
 * Merges the picked names into the first one picked (it keeps its name). Everything that already pointed at a
 * merged name is re-pointed, so there are never chains. Fewer than two names changes nothing (returns null).
 */
export const mergeExerciseNames = (aliases: ExerciseAliases, picked: readonly string[]): { aliases: ExerciseAliases; keep: string } | null => {
  const names = [...new Set(picked.map(cleanExerciseName).filter(Boolean))];
  if (names.length < 2) return null;
  const [keep, ...rest] = names;
  const next = normalizeAliases(aliases);
  for (const name of rest) {
    for (const alias of Object.keys(next)) if (next[alias] === name) next[alias] = keep;
    next[name] = keep;
  }
  delete next[keep];
  return { aliases: next, keep };
};

/** Splits one saved name back out of its merge. */
export const separateExerciseName = (aliases: ExerciseAliases, alias: string): ExerciseAliases => {
  const next = normalizeAliases(aliases);
  delete next[cleanExerciseName(alias)];
  return next;
};
