import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_DRAFT_KEY, PARKED_DRAFT_PREFIX, QUARANTINE_KEY, claimQuarantined, clearDraft, describePersistFailure,
  discardQuarantined, draftExercises, hasWorkoutData, listClaimable, parkActiveDraft, readSlot, resolveDraft, writeDraft,
  type StorageLike,
} from '../src/lib/workoutDraft';
import {
  addExtraExercise, applySetUpdate, buildActiveWorkoutState, collectWorkoutEntries, initialWorkoutData,
  restoreWorkoutData, type ActiveWorkoutState, type WorkoutData,
} from '../src/lib/workoutSession';
import { restoreRestTimer, serializeRestTimer, startRest } from '../src/lib/workoutTiming';
import { hasActiveWorkout } from '../src/pwa/swPolicy';

// Identity-bound workout recovery: ownership, legacy migration, quarantine, failure reporting.

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  failSet: ((key: string) => Error | null) | null = null;
  failGet: ((key: string) => boolean) | null = null;
  forgetWrites = false;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) {
    if (this.failGet?.(k)) throw new Error('SecurityError: storage blocked');
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    const err = this.failSet?.(k);
    if (err) throw err;
    if (!this.forgetWrites) this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
}

const quota = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
const A = 'user-a';
const B = 'user-b';
const NOW = Date.parse('2026-10-30T12:00:00.000Z');

const stateFor = (templateId = 'tpl-push', exercises = ['Bench', 'Row', 'Fly'], name = 'Push day'): ActiveWorkoutState => {
  let data: WorkoutData = initialWorkoutData(exercises.length);
  // Row (index 1) was started first, then Bench; weights, timestamps and sequence are all index-keyed.
  data = applySetUpdate(data, { index: 1, key: 'set1', value: '8', time: '10:01' }).data;
  data = applySetUpdate(data, { index: 1, key: 'set1Weight', value: '60', time: '10:01' }).data;
  data = applySetUpdate(data, { index: 0, key: 'set1', value: '5', time: '10:09' }).data;
  const rest = startRest('set', 60, NOW);
  return buildActiveWorkoutState({
    templateId, templateName: name, exercises, startTime: new Date('2026-10-30T10:00:00.000Z'), data,
    previousSequences: { Row: 1 }, expandedExercise: 1, restTimer: serializeRestTimer(rest),
  });
};
const legacyRaw = (state: ActiveWorkoutState) => JSON.stringify(state);

