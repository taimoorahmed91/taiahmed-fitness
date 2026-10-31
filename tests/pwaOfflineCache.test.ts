import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseTemplates, clearWorkoutOfflineCache, isNetworkFailure, LAST_SESSIONS_CACHE_KEY, MAX_CACHE_AGE_MS,
  pickLastSessions, readCachedLastSession, readLastSessionsCache, readStoredSessionUserId, readTemplatesCache,
  resolveOfflineUserId, TEMPLATES_CACHE_KEY, writeLastSessionsCache, writeTemplatesCache,
  type CachedTemplate, type StorageLike,
} from '../src/lib/workoutOfflineCache';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const NOW = Date.parse('2026-10-30T12:00:00.000Z');
const tpl = (id: string, name: string, exercises: string[] = ['A', 'B']): CachedTemplate => ({ id, name, exercises, created_at: '2026-10-01', updated_at: '2026-10-02' });

describe('templates offline copy', () => {
  test('round-trips in the original order, for the same user only', () => {
    const s = new MemoryStorage();
    const list = [tpl('2', 'Pull'), tpl('1', 'Push', ['Bench', 'Row'])];
    assert.equal(writeTemplatesCache('u1', list, NOW, s), true);
    const hit = readTemplatesCache('u1', NOW + 1000, s);
    assert.deepEqual(hit?.data, list);
    assert.equal(hit?.savedAt, NOW);
    // another user, or nobody, never sees it
    assert.equal(readTemplatesCache('u2', NOW, s), null);
    assert.equal(readTemplatesCache(null, NOW, s), null);
    // and it is still there for the owner
    assert.notEqual(readTemplatesCache('u1', NOW, s), null);
  });

  test('keys are versioned', () => {
    assert.match(TEMPLATES_CACHE_KEY, /^fittrack:v1:/);
    assert.match(LAST_SESSIONS_CACHE_KEY, /^fittrack:v1:/);
  });

  test('a different cache version is ignored and cleaned up', () => {
    const s = new MemoryStorage();
    s.setItem(TEMPLATES_CACHE_KEY, JSON.stringify({ v: 99, userId: 'u1', savedAt: NOW, data: [tpl('1', 'X')] }));
    assert.equal(readTemplatesCache('u1', NOW, s), null);
    assert.equal(s.getItem(TEMPLATES_CACHE_KEY), null);
  });

  test('corrupt or oddly shaped entries read as "no cache" without throwing, and are removed', () => {
    const s = new MemoryStorage();
    for (const raw of ['{not json', 'null', '"str"', '[]', JSON.stringify({ v: 1, userId: 'u1', savedAt: 'x', data: [] })]) {
      s.setItem(TEMPLATES_CACHE_KEY, raw);
      assert.equal(readTemplatesCache('u1', NOW, s), null, raw);
      assert.equal(s.getItem(TEMPLATES_CACHE_KEY), null, raw);
    }
    s.setItem(TEMPLATES_CACHE_KEY, JSON.stringify({ v: 1, userId: 'u1', savedAt: NOW, data: { not: 'a list' } }));
    assert.equal(readTemplatesCache('u1', NOW, s), null);
  });

  test('invalid items are dropped one by one; valid ones survive', () => {
    const s = new MemoryStorage();
    s.setItem(TEMPLATES_CACHE_KEY, JSON.stringify({ v: 1, userId: 'u1', savedAt: NOW, data: [tpl('1', 'Ok'), { id: 5 }, null, { id: '3', name: 'NoEx' }, { ...tpl('4', 'Mixed'), exercises: ['A', 7, 'B'] }] }));
    const hit = readTemplatesCache('u1', NOW, s);
    assert.deepEqual(hit?.data.map((t) => [t.id, t.exercises]), [['1', ['A', 'B']], ['4', ['A', 'B']]]);
  });

  test('too-old copies are ignored but not deleted; future timestamps are rejected', () => {
    const s = new MemoryStorage();
    writeTemplatesCache('u1', [tpl('1', 'Old')], NOW, s);
    assert.equal(readTemplatesCache('u1', NOW + MAX_CACHE_AGE_MS + 1, s), null);
    assert.notEqual(readTemplatesCache('u1', NOW + MAX_CACHE_AGE_MS - 1, s), null);
    assert.equal(readTemplatesCache('u1', NOW - 3 * 24 * 3600 * 1000, s), null);
  });

  test('storage that throws or is missing never breaks reads or writes', () => {
    const broken: StorageLike = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
    assert.equal(writeTemplatesCache('u1', [tpl('1', 'X')], NOW, broken), false);
    assert.equal(readTemplatesCache('u1', NOW, broken), null);
    assert.equal(writeTemplatesCache('u1', [tpl('1', 'X')], NOW, null), false);
    assert.equal(readTemplatesCache('u1', NOW, null), null);
    assert.doesNotThrow(() => clearWorkoutOfflineCache(broken));
  });

  test('no user id means nothing is written', () => {
    const s = new MemoryStorage();
    assert.equal(writeTemplatesCache(null, [tpl('1', 'X')], NOW, s), false);
    assert.equal(s.getItem(TEMPLATES_CACHE_KEY), null);
  });

  test('clear removes both copies and leaves other keys alone', () => {
    const s = new MemoryStorage();
    writeTemplatesCache('u1', [tpl('1', 'X')], NOW, s);
    writeLastSessionsCache('u1', {}, NOW, s);
    s.setItem('fittrack-active-workout', '{"keep":true}');
    clearWorkoutOfflineCache(s);
    assert.equal(s.getItem(TEMPLATES_CACHE_KEY), null);
    assert.equal(s.getItem(LAST_SESSIONS_CACHE_KEY), null);
    assert.equal(s.getItem('fittrack-active-workout'), '{"keep":true}');
  });
});

