// Offline copy of the two things a workout needs before it can start:
// the user's workout templates and, per template, the previous session
// (for the "last: reps × kg" hints). Pure functions over a Storage-like object,
// so every rule is unit tested and nothing here touches React or the network.
//
// Rules (deliberately strict):
//  - READ-ONLY data, written only after a successful server read (or after a
//    successful template change). Nothing is ever queued for upload.
//  - Keys are versioned. A new version simply ignores old entries.
//  - Every entry records the user id it belongs to and is never served to anyone else.
//  - Anything corrupt, odd or too old reads as "no cache" (and is removed), never as an error.
//  - Meals, weight, sleep and every other table are NOT cached here.
import type { GymSession } from '../types';

export const OFFLINE_CACHE_VERSION = 1;
export const TEMPLATES_CACHE_KEY = `fittrack:v${OFFLINE_CACHE_VERSION}:cache:workout-templates`;
export const LAST_SESSIONS_CACHE_KEY = `fittrack:v${OFFLINE_CACHE_VERSION}:cache:last-sessions`;
/** Cached data older than this is ignored: better to show nothing than very stale templates. */
export const MAX_CACHE_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** Skip writing anything bigger than this (localStorage is ~5 MB for the whole origin). */
const MAX_PAYLOAD_CHARS = 400_000;
const MAX_TEMPLATES = 200;
const MAX_NOTES_CHARS = 20_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}

export interface CachedTemplate {
  id: string;
  name: string;
  exercises: string[];
  created_at: string;
  updated_at: string;
}

interface Envelope<T> {
  v: number;
  userId: string;
  savedAt: number;
  data: T;
}

export interface CacheRead<T> {
  data: T;
  savedAt: number;
}

/** The browser's localStorage, or null where it is blocked (private mode, SSR, tests). */
export const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const readEnvelope = (storage: StorageLike | null, key: string, userId: string | null, now: number): Envelope<unknown> | null => {
  if (!storage || !userId) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      isRecord(parsed) &&
      parsed.v === OFFLINE_CACHE_VERSION &&
      typeof parsed.userId === 'string' &&
      typeof parsed.savedAt === 'number' &&
      'data' in parsed
    ) {
      // Someone else's data, or too old: ignore, but leave it (the owner may come back).
      if (parsed.userId !== userId) return null;
      if (now - parsed.savedAt > MAX_CACHE_AGE_MS || parsed.savedAt > now + 24 * 60 * 60 * 1000) return null;
      return parsed as unknown as Envelope<unknown>;
    }
  } catch {
    /* fall through: corrupt JSON */
  }
  // Unreadable or wrong shape: drop it so it cannot keep failing.
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
  return null;
};