describe('ownership: only the owner can resume a workout', () => {
  test('a saved workout is bound to the account that wrote it', () => {
    const s = new MemoryStorage();
    const r = writeDraft(s, A, stateFor(), NOW);
    assert.deepEqual(r, { ok: true, where: 'active' });
    const slot = readSlot(s);
    assert.equal(slot.kind, 'draft');
    assert.equal(slot.kind === 'draft' && slot.envelope.userId, A);
    assert.equal(resolveDraft(s, A, { now: NOW }).draft?.state.templateId, 'tpl-push');
  });

  test('another account signing in does not see it, resume it, or destroy it; the owner gets it back intact', () => {
    const s = new MemoryStorage();
    const original = stateFor();
    writeDraft(s, A, original, NOW);

    const asB = resolveDraft(s, B, { now: NOW + 1 });
    assert.equal(asB.draft, null);
    assert.equal(asB.status, 'ok');
    assert.deepEqual(asB.claimable, []);
    // A's draft was set aside, not deleted, and the shared slot is free for B.
    assert.equal(s.getItem(ACTIVE_DRAFT_KEY), null);
    assert.ok(s.getItem(`${PARKED_DRAFT_PREFIX}${A}`));

    // B starts their own workout; nothing of A's is touched.
    assert.deepEqual(writeDraft(s, B, stateFor('tpl-b', ['Squat'], 'Leg day'), NOW + 2), { ok: true, where: 'active' });
    assert.equal(resolveDraft(s, B, { now: NOW + 3 }).draft?.state.templateId, 'tpl-b');

    // A comes back: B's workout is parked for B, A's is restored exactly.
    const backA = resolveDraft(s, A, { now: NOW + 4 });
    assert.deepEqual(backA.draft?.state, original);
    assert.equal(resolveDraft(s, B, { now: NOW + 5 }).draft?.state.templateId, 'tpl-b');
    assert.deepEqual(resolveDraft(s, A, { now: NOW + 6 }).draft?.state, original);
  });

  test('a write by an account while another account owns the slot goes to its own parked slot, never over theirs', () => {
    const s = new MemoryStorage();
    const bState = stateFor('tpl-b', ['Squat'], 'Leg day');
    writeDraft(s, B, bState, NOW);
    // Stale tab of A (still open) writes its draft after B signed in elsewhere.
    const r = writeDraft(s, A, stateFor(), NOW + 1);
    assert.deepEqual(r, { ok: true, where: 'parked' });
    const slot = readSlot(s);
    assert.equal(slot.kind === 'draft' && slot.envelope.userId, B);
    assert.deepEqual(slot.kind === 'draft' && slot.envelope.state, bState);
    assert.equal(resolveDraft(s, A, { now: NOW + 2 }).draft?.state.templateId, 'tpl-push');
  });

  test('a tampered envelope (userId swapped in the parked slot) is never served to the wrong user', () => {
    const s = new MemoryStorage();
    writeDraft(s, A, stateFor(), NOW);
    resolveDraft(s, B, { now: NOW + 1 }); // parks A's
    s.setItem(`${PARKED_DRAFT_PREFIX}${B}`, s.getItem(`${PARKED_DRAFT_PREFIX}${A}`) as string); // A's envelope under B's key
    const asB = resolveDraft(s, B, { now: NOW + 2 });
    assert.equal(asB.draft, null);
    // Kept, not deleted (quarantined as unreadable), and not offered to B for restore as their own.
    assert.ok(s.getItem(QUARANTINE_KEY));
    assert.deepEqual(asB.claimable, []);
  });

  test('sign-out puts the current account\'s draft away (not deleted) and leaves it for them only', () => {
    const s = new MemoryStorage();
    const original = stateFor();
    writeDraft(s, A, original, NOW);
    assert.equal(parkActiveDraft(s, A, NOW + 1), true);
    assert.equal(s.getItem(ACTIVE_DRAFT_KEY), null);
    assert.equal(resolveDraft(s, B, { now: NOW + 2 }).draft, null);
    assert.deepEqual(resolveDraft(s, A, { now: NOW + 3 }).draft?.state, original);
  });

  test('sign-out of A does not touch a draft that belongs to B', () => {
    const s = new MemoryStorage();
    writeDraft(s, B, stateFor('tpl-b', ['Squat']), NOW);
    assert.equal(parkActiveDraft(s, A, NOW + 1), true);
    assert.equal(readSlot(s).kind, 'draft');
  });
});

