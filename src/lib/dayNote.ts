/**
 * Pure rules for adding or editing the daily note of ONE selected day (tests/dayNote.test.ts).
 *
 *  - The note belongs to the exact ISO date that was selected. The date is never editable here and never shifts.
 *  - A note is only editable once we KNOW what is stored for that day. If the notes failed to load (or are still
 *    loading) there is no way to tell "no note" from "a note we could not read", and saving would silently replace
 *    a real note. So: unknown means no editing.
 *  - The demo account is read-only. The server enforces that too (restrictive RLS); this only explains it up front.
 *  - Editing an existing note starts from its exact content. Saving never trims or reorders what the person wrote.
 */
import type { DailyNote } from '@/hooks/useDailyNotes';
import { isValidIsoDate } from '@/lib/selectedDay';
import type { TableView } from '@/components/feedback/tableView';

/** The shared demo account (see DemoBanner). A test keeps the two in step. */
export const DEMO_ACCOUNT_EMAIL = 'demo@fittrack.local';

export const isDemoEmail = (email: string | null | undefined): boolean => (email ?? '').trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;

export type DayNoteAccess =
  /** The day is not a real date. Nothing can be saved. */
  | { status: 'invalid-date' }
  | { status: 'signed-out' }
  /** The shared demo account: viewing only. `existing` is only filled when the notes are known (so the label can say Edit). */
  | { status: 'read-only'; existing: DailyNote | null }
  /** Notes are still on their first load: whether a note exists is not known yet. */
  | { status: 'loading' }
  /** The first load of notes failed: whether a note exists is UNKNOWN. Replacing is blocked. */
  | { status: 'unknown' }
  /** Known. `existing` is the stored note for exactly this date (null = there really is none). `stale`: the last refresh failed. */
  | { status: 'ready'; existing: DailyNote | null; stale: boolean };

export interface DayNoteAccessInput {
  isoDate: string;
  signedIn: boolean;
  isDemo: boolean;
  view: TableView;
  refreshFailed: boolean;
  notes: readonly DailyNote[];
}

export const resolveDayNoteAccess = ({ isoDate, signedIn, isDemo, view, refreshFailed, notes }: DayNoteAccessInput): DayNoteAccess => {
  if (!isValidIsoDate(isoDate)) return { status: 'invalid-date' };
  if (!signedIn) return { status: 'signed-out' };
  if (isDemo) return { status: 'read-only', existing: view === 'ready' ? notes.find((n) => n.date === isoDate) ?? null : null };
  if (view === 'error') return { status: 'unknown' };
  if (view === 'loading') return { status: 'loading' };
  return { status: 'ready', existing: notes.find((n) => n.date === isoDate) ?? null, stale: refreshFailed };
};

export const canEditNote = (access: DayNoteAccess): access is Extract<DayNoteAccess, { status: 'ready' }> => access.status === 'ready';

/** One plain sentence for why the button is unavailable. null when it is available. */
export const noteBlockedReason = (access: DayNoteAccess): string | null => {
  switch (access.status) {
    case 'invalid-date':
      return 'This is not a valid date, so a note cannot be saved for it.';
    case 'signed-out':
      return 'Sign in to add notes.';
    case 'read-only':
      return 'The demo account is view only, so notes cannot be added or changed.';
    case 'loading':
      return 'Checking whether this day already has a note…';
    case 'unknown':
      return "Your notes didn't load, so we can't tell whether this day already has one. Try again before adding a note, so nothing is overwritten.";
    default:
      return null;
  }
};

/**
 * What the button says. "Edit" only when a stored note for this exact date is known to exist, "Add" only when it is
 * known not to. While that is unknown (still loading, or the load failed) it says neither.
 */
export const noteActionVerb = (access: DayNoteAccess): 'Add' | 'Edit' | 'Add or edit' => {
  if (access.status === 'loading' || access.status === 'unknown') return 'Add or edit';
  return (access.status === 'ready' || access.status === 'read-only') && access.existing ? 'Edit' : 'Add';
};

/* ------------------------------------------------------------------ the draft */

export interface DayNoteDraft {
  tags: string[];
  severity: number | null;
  notes: string;
}

/** The form's starting point: the stored note exactly, or an empty draft. */
export const draftFromNote = (note: DailyNote | null | undefined): DayNoteDraft => ({
  tags: [...(note?.tags ?? [])],
  severity: note?.severity ?? null,
  notes: note?.notes ?? '',
});

/** A note needs at least one tag or some text. */
export const isDraftSavable = (draft: DayNoteDraft): boolean => draft.tags.length > 0 || draft.notes.trim() !== '';

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

/** True when the draft differs from where it started. Used to protect typing from an accidental outside tap. */
export const isDraftDirty = (initial: DayNoteDraft, draft: DayNoteDraft): boolean =>
  !sameList(initial.tags, draft.tags) || initial.severity !== draft.severity || initial.notes !== draft.notes;

export interface DayNoteInput {
  date: string;
  tags: string[];
  severity: number | null;
  notes?: string;
}

/** What gets saved: the exact selected date, and the text exactly as written (blank text becomes "no text"). */
export const noteInputFromDraft = (isoDate: string, draft: DayNoteDraft): DayNoteInput => ({
  date: isoDate,
  tags: [...draft.tags],
  severity: draft.severity,
  notes: draft.notes.trim() === '' ? undefined : draft.notes,
});

/**
 * The note was changed (or created, or removed) somewhere else while the editor was open. Saving now would replace
 * that newer version without the person ever seeing it.
 */
export const hasNoteChangedSince = (baseline: DailyNote | null, current: DailyNote | null): boolean => {
  if (baseline === null || current === null) return baseline !== current;
  return baseline.id !== current.id || baseline.updated_at !== current.updated_at;
};
