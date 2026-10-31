import { describe, test, beforeAll as before, afterAll as after, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { click, installDom, loadJsdom, sleep, typeInto } from './support/domHarness';

// Mounted behaviour of the confirm-delete flow and the edit dialogs when the action FAILS.
// Run through tests/laneBMountedRunner.test.ts (own process, so the fake DOM cannot leak into other tests),
// or directly: JSDOM_PATH=/path/to/jsdom bun test ./tests/mounted/editDialogs.dom.tsx
const JSDOM = await loadJsdom();

if (!JSDOM) throw new Error('jsdom not available: set JSDOM_PATH to an installed jsdom');

describe('mounted: failed edit / delete keep the dialog open', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let env: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let React: any, createRoot: any, act: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roots: any[] = [];

  before(async () => {
    env = installDom(JSDOM);
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    act = React.act;
  });
  afterEach(async () => {
    for (const root of roots) await act(async () => root.unmount());
    roots = [];
    env.window.document.body.innerHTML = '';
  });
  after(() => env?.window.close());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mount = async (node: any) => {
    const host = env.window.document.createElement('div');
    env.window.document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(node));
    return host;
  };
  const q = (sel: string) => env.window.document.querySelector(sel) as HTMLElement | null;
  const byText = (text: string) =>
    [...env.window.document.querySelectorAll('button')].find((b: HTMLElement) => b.textContent?.includes(text)) as HTMLElement | undefined;
  const flush = async (ms = 0) => act(async () => { await sleep(ms); });

  test('ConfirmDeleteButton: false and rejection keep the dialog open with an error; true closes; focus starts on cancel; 350ms arming; single flight', async () => {
    const { ConfirmDeleteButton } = await import('../../src/components/ConfirmDeleteButton');
    const outcomes: Array<'false' | 'reject' | 'true'> = ['false', 'reject', 'true'];
    let calls = 0;
    const onConfirm = async () => {
      calls++;
      await sleep(20);
      const next = outcomes.shift();
      if (next === 'reject') throw new Error('network');
      return next === 'true';
    };
    await mount(React.createElement(ConfirmDeleteButton, { onConfirm, confirmationTitle: 'Delete it?', confirmationDescription: 'Really?' }, 'Delete'));

    await act(async () => click(env.window, byText('Delete')!));
    await flush(10);
    assert.ok(q('[role="alertdialog"]'), 'dialog is open');
    assert.equal(env.window.document.activeElement?.textContent, 'No, keep it', 'cancel-first focus');

    // Inside the arming window a tap does nothing.
    await act(async () => click(env.window, byText('Getting ready')!));
    assert.equal(calls, 0, 'ignored before 350ms');

    await flush(400);
    const confirmButton = () => byText('Yes, delete')!;
    // Two quick taps: single flight.
    await act(async () => { click(env.window, confirmButton()); click(env.window, confirmButton()); });
    await flush(60);
    assert.equal(calls, 1, 'one call for a double tap');
    assert.ok(q('[role="alertdialog"]'), 'false => stays open');
    assert.match(q('[role="alertdialog"] [role="alert"]')?.textContent ?? '', /Could not complete/);

    // Retry: rejection also keeps it open.
    await act(async () => click(env.window, confirmButton()));
    await flush(60);
    assert.equal(calls, 2);
    assert.ok(q('[role="alertdialog"]'), 'rejection => stays open');

    // Retry: confirmed success closes.
    await act(async () => click(env.window, confirmButton()));
    await flush(60);
    assert.equal(calls, 3);
    assert.equal(q('[role="alertdialog"]'), null, 'true => closed');
  });

  test('EditWorkoutSessionModal: a failed save (false, undefined or rejection) keeps the dialog open, the draft and shows an error; only true closes', async () => {
    const { EditWorkoutSessionModal } = await import('../../src/components/EditWorkoutSessionModal');
    const session = { id: 's1', exercise: 'Push', duration: 45, date: '2026-10-29', start_time: '10:00', notes: 'Start:10:00 End:10:45 | 1.Bench: S1:5@60kg@10:05' };
    const results: Array<() => unknown> = [() => false, () => undefined, () => { throw new Error('offline'); }, () => true];
    const saved: unknown[] = [];
    let closed = 0;
    const onSave = async (id: string, updates: unknown) => {
      saved.push({ id, updates });
      return (results.shift() as () => unknown)() as boolean;
    };
    await mount(React.createElement(EditWorkoutSessionModal, { session, open: true, onClose: () => { closed++; }, onSave }));
    const name = () => q('#ew-name') as HTMLInputElement;
    await act(async () => typeInto(env.window, name(), 'Push (edited)'));

    for (let attempt = 1; attempt <= 3; attempt++) {
      await act(async () => click(env.window, byText('Save Changes')!));
      await flush(30);
      assert.equal(closed, 0, `attempt ${attempt}: not closed`);
      assert.equal(name().value, 'Push (edited)', `attempt ${attempt}: draft kept`);
      assert.match(q('[role="alert"]')?.textContent ?? '', /still here/, `attempt ${attempt}: error shown`);
      assert.equal((byText('Save Changes') as HTMLButtonElement).disabled, false, 'can retry');
    }
    await act(async () => click(env.window, byText('Save Changes')!));
    await flush(30);
    assert.equal(closed, 1, 'closed once, only after confirmed success');
    assert.equal(saved.length, 4);
    assert.equal((saved[3] as { updates: { exercise: string } }).updates.exercise, 'Push (edited)');
  });

  test('EditWorkoutSessionModal: a double tap on Save sends one save (single flight)', async () => {
    const { EditWorkoutSessionModal } = await import('../../src/components/EditWorkoutSessionModal');
    const session = { id: 's1', exercise: 'Push', duration: 45, date: '2026-10-29', start_time: '10:00', notes: '' };
    let calls = 0;
    await mount(React.createElement(EditWorkoutSessionModal, { session, open: true, onClose: () => {}, onSave: async () => { calls++; await sleep(30); return true; } }));
    await act(async () => { click(env.window, byText('Save Changes')!); click(env.window, byText('Save Changes')!); });
    await flush(60);
    assert.equal(calls, 1);
  });

  test('EditTemplateModal: a failed save keeps the dialog open with the typed draft; only true closes', async () => {
    const { EditTemplateModal } = await import('../../src/components/EditTemplateModal');
    const template = { id: 't1', name: 'Push day', exercises: ['Bench', 'Row'], created_at: '', updated_at: '' };
    const results: Array<() => unknown> = [() => false, () => { throw new Error('offline'); }, () => true];
    const calls: unknown[] = [];
    let closed = 0;
    const onSave = async (id: string, updates: unknown) => { calls.push(updates); return (results.shift() as () => unknown)() as boolean; };
    await mount(React.createElement(EditTemplateModal, { template, open: true, onClose: () => { closed++; }, onSave }));
    const name = () => q('#edit-template-name') as HTMLInputElement;
    await act(async () => typeInto(env.window, name(), 'Push day v2'));
    for (let attempt = 1; attempt <= 2; attempt++) {
      await act(async () => click(env.window, byText('Save Changes')!));
      await flush(30);
      assert.equal(closed, 0, `attempt ${attempt}: not closed`);
      assert.equal(name().value, 'Push day v2', `attempt ${attempt}: draft kept`);
      assert.match(q('[role="alert"]')?.textContent ?? '', /still here/);
    }
    await act(async () => click(env.window, byText('Save Changes')!));
    await flush(30);
    assert.equal(closed, 1);
    assert.deepEqual(calls[2], { name: 'Push day v2', exercises: ['Bench', 'Row'] });
  });

  test('ConfirmDeleteButton: tapping outside never dismisses or deletes', async () => {
    const { ConfirmDeleteButton } = await import('../../src/components/ConfirmDeleteButton');
    let calls = 0;
    await mount(React.createElement(ConfirmDeleteButton, { onConfirm: () => { calls++; return true; }, confirmationTitle: 'Delete it?', confirmationDescription: 'Really?' }, 'Delete'));
    await act(async () => click(env.window, byText('Delete')!));
    await flush(400);
    await act(async () => {
      env.window.document.body.dispatchEvent(new env.window.MouseEvent('pointerdown', { bubbles: true }));
      env.window.document.body.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    });
    await flush(20);
    assert.ok(q('[role="alertdialog"]'), 'still open');
    assert.equal(calls, 0);
  });
});
