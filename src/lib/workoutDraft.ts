// Identity-bound storage for the workout that is in progress on this device. Pure functions over a
// Storage-like object (no React, no network, no clock reads except through `now`), so every rule is
// unit tested.
//
// WHY THIS EXISTS
//   Before, one browser key held one draft with no owner. Anyone who signed in next could resume it
//   (and save it into their own account), and a failed write was silent.
//
// MODEL
//   ACTIVE slot  `fittrack-active-workout`   one versioned envelope { v: 2, userId, savedAt, state }.
//                The key name is unchanged on purpose: the PWA update guard (swPolicy.hasActiveWorkout)
//                keeps working because "key present" still means "a workout is in progress".
//   PARKED       `fittrack:v2:parked-workout:<userId>`   a user's draft that is not in the active slot
//                (they signed out, or someone else signed in). Never lost, never shown to anyone else.
//   QUARANTINE   `fittrack:v2:quarantined-workouts`      drafts that have no provable owner (written
//                before identity binding existed) or that could not be parsed. Kept, never deleted by
//                the app on its own, never resumed by anyone without an explicit "this is mine" tap.
//
// INVARIANTS
//   1. A user can only ever read/resume their own envelope (`envelope.userId === userId`).
//   2. A write never replaces anything that is not the writer's own draft for the same workout: foreign,
//      legacy and unreadable content is first moved to PARKED/QUARANTINE. If that move fails, the write fails.
//   3. Every write is read back. `ok: true` means the bytes are really in storage.
//   4. A different workout of the same user is never silently replaced either ('conflict').
//
// LEGACY MIGRATION (draft with no owner)
//   - Auto-adopted ONLY when it can be proven to belong to the signed-in user: its template id is one of
//     that user's own templates (template ids are server-side private to their owner). Manual workouts
//     (`manual-...`) and anything else cannot be proven.
//   - Otherwise it is QUARANTINED and the user is asked once on the Gym page: "Restore to my account" or
//     "Discard". While templates are still loading the decision is deferred (the draft stays untouched).
import { hasAnySet, type ActiveWorkoutState, type WorkoutData } from './workoutSession';
import { defaultStorage, type StorageLike } from './workoutOfflineCache';

export const ACTIVE_DRAFT_KEY = 'fittrack-active-workout';
export const DRAFT_VERSION = 2;
export const PARKED_DRAFT_PREFIX = 'fittrack:v2:parked-workout:';
export const QUARANTINE_KEY = 'fittrack:v2:quarantined-workouts';
/** Oldest quarantined entries are dropped beyond this many (only reachable with several stale app versions open). */
export const MAX_QUARANTINED = 5;
const MAX_RAW_KEPT = 50_000;

export { defaultStorage };
export type { StorageLike };

export interface DraftEnvelope {
  v: 2;
  userId: string;
  savedAt: number;
  state: ActiveWorkoutState;
}

export interface QuarantinedWorkout {
  id: string;
  reason: 'legacy-unattributed' | 'corrupt' | 'superseded';
  quarantinedAt: number;
  /** Set when the owner is known (superseded copies). Unattributed legacy drafts have none. */
  ownerId?: string;
  state?: ActiveWorkoutState;
  /** Unparseable text, kept for support/recovery by hand. Never resumed. */
  raw?: string;
}

export type PersistFailure = 'unavailable' | 'quota' | 'no-identity' | 'blocked' | 'conflict';
export type WriteResult = { ok: true; where: 'active' | 'parked' } | { ok: false; reason: PersistFailure };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const isDraftState = (v: unknown): v is ActiveWorkoutState =>
  isRecord(v) &&
  typeof v.templateId === 'string' &&
  v.templateId !== '' &&
  typeof v.startTime === 'string' &&
  !Number.isNaN(Date.parse(v.startTime));

/** The exercise list the workout was started with (the saved snapshot), or null if it was not stored. */
export const draftExercises = (state: Pick<ActiveWorkoutState, 'exercises'>): string[] | null =>
  Array.isArray(state.exercises) && state.exercises.every((x) => typeof x === 'string') ? [...state.exercises] : null;

const parkedKey = (userId: string) => `${PARKED_DRAFT_PREFIX}${userId}`;

// ---------------------------------------------------------------------------
// Storage primitives (every failure is reported, never thrown)
// ---------------------------------------------------------------------------

