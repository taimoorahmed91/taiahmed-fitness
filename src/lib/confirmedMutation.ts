// One rule for "did that save/delete really work?", shared by every edit dialog and the delete button.
// Pure (no React, no network) so the exact rule is unit tested.
//
// Contract for hooks:  a mutation resolves `true` only when the server confirmed the change, resolves
// `false` when it was refused or did not happen, and may also reject. A dialog must treat BOTH
// `false` and a rejection as "failed": keep the draft on screen, show an error, never close.

/**
 * Runs a mutation and reports whether it was confirmed.
 *
 * - `requireTrue: true`  (edit dialogs, whose hooks return a boolean): only an explicit `true` is success.
 *   `undefined` is NOT success, so a hook that forgot to return a result can never close a dialog.
 * - default (delete button, which is also used with older void callbacks): anything except an explicit
 *   `false` or a rejection counts as success.
 */
export const confirmedSuccess = async (
  mutation: () => unknown,
  options: { requireTrue?: boolean } = {},
): Promise<boolean> => {
  try {
    const result = await mutation();
    return options.requireTrue ? result === true : result !== false;
  } catch {
    return false;
  }
};

/** Shown under a dialog whose save did not go through. The draft is still there. */
export const SAVE_FAILED_MESSAGE =
  "Couldn't save your changes. Everything you entered is still here. Check your connection and try again.";
