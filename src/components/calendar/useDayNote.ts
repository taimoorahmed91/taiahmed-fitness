import { useCallback, useMemo } from 'react';
import { useDailyNotes } from '@/hooks/useDailyNotes';
import { useSharedTableState } from '@/lib/sharedTable';
import { tableView } from '@/components/feedback/tableView';
import { noteInputFromDraft, resolveDayNoteAccess, type DayNoteDraft } from '@/lib/dayNote';

/**
 * The note controller for ONE selected day: what is known about its note (`access`), a save that resolves a real
 * boolean, and a retry for a failed first load. The pure rules live in lib/dayNote.ts.
 *
 * `save` writes under the `isoDate` this hook was called with. Mount the editor with a key that includes the date
 * (SelectedDayPanel does), so an editor opened for one day can never save into another.
 */
export const useDayNote = (isoDate: string) => {
  const { notes, saveNote, refetch, userId, isDemo } = useDailyNotes();
  const state = useSharedTableState('daily_notes');
  const view = tableView(state);
  const refreshFailed = state.refreshFailed;

  const access = useMemo(
    () => resolveDayNoteAccess({ isoDate, signedIn: userId !== null && userId !== undefined, isDemo: !!isDemo, view, refreshFailed, notes }),
    [isoDate, userId, isDemo, view, refreshFailed, notes],
  );

  const save = useCallback(async (draft: DayNoteDraft): Promise<boolean> => (await saveNote(noteInputFromDraft(isoDate, draft))) === true, [saveNote, isoDate]);

  return { access, save, retry: refetch, userId: userId ?? null };
};