describe('legacy drafts (written before accounts were bound)', () => {
  const legacy = () => legacyRaw(stateFor('11111111-aaaa', ['Bench', 'Row']));

  test('provably the signed-in user\'s (their own template id) is adopted with every field intact', () => {
    const s = new MemoryStorage();
    s.setItem(ACTIVE_DRAFT_KEY, legacy());
    const r = resolveDraft(s, A, { knownTemplateIds: new Set(['11111111-aaaa']), now: NOW });
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.draft?.state, JSON.parse(legacy()));
    assert.equal(r.draft?.userId, A);
    assert.equal(resolveDraft(s, B, { knownTemplateIds: new Set(['x']), now: NOW + 1 }).draft, null);
  });

  test('not provable (another user\'s templates, or a manual workout) is quarantined, never resumed', () => {
    for (const raw of [legacy(), legacyRaw(stateFor('manual-1700000000000', [], 'Manual'))]) {
      const s = new MemoryStorage();
      s.setItem(ACTIVE_DRAFT_KEY, raw);
      const r = resolveDraft(s, B, { knownTemplateIds: new Set(['22222222-bbbb']), now: NOW });
      assert.equal(r.draft, null, 'must not resume');
      assert.equal(s.getItem(ACTIVE_DRAFT_KEY), null, 'slot freed so nobody writes over it');
      assert.equal(r.claimable.length, 1, 'kept and offered for an explicit decision');
      assert.deepEqual(r.claimable[0].state, JSON.parse(raw));
    }
  });

  test('while templates are loading the decision is deferred and nothing is touched', () => {
    const s = new MemoryStorage();
    s.setItem(ACTIVE_DRAFT_KEY, legacy());
    const early = resolveDraft(s, A, { knownTemplateIds: new Set(), deferLegacy: true, now: NOW });
    assert.equal(early.legacyPending, true);
    assert.equal(early.draft, null);
    assert.equal(s.getItem(ACTIVE_DRAFT_KEY), legacy());
    // Templates arrive and prove ownership.
    const later = resolveDraft(s, A, { knownTemplateIds: new Set(['11111111-aaaa']), deferLegacy: false, now: NOW + 1 });
    assert.equal(later.draft?.state.templateId, '11111111-aaaa');
  });

  test('explicit claim restores it to the claimer; a workout in progress is never overwritten; discard removes only that entry', () => {
    const s = new MemoryStorage();
    s.setItem(ACTIVE_DRAFT_KEY, legacyRaw(stateFor('manual-1', [], 'Manual')));
    const q = resolveDraft(s, A, { now: NOW }).claimable[0];

    // Someone else cannot claim it as an "owned" superseded copy, but unattributed legacy is offered to whoever asks.
    assert.deepEqual(claimQuarantined(s, A, 'nope', NOW), { ok: false, reason: 'not-found' });

    writeDraft(s, A, stateFor('tpl-new', ['X'], 'New'), NOW + 1);
    assert.deepEqual(claimQuarantined(s, A, q.id, NOW + 2), { ok: false, reason: 'busy' });
    assert.equal(listClaimable(s, A).length, 1, 'still kept');

    clearDraft(s, A, 'tpl-new');
    assert.deepEqual(claimQuarantined(s, A, q.id, NOW + 3), { ok: true });
    assert.equal(resolveDraft(s, A, { now: NOW + 4 }).draft?.state.templateId, 'manual-1');
    assert.equal(listClaimable(s, A).length, 0);

    // A signs out (draft parked), then an old tab leaves another legacy draft in the slot.
    assert.equal(parkActiveDraft(s, A, NOW + 4), true);
    s.setItem(ACTIVE_DRAFT_KEY, legacyRaw(stateFor('manual-2', [], 'Other')));
    const q2 = resolveDraft(s, B, { now: NOW + 5 }).claimable[0];
    assert.equal(discardQuarantined(s, q2.id), true);
    assert.equal(listClaimable(s, B).length, 0);
    assert.equal(resolveDraft(s, A, { now: NOW + 6 }).draft?.state.templateId, 'manual-1', 'A\'s own draft untouched by the discard');
  });

  test('unreadable slot content is preserved (raw) and cleared from the slot, never parsed as a workout', () => {
    const s = new MemoryStorage();
    s.setItem(ACTIVE_DRAFT_KEY, '{oops');
    const r = resolveDraft(s, A, { now: NOW });
    assert.equal(r.draft, null);
    assert.equal(s.getItem(ACTIVE_DRAFT_KEY), null);
    assert.match(s.getItem(QUARANTINE_KEY) as string, /\{oops/);
    assert.deepEqual(r.claimable, [], 'raw text is kept for support, not offered as a workout');
  });

  test('the PWA update guard still sees a workout in progress (same key, any non-empty value)', () => {
    const s = new MemoryStorage();
    writeDraft(s, A, stateFor(), NOW);
    assert.equal(hasActiveWorkout(s), true);
    clearDraft(s, A, 'tpl-push');
    assert.equal(hasActiveWorkout(s), false);
  });
});