const isQuotaError = (e: unknown): boolean => {
  const x = e as { name?: unknown; code?: unknown; message?: unknown } | null;
  return (
    x?.name === 'QuotaExceededError' ||
    x?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    x?.code === 22 ||
    x?.code === 1014 ||
    (typeof x?.message === 'string' && /quota/i.test(x.message))
  );
};

type Verified = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' };

const setVerified = (storage: StorageLike, key: string, value: string): Verified => {
  try {
    storage.setItem(key, value);
  } catch (e) {
    return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable' };
  }
  try {
    // Some browsers accept a write and then forget it (private modes, storage pressure).
    if (storage.getItem(key) !== value) return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: true };
};

const removeVerified = (storage: StorageLike, key: string): boolean => {
  try {
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
};

type RawRead = { kind: 'none' } | { kind: 'error' } | { kind: 'value'; raw: string };
const readRaw = (storage: StorageLike, key: string): RawRead => {
  try {
    const raw = storage.getItem(key);
    return raw === null || raw === '' ? { kind: 'none' } : { kind: 'value', raw };
  } catch {
    return { kind: 'error' };
  }
};

// ---------------------------------------------------------------------------
// Reading the active slot
// ---------------------------------------------------------------------------

export type SlotContent =
  | { kind: 'empty' }
  | { kind: 'unreadable' }
  | { kind: 'draft'; envelope: DraftEnvelope; raw: string }
  | { kind: 'legacy'; state: ActiveWorkoutState; raw: string }
  | { kind: 'corrupt'; raw: string };

const asEnvelope = (parsed: unknown): DraftEnvelope | null =>
  isRecord(parsed) &&
  parsed.v === DRAFT_VERSION &&
  typeof parsed.userId === 'string' &&
  parsed.userId !== '' &&
  typeof parsed.savedAt === 'number' &&
  isDraftState(parsed.state)
    ? (parsed as unknown as DraftEnvelope)
    : null;

const classify = (raw: string): Exclude<SlotContent, { kind: 'empty' } | { kind: 'unreadable' }> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', raw };
  }
  const envelope = asEnvelope(parsed);
  if (envelope) return { kind: 'draft', envelope, raw };
  // Anything carrying a version marker we do not understand is kept as-is (quarantined), never reinterpreted.
  if (isRecord(parsed) && 'v' in parsed) return { kind: 'corrupt', raw };
  if (isDraftState(parsed)) return { kind: 'legacy', state: parsed, raw };
  return { kind: 'corrupt', raw };
};

export const readSlot = (storage: StorageLike | null): SlotContent => {
  if (!storage) return { kind: 'unreadable' };
  const read = readRaw(storage, ACTIVE_DRAFT_KEY);
  if (read.kind === 'error') return { kind: 'unreadable' };
  if (read.kind === 'none') return { kind: 'empty' };
  return classify(read.raw);
};

type ParkedRead = { kind: 'none' } | { kind: 'error' } | { kind: 'draft'; envelope: DraftEnvelope };
const readParked = (storage: StorageLike, userId: string): ParkedRead => {
  const read = readRaw(storage, parkedKey(userId));
  if (read.kind !== 'value') return read;
  const c = classify(read.raw);
  // A parked draft that is not this user's own valid envelope is never served; it is quarantined by the caller.
  if (c.kind === 'draft' && c.envelope.userId === userId) return { kind: 'draft', envelope: c.envelope };
  quarantine(storage, { reason: 'corrupt', raw: read.raw.slice(0, MAX_RAW_KEPT) }, Date.now());
  removeVerified(storage, parkedKey(userId));
  return { kind: 'none' };
};

// ---------------------------------------------------------------------------
// Quarantine
// ---------------------------------------------------------------------------

const readQuarantine = (storage: StorageLike): { ok: true; list: QuarantinedWorkout[] } | { ok: false } => {
  const read = readRaw(storage, QUARANTINE_KEY);
  if (read.kind === 'error') return { ok: false };
  if (read.kind === 'none') return { ok: true, list: [] };
  try {
    const parsed: unknown = JSON.parse(read.raw);
    if (!Array.isArray(parsed)) return { ok: true, list: [] };
    const list = parsed.filter(
      (e): e is QuarantinedWorkout => isRecord(e) && typeof e.id === 'string' && typeof e.quarantinedAt === 'number',
    );
    return { ok: true, list };
  } catch {
    return { ok: true, list: [] };
  }
};

let idCounter = 0;
const newId = (now: number) => `q-${now.toString(36)}-${(idCounter++).toString(36)}`;

