import { describe, it, expect } from 'bun:test';
import {
  EXERCISE_ALIAS_STORAGE_KEY,
  listHasAnyName,
  mergeExerciseNames,
  namesForExercise,
  normalizeAliases,
  parseAliasStorage,
  resolveExerciseName,
  separateExerciseName,
} from '../src/lib/exerciseAliases';
import { createExerciseAliasStore } from '../src/lib/exerciseAliasStore';
import { personalRecords } from '../src/lib/workoutStats';

describe('normalizeAliases', () => {
  it('keeps clean pairs and trims names', () => {
    expect({ ...normalizeAliases({ ' Seated Row ': ' Cable Row ' }) }).toEqual({ 'Seated Row': 'Cable Row' });
  });
  it('drops junk: wrong shapes, empty names, non-strings', () => {
    expect({ ...normalizeAliases(null) }).toEqual({});
    expect({ ...normalizeAliases([['a', 'b']]) }).toEqual({});
    expect({ ...normalizeAliases('x') }).toEqual({});
    expect({ ...normalizeAliases({ a: 3, b: '', '': 'c', d: ' ' }) }).toEqual({});
  });
  it('drops a name merged into itself (same-name alias), including after trimming', () => {
    expect({ ...normalizeAliases({ Squat: 'Squat', 'Squat ': ' Squat' }) }).toEqual({});
  });
  it('collapses chains and drops loops', () => {
    expect({ ...normalizeAliases({ A: 'B', B: 'C' }) }).toEqual({ A: 'C', B: 'C' });
    expect({ ...normalizeAliases({ A: 'B', B: 'A' }) }).toEqual({});
    expect({ ...normalizeAliases({ A: 'B', B: 'C', C: 'A', X: 'Y' }) }).toEqual({ X: 'Y' });
  });
  it('has no inherited keys: a movement named like an Object property is not merged', () => {
    const map = normalizeAliases({ Row: 'Cable Row' });
    expect(resolveExerciseName('constructor', map)).toBe('constructor');
    expect(resolveExerciseName('toString', map)).toBe('toString');
    expect(resolveExerciseName('__proto__', map)).toBe('__proto__');
  });
});

describe('parseAliasStorage', () => {
  it('survives missing, broken and wrong-shaped storage', () => {
    expect({ ...parseAliasStorage(null) }).toEqual({});
    expect({ ...parseAliasStorage('') }).toEqual({});
    expect({ ...parseAliasStorage('{nope') }).toEqual({});
    expect({ ...parseAliasStorage('[1,2]') }).toEqual({});
    expect({ ...parseAliasStorage('{"A":"B"}') }).toEqual({ A: 'B' });
  });
});

describe('resolve / names / template matching', () => {
  const aliases = normalizeAliases({ 'Seated Row': 'Cable Row', 'Low Row': 'Cable Row' });
  it('resolves a merged name and leaves others alone', () => {
    expect(resolveExerciseName('Seated Row', aliases)).toBe('Cable Row');
    expect(resolveExerciseName(' Cable Row ', aliases)).toBe('Cable Row');
    expect(resolveExerciseName('Bench', aliases)).toBe('Bench');
  });
  it('lists the kept name first, then merged names, from either end', () => {
    expect(namesForExercise('Cable Row', aliases)).toEqual(['Cable Row', 'Seated Row', 'Low Row']);
    expect(namesForExercise('Seated Row', aliases)).toEqual(['Cable Row', 'Seated Row', 'Low Row']);
    expect(namesForExercise('Bench', aliases)).toEqual(['Bench']);
  });
  it('matches templates case-insensitively', () => {
    expect(listHasAnyName(['seated row'], ['Cable Row', 'Seated Row'])).toBe(true);
    expect(listHasAnyName(['Squat'], ['Cable Row'])).toBe(false);
  });
});

describe('merge and separate', () => {
  it('merges the rest into the first pick and re-points earlier merges', () => {
    const start = normalizeAliases({ 'Old Row': 'Seated Row' });
    const merged = mergeExerciseNames(start, ['Cable Row', 'Seated Row']);
    expect(merged?.keep).toBe('Cable Row');
    expect({ ...merged!.aliases }).toEqual({ 'Seated Row': 'Cable Row', 'Old Row': 'Cable Row' });
    // the input is never mutated
    expect({ ...start }).toEqual({ 'Old Row': 'Seated Row' });
  });
  it('needs two different names', () => {
    expect(mergeExerciseNames({}, ['A'])).toBeNull();
    expect(mergeExerciseNames({}, ['A', ' A '])).toBeNull();
  });
  it('separates one name without touching the rest', () => {
    const next = separateExerciseName(normalizeAliases({ A: 'K', B: 'K' }), 'A');
    expect({ ...next }).toEqual({ B: 'K' });
  });
  it('merged names feed personalRecords exactly as before', () => {
    const merged = mergeExerciseNames({}, ['Cable Row', 'Seated Row'])!.aliases;
    const prs = personalRecords([
      { exercise: 'A', date: '2026-10-01', notes: '1.Seated Row: S1:10@60kg' },
      { exercise: 'B', date: '2026-10-05', notes: '1.Cable Row: S1:8@55kg' },
    ], merged);
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ exercise: 'Cable Row', weight: 60, sessions: 2 });
  });
});

describe('alias store (per device)', () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it('reads what is stored, keeps one object until something changes, and notifies subscribers', () => {
    const storage = memoryStorage();
    storage.data.set(EXERCISE_ALIAS_STORAGE_KEY, '{"Seated Row":"Cable Row"}');
    const store = createExerciseAliasStore(() => storage);
    const first = store.getSnapshot();
    expect({ ...first }).toEqual({ 'Seated Row': 'Cable Row' });
    expect(store.getSnapshot()).toBe(first);
    let calls = 0;
    const off = store.subscribe(() => { calls += 1; });
    expect(store.set(normalizeAliases({ A: 'B' }))).toBe(true);
    expect(calls).toBe(1);
    expect(storage.data.get(EXERCISE_ALIAS_STORAGE_KEY)).toBe('{"A":"B"}');
    expect({ ...store.getSnapshot() }).toEqual({ A: 'B' });
    off();
    store.set({});
    expect(calls).toBe(1);
  });

  it('sees a change written by another tab on the next read', () => {
    const storage = memoryStorage();
    const store = createExerciseAliasStore(() => storage);
    expect({ ...store.getSnapshot() }).toEqual({});
    storage.data.set(EXERCISE_ALIAS_STORAGE_KEY, '{"X":"Y"}');
    expect({ ...store.getSnapshot() }).toEqual({ X: 'Y' });
  });

  it('keeps merges in memory (and says so) when the browser refuses to store them', () => {
    const blocked = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const store = createExerciseAliasStore(() => blocked);
    expect(store.set(normalizeAliases({ A: 'B' }))).toBe(false);
    expect({ ...store.getSnapshot() }).toEqual({ A: 'B' });
    const none = createExerciseAliasStore(() => null);
    expect(none.set(normalizeAliases({ A: 'B' }))).toBe(false);
    expect({ ...none.getSnapshot() }).toEqual({ A: 'B' });
  });

  it('survives a storage that throws on read', () => {
    const store = createExerciseAliasStore(() => ({ getItem: () => { throw new Error('denied'); }, setItem: () => {} }));
    expect({ ...store.getSnapshot() }).toEqual({});
  });
});
