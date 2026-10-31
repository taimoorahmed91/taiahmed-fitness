import { describe, it as test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source guards for corrective lane B. The behaviour itself is covered by workoutDraft.test.ts,
// offlineIdentity.test.ts and the mounted tests; these keep the wiring from quietly regressing.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('mutation results are explicit booleans', () => {
  const sessions = read('src/hooks/useGymSessions.ts');
  const templates = read('src/hooks/useWorkoutTemplates.ts');
  test('session update/delete and every template mutation declare Promise<boolean>', () => {
    assert.match(sessions, /const updateSession = async \([^)]*\): Promise<boolean>/);
    assert.match(sessions, /const deleteSession = async \([^)]*\): Promise<boolean>/);
    for (const name of ['addTemplate', 'updateTemplate', 'deleteTemplate']) {
      assert.match(templates, new RegExp(`const ${name} = async \\([^)]*\\): Promise<boolean>`), name);
    }
  });
  test('an update/delete that touched no row is a failure, not a success', () => {
    assert.match(sessions, /No row updated/);
    assert.match(sessions, /No row deleted/);
    assert.match(templates, /No row updated/);
    assert.match(templates, /No row deleted/);
  });
  test('addSession refuses to save into a different account', () => {
    assert.match(sessions, /expectedUserId/);
    assert.match(sessions, /Signed-in account changed/);
  });
});

describe('dialogs close only after a confirmed success', () => {
  test('ConfirmDeleteButton uses the shared rule and closes in the success branch only', () => {
    const src = read('src/components/ConfirmDeleteButton.tsx');
    assert.match(src, /if \(await confirmedSuccess\(onConfirm\)\) setOpen\(false\);\s*else setError\(true\);/);
    // Cancel-first focus, 350ms arming and single flight are still there.
    assert.match(src, /onOpenAutoFocus/);
    assert.match(src, /350/);
    assert.match(src, /busy\.current/);
  });
  for (const file of ['src/components/EditWorkoutSessionModal.tsx', 'src/components/EditTemplateModal.tsx']) {
    test(`${file.split('/').pop()}: onClose runs only when the save was confirmed, and the error is shown`, () => {
      const src = read(file);
      assert.match(src, /confirmedSuccess\(/);
      assert.match(src, /requireTrue: true/);
      assert.match(src, /if \(saved\) onClose\(\);\s*else setSaveFailed\(true\);/);
      assert.match(src, /role="alert"/);
      assert.doesNotMatch(src, /\bawait onSave\(/);
    });
  }
  test('Gym hands the edit dialogs real boolean results', () => {
    const src = read('src/pages/Gym.tsx');
    assert.match(src, /onSave=\{updateSession\}/);
    assert.match(src, /Promise<boolean> =>\s*updateTemplate\(id, updates\)/);
    assert.match(src, /if \(created\) toast\.success/);
    assert.match(src, /throw new Error\('Template was not created'\)/);
  });
});

describe('workout recovery wiring', () => {
  const modal = read('src/components/ActiveWorkoutModal.tsx');
  const gym = read('src/pages/Gym.tsx');
  test('nothing reads or writes the shared draft key directly any more', () => {
    for (const [name, src] of [['ActiveWorkoutModal', modal], ['Gym', gym]] as const) {
      assert.doesNotMatch(src, /localStorage\.(get|set|remove)Item\(ACTIVE_WORKOUT_KEY/, name);
      assert.doesNotMatch(src, /'fittrack-active-workout'/, name);
    }
    assert.match(modal, /writeDraft\(/);
    assert.match(modal, /resolveDraft\(/);
    assert.match(gym, /resolveDraft\(/);
  });
  test('the workout resumes from its saved exercise list, and its identity is fixed when opened', () => {
    assert.match(modal, /draftExercises\(savedState\)/);
    assert.match(modal, /ownerIdRef/);
    assert.match(modal, /onFinish\(\{[\s\S]*\}, ownerIdRef\.current\)/);
    assert.match(gym, /expectedUserId: ownerId/);
    assert.match(gym, /pausedAsTemplate\(/);
  });
  test('a failed save to the device is shown, blocks closing, and never says "saving"', () => {
    assert.match(modal, /persistFailure &&/);
    assert.match(modal, /Try saving again/);
    assert.match(modal, /!persistFailure && <OfflineBadge/);
    assert.match(modal, /beforeunload/);
  });
  test('discard only closes when the saved copy was really removed', () => {
    assert.match(modal, /const handleCancel = \(\): boolean =>/);
    assert.match(modal, /if \(!cleared\) return false;/);
  });
});

describe('offline claim is narrow and honest', () => {
  const ctx = read('src/contexts/UserContext.tsx');
  const policy = read('src/lib/offlineIdentity.ts');
  test('the policy file states what it does not do', () => {
    assert.match(policy, /does not create or fake a session/i);
    assert.match(policy, /does not allow any server write/i);
    assert.match(policy, /no offline "cold login"/i);
  });
  test('the context exposes recovery-only approval so UI can restrict it, and never owner rights', () => {
    assert.match(ctx, /offlineRecoveryOnly/);
    assert.match(read('src/lib/offlineIdentity.ts'), /approved: true, owner: false, source: 'last-known-offline'/);
  });
});