/** Appends an entry. Returns false when it could not be stored (the caller must then not remove the original). */
const quarantine = (
  storage: StorageLike,
  entry: Omit<QuarantinedWorkout, 'id' | 'quarantinedAt'>,
  now: number,
): boolean => {
  const current = readQuarantine(storage);
  if (!current.ok) return false;
  const list = [...current.list, { ...entry, id: newId(now), quarantinedAt: now }].slice(-MAX_QUARANTINED);
  return setVerified(storage, QUARANTINE_KEY, JSON.stringify(list)).ok;
};

const quarantineSlot = (storage: StorageLike, slot: SlotContent, now: number): boolean => {
  if (slot.kind === 'legacy') return quarantine(storage, { reason: 'legacy-unattributed', state: slot.state }, now);
  if (slot.kind === 'corrupt') return quarantine(storage, { reason: 'corrupt', raw: slot.raw.slice(0, MAX_RAW_KEPT) }, now);
  return true;
};

/** Quarantined workouts this user may be offered: unattributed legacy drafts and their own superseded copies. */
export const listClaimable = (storage: StorageLike | null, userId: string | null): QuarantinedWorkout[] => {
  if (!storage || !userId) return [];
  const q = readQuarantine(storage);
  if (!q.ok) return [];
  return q.list.filter(
    (e) => !!e.state && isDraftState(e.state) && (e.ownerId === userId || (e.reason === 'legacy-unattributed' && !e.ownerId)),
  );
};

export const discardQuarantined = (storage: StorageLike | null, id: string): boolean => {
  if (!storage) return false;
  const q = readQuarantine(storage);
  if (!q.ok) return false;
  const next = q.list.filter((e) => e.id !== id);
  if (next.length === q.list.length) return true;
  return next.length === 0 ? removeVerified(storage, QUARANTINE_KEY) : setVerified(storage, QUARANTINE_KEY, JSON.stringify(next)).ok;
};

export type ClaimResult = { ok: true } | { ok: false; reason: 'not-found' | 'busy' | 'unavailable' };

/** The user explicitly says "this workout is mine". Never overwrites a workout already in progress. */
export const claimQuarantined = (
  storage: StorageLike | null,
  userId: string | null,
  id: string,
  now = Date.now(),
): ClaimResult => {
  if (!storage || !userId) return { ok: false, reason: 'unavailable' };
  const entry = listClaimable(storage, userId).find((e) => e.id === id);
  if (!entry?.state) return { ok: false, reason: 'not-found' };
  const slot = readSlot(storage);
  if (slot.kind === 'unreadable') return { ok: false, reason: 'unavailable' };
  if (slot.kind !== 'empty') return { ok: false, reason: 'busy' };
  const written = setVerified(storage, ACTIVE_DRAFT_KEY, JSON.stringify({ v: DRAFT_VERSION, userId, savedAt: now, state: entry.state } satisfies DraftEnvelope));
  if (!written.ok) return { ok: false, reason: 'unavailable' };
  discardQuarantined(storage, id);
  return { ok: true };
};

// ---------------------------------------------------------------------------
// Parking
// ---------------------------------------------------------------------------

/** Puts an envelope in its owner's parked slot. If one is already there, the newer wins and the older is quarantined. */
const parkEnvelope = (storage: StorageLike, env: DraftEnvelope, now: number): boolean => {
  const existing = readParked(storage, env.userId);
  if (existing.kind === 'error') return false;
  if (existing.kind === 'none') return setVerified(storage, parkedKey(env.userId), JSON.stringify(env)).ok;
  const [newer, older] = existing.envelope.savedAt >= env.savedAt ? [existing.envelope, env] : [env, existing.envelope];
  if (!quarantine(storage, { reason: 'superseded', ownerId: env.userId, state: older.state }, now)) return false;
  return newer === existing.envelope || setVerified(storage, parkedKey(env.userId), JSON.stringify(newer)).ok;
};

/**
 * Sign-out: move this user's draft out of the active slot into their own parked slot, so the next person
 * to sign in finds nothing, and this user finds it again when they return. Nothing is deleted.
 */
