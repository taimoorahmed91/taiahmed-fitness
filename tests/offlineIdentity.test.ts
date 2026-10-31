import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAST_APPROVED_KEY, MAX_OFFLINE_APPROVAL_AGE_MS, decideAccess, forgetApproved, isNoProfileRow, readLastApproved,
  rememberApproved, type PreviousAccess, type ProfileProbe,
} from '../src/lib/offlineIdentity';
import { confirmedSuccess, SAVE_FAILED_MESSAGE } from '../src/lib/confirmedMutation';
import type { StorageLike } from '../src/lib/workoutOfflineCache';
import { readFileSync } from 'node:fs';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const NOW = Date.parse('2026-10-30T12:00:00.000Z');
const remembered = (userId = 'u1', ageMs = 1000) => ({ v: 2 as const, userId, approvedAt: NOW - ageMs });
const networkFailure: ProfileProbe = { ok: false, error: { message: 'TypeError: Failed to fetch', code: '' } };
const serverError: ProfileProbe = { ok: false, error: { message: 'boom', code: '500', status: 500 } };
const base = { userId: 'u1', online: true, remembered: null as ReturnType<typeof remembered> | null, previous: null as PreviousAccess | null, now: NOW };

describe('approval policy: the server decides; a failed check never approves by itself', () => {
  test('a server answer is used as given, and remembered or forgotten accordingly', () => {
    const yes = decideAccess({ ...base, probe: { ok: true, approved: true, owner: true } });
    assert.deepEqual([yes.approved, yes.owner, yes.source, yes.memory, yes.offlineRecoveryOnly], [true, true, 'server', 'remember', false]);
    const no = decideAccess({ ...base, remembered: remembered(), probe: { ok: true, approved: false, owner: false } });
    assert.deepEqual([no.approved, no.source, no.memory], [false, 'denied', 'forget']);
  });

  test('online, a failed profile check is NOT approval, even for a remembered user', () => {
    const d = decideAccess({ ...base, remembered: remembered(), probe: serverError });
    assert.equal(d.approved, false);
    assert.equal(d.source, 'denied');
    assert.equal(d.profileError, true, 'flagged so it is retried');
  });

  test('cannot reach the server + live session of the SAME remembered user = recovery-only approval, never owner', () => {
    const d = decideAccess({ ...base, online: false, remembered: remembered(), probe: networkFailure });
    assert.equal(d.approved, true);
    assert.equal(d.owner, false);
    assert.equal(d.source, 'last-known-offline');
    assert.equal(d.offlineRecoveryOnly, true);
    assert.equal(d.memory, 'keep');
    // A network error object also counts while navigator says online (flaky signal).
    assert.equal(decideAccess({ ...base, online: true, remembered: remembered(), probe: networkFailure }).offlineRecoveryOnly, true);
  });

  test('a different user, nothing remembered, or a memory that is too old is denied', () => {
    assert.equal(decideAccess({ ...base, online: false, remembered: remembered('someone-else'), probe: networkFailure }).approved, false);
    assert.equal(decideAccess({ ...base, online: false, remembered: null, probe: networkFailure }).approved, false);
    assert.equal(decideAccess({ ...base, online: false, remembered: remembered('u1', MAX_OFFLINE_APPROVAL_AGE_MS + 1), probe: networkFailure }).approved, false);
    assert.equal(decideAccess({ ...base, online: false, remembered: { v: 2, userId: 'u1', approvedAt: NOW + 3 * 86400000 }, probe: networkFailure }).approved, false, 'a clock-skewed future date is not trusted');
  });

  test('a server REFUSAL while offline-looking is still a refusal when the server answered', () => {
    const d = decideAccess({ ...base, online: true, remembered: remembered(), probe: { ok: true, approved: false, owner: false } });
    assert.equal(d.approved, false);
    assert.equal(d.memory, 'forget');
  });

  test('already confirmed by the server this session: one failed re-check keeps the answer (flagged), never grants more', () => {
    const previous: PreviousAccess = { userId: 'u1', approved: true, owner: false, source: 'server' };
    const d = decideAccess({ ...base, previous, probe: serverError });
    assert.deepEqual([d.approved, d.owner, d.source, d.profileError], [true, false, 'retained', true]);
    // A different user never inherits it.
    assert.equal(decideAccess({ ...base, userId: 'u2', previous, probe: serverError }).approved, false);
    // A memory-based approval is not "confirmed by the server" and is not retained over a server error.
    const mem: PreviousAccess = { userId: 'u1', approved: true, owner: false, source: 'last-known-offline' };
    assert.equal(decideAccess({ ...base, previous: mem, probe: serverError }).approved, false);
    // A server "no" earlier is not retained as yes.
    const denied: PreviousAccess = { userId: 'u1', approved: false, owner: false, source: 'denied' };
    assert.equal(decideAccess({ ...base, previous: denied, remembered: null, probe: serverError }).approved, false);
  });

  test('the "no profile row" answer is a definite not-approved, other errors are failed checks', () => {
    assert.equal(isNoProfileRow({ code: 'PGRST116' }), true);
    assert.equal(isNoProfileRow({ code: '42501' }), false);
    assert.equal(isNoProfileRow(null), false);
  });
});