const writeEnvelope = (storage: StorageLike | null, key: string, userId: string | null, data: unknown, now: number): boolean => {
  if (!storage || !userId) return false;
  try {
    const payload = JSON.stringify({ v: OFFLINE_CACHE_VERSION, userId, savedAt: now, data } satisfies Envelope<unknown>);
    if (payload.length > MAX_PAYLOAD_CHARS) return false;
    storage.setItem(key, payload);
    return true;
  } catch {
    return false; // quota exceeded or storage blocked: offline copy is best effort
  }
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const sanitizeTemplate = (t: unknown): CachedTemplate | null => {
  if (!isRecord(t) || typeof t.id !== 'string' || typeof t.name !== 'string' || !Array.isArray(t.exercises)) return null;
  return {
    id: t.id,
    name: t.name,
    exercises: t.exercises.filter((e): e is string => typeof e === 'string'),
    created_at: typeof t.created_at === 'string' ? t.created_at : '',
    updated_at: typeof t.updated_at === 'string' ? t.updated_at : '',
  };
};

export const writeTemplatesCache = (
  userId: string | null,
  templates: CachedTemplate[],
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): boolean => {
  const items = templates.map(sanitizeTemplate).filter((t): t is CachedTemplate => t !== null).slice(0, MAX_TEMPLATES);
  return writeEnvelope(storage, TEMPLATES_CACHE_KEY, userId, items, now);
};

export const readTemplatesCache = (
  userId: string | null,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): CacheRead<CachedTemplate[]> | null => {
  const env = readEnvelope(storage, TEMPLATES_CACHE_KEY, userId, now);
  if (!env) return null;
  if (!Array.isArray(env.data)) {
    storage?.removeItem(TEMPLATES_CACHE_KEY);
    return null;
  }
  // Order is preserved exactly as stored; invalid entries are dropped one by one.
  const items = env.data.map(sanitizeTemplate).filter((t): t is CachedTemplate => t !== null);
  return { data: items, savedAt: env.savedAt };
};

// ---------------------------------------------------------------------------
// Last session per template name
// ---------------------------------------------------------------------------

type LastSessions = Record<string, GymSession>;

const sanitizeSession = (s: unknown): GymSession | null => {
  if (!isRecord(s) || typeof s.id !== 'string' || typeof s.exercise !== 'string' || typeof s.date !== 'string') return null;
  const duration = Number(s.duration);
  if (!Number.isFinite(duration)) return null;
  const out: GymSession = { id: s.id, exercise: s.exercise, duration, date: s.date };
  if (typeof s.notes === 'string') out.notes = s.notes.slice(0, MAX_NOTES_CHARS);
  if (typeof s.start_time === 'string') out.start_time = s.start_time;
  if (typeof s.end_time === 'string') out.end_time = s.end_time;
  return out;
};

/**
 * The most recent session for each template name. `sessions` must already be newest first
 * (the same order the server query uses); the first one seen for a name wins.
 */
export const pickLastSessions = (sessions: GymSession[], templateNames: string[]): LastSessions => {
  const wanted = new Set(templateNames);
  const out: LastSessions = {};
  for (const s of sessions) {
    if (wanted.has(s.exercise) && !out[s.exercise]) {
      const clean = sanitizeSession(s);
      if (clean) out[s.exercise] = clean;
    }
  }
  return out;
};

export const writeLastSessionsCache = (
  userId: string | null,
  byTemplateName: LastSessions,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): boolean => writeEnvelope(storage, LAST_SESSIONS_CACHE_KEY, userId, byTemplateName, now);

export const readLastSessionsCache = (
  userId: string | null,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): CacheRead<LastSessions> | null => {
  const env = readEnvelope(storage, LAST_SESSIONS_CACHE_KEY, userId, now);
  if (!env) return null;
  if (!isRecord(env.data)) {
    storage?.removeItem(LAST_SESSIONS_CACHE_KEY);
    return null;
  }
  const out: LastSessions = {};
  for (const [name, value] of Object.entries(env.data)) {
    const clean = sanitizeSession(value);
    if (clean) out[name] = clean;
  }
  return { data: out, savedAt: env.savedAt };
};

export const readCachedLastSession = (
  userId: string | null,
  templateName: string,
  now = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): GymSession | null => readLastSessionsCache(userId, now, storage)?.data[templateName] ?? null;

/** Removes both offline copies (sign-out, or a different user on this device). */
export const clearWorkoutOfflineCache = (storage: StorageLike | null = defaultStorage()): void => {
  for (const key of [TEMPLATES_CACHE_KEY, LAST_SESSIONS_CACHE_KEY]) {
    try {
      storage?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
};

// ---------------------------------------------------------------------------
// Who is the user while offline?
// ---------------------------------------------------------------------------

/**
 * User id from the session Supabase keeps in localStorage (`sb-<project>-auth-token`).
 * After an hour offline the access token expires and `getSession()` cannot refresh it, so it
 * reports "no user" even though the person never signed out. The stored session still tells
 * us who they are. Returns null when there is no stored session (really signed out).
 */
export const readStoredSessionUserId = (storage: StorageLike | null = defaultStorage()): string | null => {
  if (!storage || typeof storage.key !== 'function' || typeof storage.length !== 'number') return null;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null');
      const user = isRecord(parsed) ? parsed.user : null;
      if (isRecord(user) && typeof user.id === 'string' && user.id) return user.id;
    }
  } catch {
    /* corrupt session entry: treat as signed out */
  }
  return null;
};

/** The live user if there is one; otherwise, only while offline, the user of the stored session. */
export const resolveOfflineUserId = (
  liveUserId: string | null,
  online: boolean,
  storage: StorageLike | null = defaultStorage(),
): string | null => {
  if (liveUserId) return liveUserId;
  return online ? null : readStoredSessionUserId(storage);
};

// ---------------------------------------------------------------------------
// When may the offline copy be used?
// ---------------------------------------------------------------------------

/**
 * True for "could not reach the server" failures, false for real server answers
 * (permission denied, bad request, ...). Only the first kind may fall back to the offline copy,
 * so a server "no" is never papered over with old data.
 */
export const isNetworkFailure = (error: unknown, online: boolean): boolean => {
  if (!online) return true;
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown; status?: unknown; code?: unknown };
  // A response with an HTTP status (even 5xx) came from a server that answered.
  if (typeof e.status === 'number' && e.status > 0) return false;
  if (typeof e.code === 'string' && e.code !== '') return false; // PostgREST / Postgres error codes
  const text = `${typeof e.name === 'string' ? e.name : ''} ${typeof e.message === 'string' ? e.message : ''}`.toLowerCase();
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|err_internet_disconnected/.test(text);
};

// ---------------------------------------------------------------------------
// Choosing between the server answer and the offline copy
// ---------------------------------------------------------------------------

export type TemplatesFetchResult = { ok: true; templates: CachedTemplate[] } | { ok: false; error: unknown };

export type TemplatesOutcome =
  | { source: 'server'; templates: CachedTemplate[] }
  | { source: 'cache'; templates: CachedTemplate[]; savedAt: number }
  /** Nothing usable: the caller shows its normal error. */
  | { source: 'none' };

/**
 * A successful server read always wins. The offline copy is used ONLY when the server could not be
 * reached (never for a real server refusal) and a valid copy for this user exists.
 */
export const chooseTemplates = (input: {
  fetch: TemplatesFetchResult;
  online: boolean;
  cache: CacheRead<CachedTemplate[]> | null;
}): TemplatesOutcome => {
  const fetched = input.fetch;
  if (fetched.ok === true) return { source: 'server', templates: fetched.templates };
  if (input.cache && isNetworkFailure(fetched.error, input.online)) {
    return { source: 'cache', templates: input.cache.data, savedAt: input.cache.savedAt };
  }
  return { source: 'none' };
};
