// Who may use the app when the profile (approval) check cannot be answered by the server?
// Pure and storage-injected, so the exact policy is unit tested.
//
// POLICY ("last-known-approved identity", for local workout recovery only)
//   The server is the only authority on approval. It answers, and that answer is used.
//   A profile check that FAILS is never read as "approved" by itself. The only exceptions, in order:
//     1. Same person, same session, already confirmed by the server earlier in this session:
//        keep that answer (flagged as retained) rather than bouncing them out of a workout on one hiccup.
//     2. The device cannot reach the server (a network failure, not a server answer), the session is
//        a live, valid Supabase session for the SAME user id, and this device remembers that this exact
//        user was approved by the server (within MAX_OFFLINE_APPROVAL_AGE_MS): approve for
//        "offline recovery" only. Owner/admin rights are NEVER granted from memory.
//   Everything else (a server error while online, a different user, nothing remembered, too old) is denied.
//
// WHAT THIS DOES NOT DO (by design)
//   - It does not create or fake a session. An expired or invalid Supabase session stays signed out:
//     there is no offline "cold login". A person whose session expired while offline reconnects once and
//     their saved workout is waiting (see workoutDraft.ts).
//   - It does not allow any server write. Writes still need the live session and still pass server-side
//     authorization (RLS). Offline, they simply fail and the workout stays on the device.
//   - The remembered identity is removed on explicit sign-out and whenever the server says "not approved".
import { defaultStorage, isNetworkFailure, type StorageLike } from './workoutOfflineCache';

export const LAST_APPROVED_KEY = 'fittrack:v2:last-approved-identity';
export const MAX_OFFLINE_APPROVAL_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ApprovedIdentity {
  v: 2;
  userId: string;
  approvedAt: number;
}

export const readLastApproved = (storage: StorageLike | null = defaultStorage()): ApprovedIdentity | null => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_APPROVED_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ApprovedIdentity> | null;
    if (p && p.v === 2 && typeof p.userId === 'string' && p.userId && typeof p.approvedAt === 'number') return p as ApprovedIdentity;
  } catch {
    /* corrupt: treated as nothing remembered */
  }
  return null;
};

export const rememberApproved = (userId: string, now = Date.now(), storage: StorageLike | null = defaultStorage()): boolean => {
  if (!storage || !userId) return false;
  try {
    storage.setItem(LAST_APPROVED_KEY, JSON.stringify({ v: 2, userId, approvedAt: now } satisfies ApprovedIdentity));
    return true;
  } catch {
    return false;
  }
};

export const forgetApproved = (storage: StorageLike | null = defaultStorage()): void => {
  try {
    storage?.removeItem(LAST_APPROVED_KEY);
  } catch {
    /* ignore */
  }
};

export type ProfileProbe =
  | { ok: true; approved: boolean; owner: boolean }
  | { ok: false; error: unknown };

export type AccessSource =
  /** The server answered. */
  | 'server'
  /** The server had confirmed this user earlier in this session; a later check failed, so that answer is kept. */
  | 'retained'
  /** Could not reach the server; allowed from this device's memory of a past server approval. Recovery only. */
  | 'last-known-offline'
  /** Not approved (server said no, or nothing allows access). */
  | 'denied';

export interface AccessDecision {
  approved: boolean;
  owner: boolean;
  source: AccessSource;
  /** The profile check itself failed (so a retry is worthwhile). */
  profileError: boolean;
  /** Approved from memory only: UI must treat this as local workout recovery, nothing more. */
  offlineRecoveryOnly: boolean;
  /** What to do with the remembered identity. */
  memory: 'remember' | 'forget' | 'keep';
}

export interface PreviousAccess {
  userId: string;
  approved: boolean;
  owner: boolean;
  source: AccessSource;
}

export const decideAccess = (input: {
  userId: string;
  probe: ProfileProbe;
  online: boolean;
  remembered: ApprovedIdentity | null;
  previous: PreviousAccess | null;
  now?: number;
}): AccessDecision => {
  const { userId, probe, online, remembered, previous } = input;
  const now = input.now ?? Date.now();

  if (probe.ok === true) {
    return probe.approved
      ? { approved: true, owner: probe.owner, source: 'server', profileError: false, offlineRecoveryOnly: false, memory: 'remember' }
      : { approved: false, owner: false, source: 'denied', profileError: false, offlineRecoveryOnly: false, memory: 'forget' };
  }

  // The check failed. Never approve because of the failure alone.
  if (previous && previous.userId === userId && (previous.source === 'server' || previous.source === 'retained')) {
    return { approved: previous.approved, owner: previous.owner, source: 'retained', profileError: true, offlineRecoveryOnly: false, memory: 'keep' };
  }

  if (
    isNetworkFailure(probe.error, online) &&
    remembered &&
    remembered.userId === userId &&
    now - remembered.approvedAt <= MAX_OFFLINE_APPROVAL_AGE_MS &&
    remembered.approvedAt <= now + 24 * 60 * 60 * 1000
  ) {
    return { approved: true, owner: false, source: 'last-known-offline', profileError: true, offlineRecoveryOnly: true, memory: 'keep' };
  }

  return { approved: false, owner: false, source: 'denied', profileError: true, offlineRecoveryOnly: false, memory: 'keep' };
};

/** PostgREST "no rows" for `.single()`: the server answered, and there is no profile row. That is a definite "not approved". */
export const isNoProfileRow = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'PGRST116';