describe('writes never destroy what they do not own', () => {
  test('legacy content is quarantined before the slot is overwritten; if that fails nothing is written', () => {
    const s = new MemoryStorage();
    const raw = legacyRaw(stateFor('manual-9', [], 'Manual'));
    s.setItem(ACTIVE_DRAFT_KEY, raw);
    s.failSet = (k) => (k === QUARANTINE_KEY ? quota() : null);
    assert.deepEqual(writeDraft(s, A, stateFor(), NOW), { ok: false, reason: 'blocked' });
    assert.equal(s.getItem(ACTIVE_DRAFT_KEY), raw, 'legacy draft still there');
    s.failSet = null;
    assert.equal(writeDraft(s, A, stateFor(), NOW).ok, true);
    assert.equal(listClaimable(s, A).length, 1, 'legacy draft kept in quarantine');
  });

  test('a different workout of the same account is a conflict, not a silent replacement', () => {
    const s = new MemoryStorage();
    const paused = stateFor('tpl-push');
    writeDraft(s, A, paused, NOW);
    assert.deepEqual(writeDraft(s, A, stateFor('tpl-pull', ['Pull'], 'Pull'), NOW + 1), { ok: false, reason: 'conflict' });
    assert.deepEqual(resolveDraft(s, A, { now: NOW + 2 }).draft?.state, paused);
  });

  test('clearing one workout never removes another workout or another account\'s draft', () => {
    const s = new MemoryStorage();
    writeDraft(s, A, stateFor('tpl-push'), NOW);
    assert.equal(clearDraft(s, A, 'tpl-OTHER'), true);
    assert.equal(readSlot(s).kind, 'draft', 'a different workout id is left alone');
    assert.equal(clearDraft(s, B, 'tpl-push'), true);
    assert.equal(readSlot(s).kind, 'draft', 'another account cannot clear it');
    assert.equal(clearDraft(s, A, 'tpl-push'), true);
    assert.equal(readSlot(s).kind, 'empty');
  });

  test('two copies of one account\'s draft: the newer wins, the older is kept (not lost)', () => {
    const s = new MemoryStorage();
    const older = stateFor('tpl-push');
    const newer = { ...stateFor('tpl-push'), expandedExercise: 2 };
    writeDraft(s, A, older, NOW);
    resolveDraft(s, B, { now: NOW + 1 }); // A's parked
    writeDraft(s, B, stateFor('tpl-b', ['S']), NOW + 2);
    writeDraft(s, A, newer, NOW + 3); // stale A tab: lands in A's parked slot (newer)
    // Put an older A draft back into the active slot too (e.g. restored by another tab).
    s.setItem(ACTIVE_DRAFT_KEY, JSON.stringify({ v: 2, userId: A, savedAt: NOW - 1000, state: older }));
    const r = resolveDraft(s, A, { now: NOW + 4 });
    assert.equal(r.draft?.state.expandedExercise, 2, 'newer wins');
    assert.equal(r.claimable.length, 1, 'older copy kept');
    assert.equal(r.claimable[0].state?.expandedExercise, older.expandedExercise);
  });
});

describe('failure reporting (never a false "saved")', () => {
  test('quota exceeded, blocked storage, a write that silently did not stick, and no identity are all reported', () => {
    const s = new MemoryStorage();
    s.failSet = () => quota();
    assert.deepEqual(writeDraft(s, A, stateFor(), NOW), { ok: false, reason: 'quota' });

    const blocked = new MemoryStorage();
    blocked.failSet = () => new Error('SecurityError');
    assert.deepEqual(writeDraft(blocked, A, stateFor(), NOW), { ok: false, reason: 'unavailable' });

    const amnesiac = new MemoryStorage();
    amnesiac.forgetWrites = true; // setItem "succeeds" but nothing is stored
    assert.deepEqual(writeDraft(amnesiac, A, stateFor(), NOW), { ok: false, reason: 'unavailable' });

    assert.deepEqual(writeDraft(null, A, stateFor(), NOW), { ok: false, reason: 'unavailable' });
    assert.deepEqual(writeDraft(new MemoryStorage(), null, stateFor(), NOW), { ok: false, reason: 'no-identity' });
  });

  test('a storage that throws on read is reported as unreadable and is never overwritten', () => {
    const s = new MemoryStorage();
    writeDraft(s, A, stateFor(), NOW);
    s.failGet = () => true;
    const r = resolveDraft(s, A, { now: NOW + 1 });
    assert.equal(r.status, 'unreadable');
    assert.equal(r.draft, null);
    assert.deepEqual(writeDraft(s, A, stateFor(), NOW + 2), { ok: false, reason: 'unavailable' });
    s.failGet = null;
    assert.equal(resolveDraft(s, A, { now: NOW + 3 }).draft?.state.templateId, 'tpl-push', 'nothing was lost');
  });

  test('a failed write keeps the previous saved copy and recovers on retry', () => {
    const s = new MemoryStorage();
    const first = stateFor();
    writeDraft(s, A, first, NOW);
    s.failSet = () => quota();
    assert.equal(writeDraft(s, A, { ...first, expandedExercise: 2 }, NOW + 1).ok, false);
    assert.deepEqual(resolveDraft(s, A, { now: NOW + 2 }).draft?.state, first);
    s.failSet = null;
    assert.equal(writeDraft(s, A, { ...first, expandedExercise: 2 }, NOW + 3).ok, true);
  });

  test('every failure has actionable copy that says what to do and never claims it is saving', () => {
    for (const reason of ['unavailable', 'quota', 'no-identity', 'blocked', 'conflict'] as const) {
      const text = describePersistFailure(reason);
      assert.match(text.title, /not being saved/i);
      assert.match(text.body, /Try saving again|Complete Workout/);
      assert.doesNotMatch(`${text.title} ${text.body}`, /is saving|is being saved|saving on this device/i);
    }
  });
});