export const parkActiveDraft = (storage: StorageLike | null, userId: string | null, now = Date.now()): boolean => {
  if (!storage || !userId) return false;
  const slot = readSlot(storage);
  if (slot.kind === 'empty') return true;
  if (slot.kind === 'unreadable') return false;
  if (slot.kind === 'draft') {
    if (slot.envelope.userId !== userId) return true; // someone else's: not ours to touch
    return parkEnvelope(storage, slot.envelope, now) && removeVerified(storage, ACTIVE_DRAFT_KEY);
  }
  // Legacy / unreadable content has no owner: preserve it, then free the slot.
  return quarantineSlot(storage, slot, now) && removeVerified(storage, ACTIVE_DRAFT_KEY);
};

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const fail = (reason: PersistFailure): WriteResult => ({ ok: false, reason });
const fromVerified = (v: Verified, where: 'active' | 'parked'): WriteResult => (v.ok === true ? { ok: true, where } : fail(v.reason));

/**
 * Saves the workout for `userId`. See the invariants at the top of this file.
 * `ok: true, where: 'parked'` means another account owns the active slot right now, so this user's draft
 * went to their parked slot (it is still safe and still theirs).
 */
export const writeDraft = (
  storage: StorageLike | null,
  userId: string | null,
  state: ActiveWorkoutState,
  now = Date.now(),
): WriteResult => {
  if (!storage) return fail('unavailable');
  if (!userId) return fail('no-identity');
  const payload = JSON.stringify({ v: DRAFT_VERSION, userId, savedAt: now, state } satisfies DraftEnvelope);
  const slot = readSlot(storage);

  switch (slot.kind) {
    case 'unreadable':
      return fail('unavailable');
    case 'empty':
      return fromVerified(setVerified(storage, ACTIVE_DRAFT_KEY, payload), 'active');
    case 'draft': {
      if (slot.envelope.userId === userId) {
        if (slot.envelope.state.templateId !== state.templateId) return fail('conflict');
        return fromVerified(setVerified(storage, ACTIVE_DRAFT_KEY, payload), 'active');
      }
      // Another account owns the slot: never overwrite it. Keep this user's draft in their own parked slot.
      const parked = readParked(storage, userId);
      if (parked.kind === 'error') return fail('unavailable');
      if (parked.kind === 'draft' && parked.envelope.state.templateId !== state.templateId) return fail('conflict');
      return fromVerified(setVerified(storage, parkedKey(userId), payload), 'parked');
    }
    default:
      // Legacy or unreadable content: preserve it first; if that fails, do not write over it.
      if (!quarantineSlot(storage, slot, now)) return fail('blocked');
      return fromVerified(setVerified(storage, ACTIVE_DRAFT_KEY, payload), 'active');
  }
};

/**
 * Removes this user's draft of ONE workout (`templateId`): from the active slot if it is theirs, and their parked copy.
 * It never touches anyone else's draft, nor a different workout of the same user (so discarding a workout that
 * could not be saved cannot delete another workout that was). Returns true when nothing of that draft remains.
 */
export const clearDraft = (storage: StorageLike | null, userId: string | null, templateId: string): boolean => {
  if (!storage) return true; // nothing could ever have been stored
  if (!userId) return false;
  const slot = readSlot(storage);
  if (slot.kind === 'unreadable') return false;
  let ok = true;
  if (slot.kind === 'draft' && slot.envelope.userId === userId && slot.envelope.state.templateId === templateId) {
    ok = removeVerified(storage, ACTIVE_DRAFT_KEY);
  }
  const parked = readParked(storage, userId);
  if (parked.kind === 'error') return false;
  if (parked.kind === 'draft' && parked.envelope.state.templateId === templateId) ok = removeVerified(storage, parkedKey(userId)) && ok;
  return ok;
};

/** Anything worth losing? Used to decide whether closing or leaving needs a warning when storage is failing. */
export const hasWorkoutData = (data: WorkoutData): boolean =>
  data.extraExercises.length > 0 ||
  Object.values(data.exerciseSets).some((s) => hasAnySet(s)) ||
  Object.values(data.exerciseNotes).some((n) => typeof n === 'string' && n.trim() !== '');

// ---------------------------------------------------------------------------
// Resolving what a user can resume
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** Template ids known to belong to this user. A legacy draft for one of these is provably theirs. */
  knownTemplateIds?: ReadonlySet<string>;
  /** Leave an unprovable legacy draft untouched for now (templates are still loading). */
  deferLegacy?: boolean;
  now?: number;
}

export interface DraftResolution {
  /** ok | unavailable (no storage) | unreadable (storage threw) | blocked (could not make room) | no-identity */
  status: 'ok' | 'unavailable' | 'unreadable' | 'blocked' | 'no-identity';
  /** This user's own draft, or null. */
  draft: DraftEnvelope | null;
  /** An unattributed legacy draft is still waiting for the templates to load before a decision. */
  legacyPending: boolean;
  /** Quarantined workouts this user can claim or discard. */
  claimable: QuarantinedWorkout[];
}

