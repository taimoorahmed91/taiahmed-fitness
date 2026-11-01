import { useEffect, useId, useRef, useState } from 'react';
import { Lock, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { SYMPTOM_TAGS, type DailyNote } from '@/hooks/useDailyNotes';
import {
  draftFromNote,
  hasNoteChangedSince,
  isDraftDirty,
  isDraftSavable,
  noteActionVerb,
  noteBlockedReason,
  type DayNoteAccess,
  type DayNoteDraft,
} from '@/lib/dayNote';
import { formatLongDay } from './calendarModel';

interface DayNoteEditorProps {
  /** The exact selected day. It is shown, never editable, and it is the date the note is saved under. */
  isoDate: string;
  access: DayNoteAccess;
  /** Resolves `true` only when the note was really saved. Anything else keeps the dialog open with the draft intact. */
  onSave: (draft: DayNoteDraft) => Promise<boolean>;
  /** Reload notes after a failed first load. */
  onRetry?: () => Promise<void> | void;
}

/**
 * "Add note" / "Edit note" for ONE selected day, as a button plus a dialog.
 *
 * Safety rules (all in tests/mounted/selectedDayPanel.dom.tsx):
 *  - The form starts from the stored note's exact content and is saved under the exact selected ISO date.
 *  - If we do not KNOW whether the day has a note (still loading, or the load failed) the button is unavailable and
 *    says why, so a real note can never be replaced blind. The demo account is view only, with the reason shown.
 *  - Save is single-flight. The dialog closes only when `onSave` says `true`; on failure it stays open, keeps the
 *    draft, and says so in an alert.
 *  - If the stored note changes under the open editor (another tab or device), Save is blocked with an explanation.
 *  - An outside tap never discards typed text; Escape and Cancel do (and are blocked while saving).
 *  - Mount this with `key={userId}`: a different account then starts with no draft and a closed dialog.
 */
export const DayNoteEditor = ({ isoDate, access, onSave, onRetry }: DayNoteEditorProps) => {
  const uid = useId();
  const reasonId = `${uid}-reason`;
  const tagsLabelId = `${uid}-tags`;
  const severityLabelId = `${uid}-severity`;
  const notesId = `${uid}-text`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const saveHintId = `${uid}-save-hint`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayNoteDraft>(() => draftFromNote(null));
  // What the editor started from, to tell "unchanged" from "edited" and to notice a change made elsewhere.
  const [baseline, setBaseline] = useState<{ note: DailyNote | null; draft: DayNoteDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const ready = access.status === 'ready';
  const existing = access.status === 'ready' ? access.existing : null;
  const verb = noteActionVerb(access);
  const blocked = noteBlockedReason(access);
  const longDay = formatLongDay(isoDate);

  const dirty = baseline ? isDraftDirty(baseline.draft, draft) : false;
  const changedElsewhere = open && baseline !== null && (!ready || hasNoteChangedSince(baseline.note, existing));
  const savable = ready && !changedElsewhere && isDraftSavable(draft);

  const openEditor = () => {
    if (!ready) return;
    const start = draftFromNote(existing);
    setBaseline({ note: existing, draft: start });
    setDraft(start);
    setFailed(false);
    setOpen(true);
  };

  const closeEditor = () => {
    if (inFlight.current) return;
    setOpen(false);
    setBaseline(null);
    setFailed(false);
  };

  const submit = async () => {
    if (inFlight.current || !savable) return;
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    let ok = false;
    try {
      ok = (await onSave(draft)) === true;
    } catch {
      ok = false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
    if (!mounted.current) return;
    if (ok) {
      setOpen(false);
      setBaseline(null);
    } else {
      setFailed(true);
    }
  };

  const retry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      if (mounted.current) setRetrying(false);
    }
  };

  const toggleTag = (tag: string) =>
    setDraft((d) => ({ ...d, tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag] }));

  const Icon = access.status === 'read-only' ? Lock : verb === 'Edit' ? Pencil : Plus;
  // The dialog is only ever open for a ready day, so its verb is exact.
  const dialogVerb = verb === 'Edit' ? 'Edit' : 'Add';

  return (
    <>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${verb} note for ${longDay}`}
          aria-disabled={!ready || undefined}
          aria-describedby={blocked ? reasonId : undefined}
          onClick={openEditor}
        >
          <Icon aria-hidden="true" />
          {verb} note
        </Button>
        {blocked && (
          <p id={reasonId} className="max-w-prose text-xs text-muted-foreground">
            {blocked}
          </p>
        )}
        {access.status === 'unknown' && onRetry && (
          <Button type="button" variant="secondary" size="sm" loading={retrying} loadingText="Trying again…" onClick={retry}>
            Try again
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeEditor())}>
        <DialogContent
          layout="mobile-full"
          onCloseAutoFocus={(event) => {
            // Back to the button that opened it, even though that button was re-labelled (Add -> Edit) by the save.
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          onInteractOutside={(event) => {
            if (dirty || saving) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialogVerb} note
              <span className="font-normal text-muted-foreground"> — </span>
              <time dateTime={isoDate} className="font-normal">
                {longDay}
              </time>
            </DialogTitle>
            <DialogDescription>
              {dialogVerb === 'Edit' ? 'Change the note for this day.' : 'Write a note for this day.'} Nothing is saved until you press Save.
            </DialogDescription>
          </DialogHeader>

          {ready && access.stale && (
            <p role="status" className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Your notes could not be refreshed, so this may not be the latest version. Saving replaces this day&apos;s note.
            </p>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <span id={tagsLabelId} className="block text-sm font-medium leading-none">
                Symptoms / Tags
              </span>
              <div role="group" aria-labelledby={tagsLabelId} className="flex flex-wrap gap-2">
                {SYMPTOM_TAGS.map((tag) => (
                  <ToggleChip key={tag} pressed={draft.tags.includes(tag)} onPressedChange={() => toggleTag(tag)}>
                    {tag}
                  </ToggleChip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span id={severityLabelId} className="block text-sm font-medium leading-none">
                Severity (optional)
              </span>
              <div role="group" aria-labelledby={severityLabelId} className="flex gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <Button
                    key={level}
                    type="button"
                    variant={draft.severity === level ? 'default' : 'outline'}
                    size="touch"
                    className="flex-1 px-0"
                    aria-pressed={draft.severity === level}
                    aria-label={`Severity ${level} of 5`}
                    onClick={() => setDraft((d) => ({ ...d, severity: d.severity === level ? null : level }))}
                  >
                    {level}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">1 = Mild, 5 = Severe</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={notesId}>Additional Notes (optional)</Label>
              <Textarea
                id={notesId}
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                maxLength={10000}
                rows={6}
                aria-describedby={hintId}
              />
              <p id={hintId} className="text-xs text-muted-foreground">
                Up to 10,000 characters.
              </p>
            </div>
          </div>

          {changedElsewhere && (
            <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
              This day&apos;s note changed while you were editing, so saving now would replace a version you have not seen. Cancel, then open it again to see the latest.
            </p>
          )}
          {failed && (
            <p id={errorId} role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
              The note was not saved. What you wrote is still here, so you can try again.
            </p>
          )}

          <DialogFooter>
            {!isDraftSavable(draft) && !changedElsewhere && (
              <p id={saveHintId} className="text-sm text-muted-foreground sm:mr-auto sm:self-center">
                Pick at least one tag or write a note to save.
              </p>
            )}
            <Button type="button" variant="outline" size="touch" aria-disabled={saving || undefined} onClick={closeEditor}>
              Cancel
            </Button>
            <Button
              type="button"
              size="touch"
              loading={saving}
              loadingText="Saving…"
              aria-disabled={!savable || undefined}
              aria-describedby={failed ? errorId : !isDraftSavable(draft) && !changedElsewhere ? saveHintId : undefined}
              onClick={submit}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