describe('resume uses the saved exercise snapshot and original indexes', () => {
  test('a template reordered/edited while paused cannot re-map the saved sets', () => {
    const s = new MemoryStorage();
    const startedWith = ['Bench', 'Row', 'Fly'];
    let data = initialWorkoutData(startedWith.length);
    const t0 = applySetUpdate(data, { index: 1, key: 'set1', value: '8', time: '10:01' });
    data = applySetUpdate(t0.data, { index: 1, key: 'set1Weight', value: '60', time: '10:01' }).data;
    data = applySetUpdate(data, { index: 0, key: 'warmup', value: '12', time: '10:09' }).data;
    data = addExtraExercise(data, startedWith.length, 'Curl').data;
    data = applySetUpdate(data, { index: 3, key: 'set1', value: '10', time: '10:20' }).data;
    data = { ...data, exerciseNotes: { 1: 'felt heavy' }, exerciseSetCount: { ...data.exerciseSetCount, 1: 4 } };
    const rest = startRest('exercise', 90, NOW);
    const saved = buildActiveWorkoutState({
      templateId: 'tpl-push', templateName: 'Push day', exercises: startedWith,
      startTime: new Date('2026-10-30T10:00:00.000Z'), data, previousSequences: { Row: 1, Bench: 2 },
      expandedExercise: 1, restTimer: serializeRestTimer(rest),
    });
    writeDraft(s, A, saved, NOW);

    // Meanwhile the template was reordered and edited: Row first, Bench renamed, Fly removed, Dips added.
    const editedTemplate = ['Row', 'Bench Press', 'Dips'];
    const resumed = resolveDraft(s, A, { now: NOW + 1 }).draft!.state;
    const snapshot = draftExercises(resumed)!;
    assert.deepEqual(snapshot, startedWith, 'the saved snapshot, not the edited template');
    assert.notDeepEqual(snapshot, editedTemplate);

    const restored = restoreWorkoutData(resumed, snapshot.length);
    const all = [...snapshot, ...restored.extraExercises];
    const entries = collectWorkoutEntries(all, restored.exerciseSets, restored.exerciseSequence, restored.exerciseTimestamps, restored.exerciseNotes, restored.exerciseSetCount);
    const byName = Object.fromEntries(entries.map((e) => [e.exercise, e]));
    assert.equal(byName.Row.index, 1);
    assert.equal(byName.Row.sets?.set1, '8');
    assert.equal(byName.Row.sets?.set1Weight, '60');
    assert.equal(byName.Row.ts?.set1Time, '10:01');
    assert.equal(byName.Row.seq, 1);
    assert.equal(byName.Row.note, 'felt heavy');
    assert.equal(byName.Row.setCount, 4);
    assert.equal(byName.Bench.sets?.warmup, '12');
    assert.equal(byName.Bench.seq, 2);
    assert.equal(byName.Curl.index, 3);
    assert.equal(byName.Curl.sets?.set1, '10');
    assert.equal(byName.Fly, undefined);
    // Had the edited template been used, "Bench Press" would sit at index 1 and inherit Row's 8 x 60.
    assert.equal(editedTemplate[1], 'Bench Press');
    assert.equal(resumed.nextSequence, saved.nextSequence);
    // Rest timer survives the round trip.
    assert.deepEqual(resumed.restTimer, saved.restTimer);
    assert.ok(restoreRestTimer(resumed.restTimer, NOW + 1000));
  });

  test('a stored workout without an exercise list falls back to null so the caller can decide', () => {
    const s = stateFor();
    assert.equal(draftExercises({ ...s, exercises: undefined as unknown as string[] }), null);
    assert.equal(draftExercises({ ...s, exercises: [1, 2] as unknown as string[] }), null);
  });

  test('hasWorkoutData: nothing entered means nothing to lose when closing', () => {
    assert.equal(hasWorkoutData(initialWorkoutData(3)), false);
    assert.equal(hasWorkoutData(applySetUpdate(initialWorkoutData(3), { index: 0, key: 'set1', value: '5', time: '10:00' }).data), true);
    assert.equal(hasWorkoutData({ ...initialWorkoutData(1), exerciseNotes: { 0: ' ' } }), false);
    assert.equal(hasWorkoutData({ ...initialWorkoutData(1), exerciseNotes: { 0: 'x' } }), true);
  });
});
