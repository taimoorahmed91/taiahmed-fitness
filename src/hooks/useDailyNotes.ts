import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { useSharedTable } from '@/lib/sharedTable';
import { byDateDesc, upsertSorted, removeById, errorText } from '@/lib/sharedData';
import { isValidIsoDate } from '@/lib/selectedDay';
import { isDemoEmail } from '@/lib/dayNote';

export interface DailyNote {
  id: string;
  user_id: string;
  date: string;
  tags: string[];
  severity: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** What a save needs. `date` must be a real `YYYY-MM-DD` day. */
export interface DailyNoteInput {
  date: string;
  tags: string[];
  severity?: number | null;
  notes?: string;
}

export const SYMPTOM_TAGS = [
  'Nausea', 'Upset Stomach', 'Headache', 'Fatigue', 'Stressed',
  'Fever', 'Cold/Flu', 'Allergies', 'Poor Sleep', 'Overate',
  'Skipped Meal', 'Alcohol', 'Travel', 'Period', 'Medication',
] as const;

const fetchDailyNotes = async (userId: string): Promise<DailyNote[]> => {
  const { data, error } = await supabase
    .from('fittrack_daily_notes')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
};

/** One note per date: a saved note replaces any cached note with the same id or the same date. */
const isSameNote = (existing: DailyNote, incoming: DailyNote) => existing.id === incoming.id || existing.date === incoming.date;

export const useDailyNotes = () => {
  // One shared query per signed-in user: every component calling useDailyNotes reads the same notes.
  const { user, data: notes, loading, refetch, patch } = useSharedTable<DailyNote>({
    table: 'daily_notes',
    fetchRows: fetchDailyNotes,
    errorMessage: 'Failed to load daily notes',
    errorToastKey: 'notes',
  });

  /**
   * Saves the note for `note.date` (one note per date: it replaces any note already stored for that day).
   * Resolves `true` ONLY when the server confirmed the save and the cache was updated; `false` for anything else
   * (signed out, demo account, bad date, server refusal, network error). It never rejects, so callers can keep their
   * draft open on `false` and close it on `true`. The demo account is refused here with an explanation, and by the
   * server (restrictive RLS) regardless of this check.
   */
  const saveNote = async (note: DailyNoteInput): Promise<boolean> => {
    if (!user) return false;
    if (isDemoEmail(user.email)) {
      toast.info('The demo account is view only', { description: 'Notes can not be added or changed here.' });
      return false;
    }
    if (!isValidIsoDate(note.date)) {
      toast.error('Failed to save daily note', { description: 'That is not a valid date.' });
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('fittrack_daily_notes')
        .upsert(
          { user_id: user.id, date: note.date, tags: note.tags, severity: note.severity || null, notes: note.notes || null },
          { onConflict: 'user_id,date' }
        )
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error('The server did not return the saved note');
      patch((prev) => upsertSorted(prev, data, byDateDesc, isSameNote), user.id);
      toast.success('Note saved', { description: 'Your daily note has been saved.' });
      logActivity({ action: 'create', category: 'daily_notes', details: { date: note.date, tags: note.tags, severity: note.severity, notes: note.notes } });
      return true;
    } catch (error) {
      console.error('Error adding daily note:', error);
      toast.error('Failed to save daily note');
      logActivity({ action: 'create', category: 'daily_notes', status: 'error', error_message: errorText(error, 'Failed'), details: { date: note.date } });
      return false;
    }
  };
  /** Same function under its older name, for the existing forms. */
  const addNote = saveNote;

  const deleteNote = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_daily_notes').delete().eq('id', id);
      if (error) throw error;
      patch((prev) => removeById(prev, id));
      toast.success('Note deleted', { description: 'Your daily note has been removed.' });
      logActivity({ action: 'delete', category: 'daily_notes', details: { id } });
    } catch (error) {
      console.error('Error deleting daily note:', error);
      toast.error('Failed to delete daily note');
      logActivity({ action: 'delete', category: 'daily_notes', status: 'error', error_message: errorText(error, 'Failed'), details: { id } });
    }
  };

  const getNoteForDate = (date: string): DailyNote | undefined => notes.find((note) => note.date === date);

  const getNotesMap = (): Map<string, DailyNote> => {
    const map = new Map<string, DailyNote>();
    notes.forEach((note) => map.set(note.date, note));
    return map;
  };

  return {
    notes,
    loading,
    saveNote,
    addNote,
    deleteNote,
    getNoteForDate,
    getNotesMap,
    refetch,
    /** The signed-in account. A different id means a different person: drop any note drafts. */
    userId: user?.id ?? null,
    /** The shared read-only demo account. */
    isDemo: isDemoEmail(user?.email),
  };
};
