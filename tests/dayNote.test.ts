import { describe, test } from 'bun:test';
import assert from 'node:assert/strict';
import {
  DEMO_ACCOUNT_EMAIL,
  canEditNote,
  draftFromNote,
  hasNoteChangedSince,
  isDemoEmail,
  isDraftDirty,
  isDraftSavable,
  noteActionVerb,
  noteBlockedReason,
  noteInputFromDraft,
  resolveDayNoteAccess,
} from '../src/lib/dayNote';
import { DEMO_EMAIL } from '../src/components/DemoBanner';
import type { DailyNote } from '../src/hooks/useDailyNotes';

const note = (date: string, extra: Partial<DailyNote> = {}): DailyNote => ({ id: `n-${date}`, user_id: 'u', date, tags: ['Headache'], severity: 3, notes: '  keep this exactly\nline two  ', created_at: 'c', updated_at: 'u1', ...extra });
const base = { isoDate: '2026-10-30', signedIn: true, isDemo: false, view: 'ready' as const, refreshFailed: false, notes: [] as DailyNote[] };

describe('who may add or edit a day note', () => {
  test('the demo email here is the same one the banner uses', () => {
    assert.equal(DEMO_ACCOUNT_EMAIL, DEMO_EMAIL);
    assert.equal(isDemoEmail(' Demo@FitTrack.local '), true);
    assert.equal(isDemoEmail('someone@else.com'), false);
    assert.equal(isDemoEmail(null), false);
  });
  test('no stored note for the exact date -> Add, ready', () => {
    const a = resolveDayNoteAccess({ ...base, notes: [note('2026-10-29'), note('2026-10-31')] });
    assert.deepEqual(a, { status: 'ready', existing: null, stale: false });
    assert.equal(noteActionVerb(a), 'Add');
    assert.equal(canEditNote(a), true);
    assert.equal(noteBlockedReason(a), null);
  });
  test('a stored note for exactly this date -> Edit with that note', () => {
    const n = note('2026-10-30');
    const a = resolveDayNoteAccess({ ...base, notes: [note('2026-10-29'), n] });
    assert.equal(a.status === 'ready' && a.existing, n);
    assert.equal(noteActionVerb(a), 'Edit');
  });
  test('a failed or unfinished load is UNKNOWN: no editing, so nothing can be replaced blind', () => {
    for (const view of ['error', 'loading'] as const) {
      const a = resolveDayNoteAccess({ ...base, view, notes: [] });
      assert.equal(canEditNote(a), false);
      assert.match(noteBlockedReason(a)!, /./);
    }
    assert.match(noteBlockedReason(resolveDayNoteAccess({ ...base, view: 'error' }))!, /overwritten/);
    assert.equal(resolveDayNoteAccess({ ...base, view: 'error' }).status, 'unknown');
    assert.equal(resolveDayNoteAccess({ ...base, view: 'loading' }).status, 'loading');
  });
  test('a failed refresh over loaded rows still edits, but is flagged stale', () => {
    const a = resolveDayNoteAccess({ ...base, refreshFailed: true, notes: [note('2026-10-30')] });
    assert.equal(a.status === 'ready' && a.stale, true);
  });
  test('the demo account, a signed-out visitor and a fake date are all blocked, with a reason', () => {
    assert.equal(resolveDayNoteAccess({ ...base, isDemo: true, notes: [note('2026-10-30')] }).status, 'read-only');
    assert.match(noteBlockedReason({ status: 'read-only', existing: null })!, /demo account is view only/);
    assert.equal(resolveDayNoteAccess({ ...base, signedIn: false }).status, 'signed-out');
    assert.equal(resolveDayNoteAccess({ ...base, isoDate: '2026-02-30' }).status, 'invalid-date');
    assert.equal(canEditNote({ status: 'read-only', existing: null }), false);
    for (const s of ['signed-out', 'invalid-date'] as const) assert.equal(canEditNote({ status: s }), false);
  });
  test('the button label never claims what is not known', () => {
    assert.equal(noteActionVerb(resolveDayNoteAccess({ ...base, view: 'error' })), 'Add or edit');
    assert.equal(noteActionVerb(resolveDayNoteAccess({ ...base, view: 'loading' })), 'Add or edit');
    const demoWith = resolveDayNoteAccess({ ...base, isDemo: true, notes: [note('2026-10-30')] });
    assert.equal(noteActionVerb(demoWith), 'Edit', 'a demo viewer still sees that a note exists');
    assert.equal(noteActionVerb(resolveDayNoteAccess({ ...base, isDemo: true })), 'Add');
    assert.equal(resolveDayNoteAccess({ ...base, isDemo: true, view: 'error', notes: [note('2026-10-30')] }).status, 'read-only');
    assert.equal(noteActionVerb(resolveDayNoteAccess({ ...base, isDemo: true, view: 'error', notes: [note('2026-10-30')] })), 'Add', 'unknown notes never leak into a demo label');
  });
});

describe('the draft', () => {
  test('editing starts from the exact stored content', () => {
    const n = note('2026-10-30', { tags: ['Fatigue', 'Headache'], severity: 4 });
    assert.deepEqual(draftFromNote(n), { tags: ['Fatigue', 'Headache'], severity: 4, notes: '  keep this exactly\nline two  ' });
    assert.deepEqual(draftFromNote(null), { tags: [], severity: null, notes: '' });
    assert.notEqual(draftFromNote(n).tags, n.tags, 'a copy, so editing never mutates the cache');
  });
  test('saving uses the exact date and keeps the text as written', () => {
    const input = noteInputFromDraft('2026-10-30', draftFromNote(note('2026-10-30')));
    assert.deepEqual(input, { date: '2026-10-30', tags: ['Headache'], severity: 3, notes: '  keep this exactly\nline two  ' });
    assert.equal(noteInputFromDraft('2026-10-30', { tags: ['Cold/Flu'], severity: null, notes: '   ' }).notes, undefined);
  });
  test('a note needs a tag or some text', () => {
    assert.equal(isDraftSavable({ tags: [], severity: 2, notes: '  ' }), false);
    assert.equal(isDraftSavable({ tags: ['Travel'], severity: null, notes: '' }), true);
    assert.equal(isDraftSavable({ tags: [], severity: null, notes: 'x' }), true);
  });
  test('dirty means different from where it started', () => {
    const start = draftFromNote(note('2026-10-30'));
    assert.equal(isDraftDirty(start, draftFromNote(note('2026-10-30'))), false);
    assert.equal(isDraftDirty(start, { ...start, notes: start.notes + '!' }), true);
    assert.equal(isDraftDirty(start, { ...start, tags: [] }), true);
    assert.equal(isDraftDirty(start, { ...start, severity: null }), true);
  });
  test('a note changed, created or removed elsewhere is detected', () => {
    const a = note('2026-10-30');
    assert.equal(hasNoteChangedSince(a, { ...a }), false);
    assert.equal(hasNoteChangedSince(null, null), false);
    assert.equal(hasNoteChangedSince(a, { ...a, updated_at: 'u2' }), true);
    assert.equal(hasNoteChangedSince(null, a), true);
    assert.equal(hasNoteChangedSince(a, null), true);
  });
});