describe('remembered identity storage', () => {
  test('round trip, corrupt data reads as nothing, forgetting removes it', () => {
    const s = new MemoryStorage();
    assert.equal(readLastApproved(s), null);
    assert.equal(rememberApproved('u1', NOW, s), true);
    assert.deepEqual(readLastApproved(s), { v: 2, userId: 'u1', approvedAt: NOW });
    rememberApproved('u2', NOW + 1, s);
    assert.equal(readLastApproved(s)?.userId, 'u2', 'only the most recent approved identity is remembered');
    s.setItem(LAST_APPROVED_KEY, '{nope');
    assert.equal(readLastApproved(s), null);
    s.setItem(LAST_APPROVED_KEY, JSON.stringify({ v: 1, userId: 'u1', approvedAt: 1 }));
    assert.equal(readLastApproved(s), null, 'unknown versions are ignored');
    rememberApproved('u1', NOW, s);
    forgetApproved(s);
    assert.equal(readLastApproved(s), null);
  });

  test('blocked storage never throws and never approves', () => {
    const blocked: StorageLike = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };
    assert.equal(readLastApproved(blocked), null);
    assert.equal(rememberApproved('u1', NOW, blocked), false);
    assert.doesNotThrow(() => forgetApproved(blocked));
  });
});

describe('the app wires the policy without faking a session', () => {
  const ctx = readFileSync(new URL('../src/contexts/UserContext.tsx', import.meta.url), 'utf8');
  test('isLoggedIn still means a real Supabase session (no offline stand-in session)', () => {
    assert.match(ctx, /isLoggedIn: !!session/);
    assert.doesNotMatch(ctx, /setSession\(\{/);
  });
  test('approval goes through decideAccess; sign-out forgets it and puts the workout draft away', () => {
    assert.match(ctx, /decideAccess\(/);
    assert.match(ctx, /forgetApproved\(\)/);
    assert.match(ctx, /parkActiveDraft\(defaultStorage\(\), leavingUserId\)/);
  });
  test('a failed profile check is no longer silently written as "not approved or approved" without a policy', () => {
    assert.doesNotMatch(ctx, /setIsApproved\(profile\?\.approved === 'yes'\)/);
  });
});

describe('confirmedSuccess: one definition of "it really worked"', () => {
  test('delete-style (default): false and rejection fail; true and void succeed', async () => {
    assert.equal(await confirmedSuccess(() => false), false);
    assert.equal(await confirmedSuccess(async () => false), false);
    assert.equal(await confirmedSuccess(async () => { throw new Error('nope'); }), false);
    assert.equal(await confirmedSuccess(() => { throw new Error('sync nope'); }), false);
    assert.equal(await confirmedSuccess(() => true), true);
    assert.equal(await confirmedSuccess(async () => undefined), true, 'older void callbacks keep working');
  });

  test('edit-style (requireTrue): only an explicit true succeeds', async () => {
    const strict = { requireTrue: true };
    assert.equal(await confirmedSuccess(async () => true, strict), true);
    assert.equal(await confirmedSuccess(async () => false, strict), false);
    assert.equal(await confirmedSuccess(async () => undefined, strict), false);
    assert.equal(await confirmedSuccess(async () => { throw new Error('x'); }, strict), false);
  });

  test('the failure message tells people their edits are still there', () => {
    assert.match(SAVE_FAILED_MESSAGE, /still here/);
    assert.match(SAVE_FAILED_MESSAGE, /try again/i);
  });
});