describe('last session offline copy', () => {
  const sessions = [
    { id: 'a3', exercise: 'Pull', duration: 50, date: '2026-10-28', notes: '1.Row: S1:10@50kg' },
    { id: 'a2', exercise: 'Push', duration: 45, date: '2026-10-27', notes: '1.Bench: S1:8@80kg', start_time: '09:00' },
    { id: 'a1', exercise: 'Pull', duration: 40, date: '2026-10-20', notes: 'older' },
    { id: 'z', exercise: 'Not a template', duration: 10, date: '2026-10-29' },
  ];

  test('keeps only the newest session per template name', () => {
    const last = pickLastSessions(sessions, ['Pull', 'Push', 'Legs']);
    assert.deepEqual(Object.keys(last).sort(), ['Pull', 'Push']);
    assert.equal(last.Pull.id, 'a3');
    assert.equal(last.Push.start_time, '09:00');
  });

  test('round-trips through storage and is looked up by template name', () => {
    const s = new MemoryStorage();
    writeLastSessionsCache('u1', pickLastSessions(sessions, ['Pull', 'Push']), NOW, s);
    assert.equal(readCachedLastSession('u1', 'Pull', NOW, s)?.notes, '1.Row: S1:10@50kg');
    assert.equal(readCachedLastSession('u1', 'Legs', NOW, s), null);
    assert.equal(readCachedLastSession('u2', 'Pull', NOW, s), null);
  });

  test('bad entries are dropped, good ones kept', () => {
    const s = new MemoryStorage();
    s.setItem(LAST_SESSIONS_CACHE_KEY, JSON.stringify({ v: 1, userId: 'u1', savedAt: NOW, data: { Pull: sessions[0], Push: { id: 1 }, Legs: 'x' } }));
    assert.deepEqual(Object.keys(readLastSessionsCache('u1', NOW, s)!.data), ['Pull']);
    s.setItem(LAST_SESSIONS_CACHE_KEY, JSON.stringify({ v: 1, userId: 'u1', savedAt: NOW, data: [1, 2] }));
    assert.equal(readLastSessionsCache('u1', NOW, s), null);
  });

  test('saved set details are carried unchanged (the workout screen parses them later)', () => {
    const s = new MemoryStorage();
    const notes = '1.Bench: W:5@20kg@09:02 S1:10@102.5kg@09:05 [note: felt strong]';
    writeLastSessionsCache('u1', pickLastSessions([{ id: 'n', exercise: 'Push', duration: 1, date: '2026-10-01', notes }], ['Push']), NOW, s);
    assert.equal(readCachedLastSession('u1', 'Push', NOW, s)?.notes, notes);
  });
});