const isProvablyOwnedBy = (state: ActiveWorkoutState, known: ReadonlySet<string> | undefined): boolean =>
  !!known && !state.templateId.startsWith('manual-') && known.has(state.templateId);

/**
 * Brings the storage into the shape "the active slot holds at most this user's own draft" and returns it.
 * Idempotent and safe to call from several places. Never deletes a draft.
 */
export const resolveDraft = (storage: StorageLike | null, userId: string | null, options: ResolveOptions = {}): DraftResolution => {
  const now = options.now ?? Date.now();
  if (!userId) return { status: 'no-identity', draft: null, legacyPending: false, claimable: [] };
  if (!storage) return { status: 'unavailable', draft: null, legacyPending: false, claimable: [] };

  let status: DraftResolution['status'] = 'ok';
  let legacyPending = false;
  let own: DraftEnvelope | null = null;

  const slot = readSlot(storage);
  if (slot.kind === 'unreadable') return { status: 'unreadable', draft: null, legacyPending: false, claimable: [] };

  if (slot.kind === 'draft') {
    if (slot.envelope.userId === userId) own = slot.envelope;
    else if (!parkEnvelope(storage, slot.envelope, now) || !removeVerified(storage, ACTIVE_DRAFT_KEY)) status = 'blocked';
  } else if (slot.kind === 'legacy') {
    if (isProvablyOwnedBy(slot.state, options.knownTemplateIds)) {
      const adopted: DraftEnvelope = { v: DRAFT_VERSION, userId, savedAt: now, state: slot.state };
      if (setVerified(storage, ACTIVE_DRAFT_KEY, JSON.stringify(adopted)).ok) own = adopted;
      else status = 'blocked';
    } else if (options.deferLegacy) {
      legacyPending = true;
    } else if (!quarantineSlot(storage, slot, now) || !removeVerified(storage, ACTIVE_DRAFT_KEY)) {
      status = 'blocked';
    }
  } else if (slot.kind === 'corrupt') {
    if (!quarantineSlot(storage, slot, now) || !removeVerified(storage, ACTIVE_DRAFT_KEY)) status = 'blocked';
  }

  // This user's parked draft (they signed out, or another account used the slot meanwhile).
  const parked = readParked(storage, userId);
  if (parked.kind === 'draft') {
    if (!own) {
      if (status === 'ok' && !legacyPending) {
        if (setVerified(storage, ACTIVE_DRAFT_KEY, JSON.stringify(parked.envelope)).ok) {
          removeVerified(storage, parkedKey(userId));
        }
      }
      own = parked.envelope;
    } else if (parked.envelope.savedAt > own.savedAt) {
      // Two copies of the same user's draft: the newer wins, the older is kept in quarantine.
      if (quarantine(storage, { reason: 'superseded', ownerId: userId, state: own.state }, now)
        && setVerified(storage, ACTIVE_DRAFT_KEY, JSON.stringify(parked.envelope)).ok) {
        removeVerified(storage, parkedKey(userId));
        own = parked.envelope;
      }
    } else if (quarantine(storage, { reason: 'superseded', ownerId: userId, state: parked.envelope.state }, now)) {
      removeVerified(storage, parkedKey(userId));
    }
  }

  return { status, draft: own, legacyPending, claimable: listClaimable(storage, userId) };
};

// ---------------------------------------------------------------------------
// Words for the screen
// ---------------------------------------------------------------------------

/** What went wrong and what to do about it. Used for the persistent warning inside the workout. */
export const describePersistFailure = (reason: PersistFailure): { title: string; body: string } => {
  const title = 'Your progress is not being saved on this device';
  switch (reason) {
    case 'quota':
      return { title, body: "This device's storage is full. Free up some space (close other tabs, clear site data you don't need), then tap Try saving again." };
    case 'no-identity':
      return { title, body: "You're not signed in, so the workout can't be stored for your account. Sign in again, then tap Try saving again." };
    case 'conflict':
      return { title, body: 'A different workout is already saved on this device. Finish or discard that one first, then tap Try saving again.' };
    case 'blocked':
      return { title, body: "An older saved workout is in the way and couldn't be moved aside. Tap Try saving again; if it keeps failing, use Complete Workout to log this one now." };
    default:
      return { title, body: 'This browser is blocking storage (for example private browsing). Keep this screen open and use Complete Workout when you finish. Tap Try saving again after changing the setting.' };
  }
};