describe('who is offline?', () => {
  const sessionKey = 'sb-nywsjgxlnilmcztnvidc-auth-token';

  test('the stored Supabase session identifies the user when the live session is gone', () => {
    const s = new MemoryStorage();
    s.setItem('unrelated', '{}');
    s.setItem(sessionKey, JSON.stringify({ access_token: 'x', user: { id: 'u1' } }));
    assert.equal(readStoredSessionUserId(s), 'u1');
    assert.equal(resolveOfflineUserId(null, false, s), 'u1');
  });

  test('online with no live user is NOT assumed to be the stored user; a live user always wins', () => {
    const s = new MemoryStorage();
    s.setItem(sessionKey, JSON.stringify({ user: { id: 'u1' } }));
    assert.equal(resolveOfflineUserId(null, true, s), null);
    assert.equal(resolveOfflineUserId('u2', false, s), 'u2');
  });

  test('signed out or corrupt stored session means nobody', () => {
    const s = new MemoryStorage();
    assert.equal(readStoredSessionUserId(s), null);
    s.setItem(sessionKey, '{bad');
    assert.equal(readStoredSessionUserId(s), null);
    s.setItem(sessionKey, JSON.stringify({ user: {} }));
    assert.equal(readStoredSessionUserId(s), null);
    assert.equal(readStoredSessionUserId(null), null);
  });
});

describe('when the offline copy may be used', () => {
  const cache = { data: [tpl('1', 'Cached')], savedAt: NOW };
  const fresh = [tpl('9', 'Server')];

  test('a successful server read always wins', () => {
    const r = chooseTemplates({ fetch: { ok: true, templates: fresh }, online: true, cache });
    assert.deepEqual(r, { source: 'server', templates: fresh });
    assert.equal(chooseTemplates({ fetch: { ok: true, templates: [] }, online: false, cache }).source, 'server'); // empty list is a real answer
  });

  test('offline failure falls back to the copy', () => {
    const r = chooseTemplates({ fetch: { ok: false, error: new TypeError('Failed to fetch') }, online: false, cache });
    assert.deepEqual(r, { source: 'cache', templates: cache.data, savedAt: NOW });
  });

  test('online but unreachable (network error) also falls back', () => {
    assert.equal(chooseTemplates({ fetch: { ok: false, error: new TypeError('Failed to fetch') }, online: true, cache }).source, 'cache');
    assert.equal(chooseTemplates({ fetch: { ok: false, error: { message: 'TypeError: NetworkError when attempting to fetch resource.' } }, online: true, cache }).source, 'cache');
  });

  test('a real server refusal is never replaced by old data', () => {
    assert.equal(chooseTemplates({ fetch: { ok: false, error: { code: '42501', message: 'permission denied' } }, online: true, cache }).source, 'none');
    assert.equal(chooseTemplates({ fetch: { ok: false, error: { status: 500, message: 'Failed to fetch' } }, online: true, cache }).source, 'none');
    assert.equal(chooseTemplates({ fetch: { ok: false, error: { status: 401 } }, online: true, cache }).source, 'none');
  });

  test('no copy means no fallback', () => {
    assert.equal(chooseTemplates({ fetch: { ok: false, error: new TypeError('Failed to fetch') }, online: false, cache: null }).source, 'none');
  });

  test('network failure detection', () => {
    assert.equal(isNetworkFailure(new Error('anything'), false), true);
    assert.equal(isNetworkFailure(new Error('boom'), true), false);
    assert.equal(isNetworkFailure(null, true), false);
    assert.equal(isNetworkFailure(new TypeError('Load failed'), true), true);
  });
});

describe('no arbitrary writes are queued', () => {
  test('the offline cache module only reads and writes its own two keys', () => {
    const s = new MemoryStorage();
    writeTemplatesCache('u1', [tpl('1', 'X')], NOW, s);
    writeLastSessionsCache('u1', {}, NOW, s);
    const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).sort();
    assert.deepEqual(keys, [LAST_SESSIONS_CACHE_KEY, TEMPLATES_CACHE_KEY].sort());
  });
});
