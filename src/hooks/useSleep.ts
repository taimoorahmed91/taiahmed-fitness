import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { useSharedTable } from '@/lib/sharedTable';
import { byDateDesc, upsertSorted, removeById, errorText } from '@/lib/sharedData';

export interface SleepEntry {
  id: string;
  hours: number;
  date: string;
  notes?: string;
}

const mapEntry = (e: Tables<'fittrack_sleep'>): SleepEntry => ({
  id: e.id,
  hours: Number(e.hours),
  date: e.date,
  notes: e.notes || undefined,
});

const fetchSleepEntries = async (userId: string): Promise<SleepEntry[]> => {
  const { data, error } = await supabase
    .from('fittrack_sleep')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapEntry);
};

export const useSleep = () => {
  // One shared query per signed-in user: every component calling useSleep reads the same entries.
  const { user, data: entries, loading, refetch, patch, invalidate } = useSharedTable<SleepEntry>({
    table: 'sleep',
    fetchRows: fetchSleepEntries,
    errorMessage: 'Failed to load sleep entries',
  });

  /**
   * Mutation contract (shared by every add / update / delete in this hook):
   * resolves `true` ONLY when the database confirmed the change by returning the affected row, and `false` for
   * anything else (no signed-in user, a database error, or zero rows affected, e.g. the row is gone or row-level
   * security refused it). It never rejects and a toast has already explained a failure, so a caller only has to
   * keep its draft on screen when it gets `false`. After a zero-row update/delete the list is refetched so the
   * screen matches the server.
   */
  const addEntry = async (entry: Omit<SleepEntry, 'id'>): Promise<boolean> => {
    if (!user) {
      toast.error('Please log in to add sleep entries');
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('fittrack_sleep')
        .insert({
          user_id: user.id,
          hours: entry.hours,
          date: entry.date,
          notes: entry.notes,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No row returned');
      const saved = mapEntry(data);
      patch((prev) => upsertSorted(prev, saved, byDateDesc), user.id);
      toast.success('Sleep entry added!');
      logActivity({ action: 'create', category: 'sleep', details: { hours: entry.hours, date: entry.date, notes: entry.notes } });
      return true;
    } catch (error) {
      console.error('Error adding sleep entry:', error);
      toast.error('Failed to add sleep entry');
      logActivity({ action: 'create', category: 'sleep', status: 'error', error_message: errorText(error, 'Failed'), details: { hours: entry.hours, date: entry.date } });
      return false;
    }
  };

  const updateEntry = async (id: string, entry: Omit<SleepEntry, 'id'>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('fittrack_sleep')
        .update({
          hours: entry.hours,
          date: entry.date,
          notes: entry.notes,
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        // No row came back: it no longer exists or this account may not change it (e.g. the read-only demo).
        // That is not a success. Refresh so the list matches the server.
        void invalidate();
        toast.error('Could not update this sleep entry. It may have been removed, or this account cannot change it.');
        logActivity({ action: 'update', category: 'sleep', status: 'error', error_message: 'No row updated', details: { id } });
        return false;
      }
      const saved = mapEntry(data);
      patch((prev) => upsertSorted(prev, saved, byDateDesc));
      toast.success('Sleep entry updated!');
      logActivity({ action: 'update', category: 'sleep', details: { id, hours: entry.hours, date: entry.date, notes: entry.notes } });
      return true;
    } catch (error) {
      console.error('Error updating sleep entry:', error);
      toast.error('Failed to update sleep entry');
      logActivity({ action: 'update', category: 'sleep', status: 'error', error_message: errorText(error, 'Failed'), details: { id } });
      return false;
    }
  };

  /** Resolves `true` only when a row was really deleted. */
  const deleteEntry = async (id: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('fittrack_sleep').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        void invalidate();
        toast.error('Could not delete this sleep entry. It may already be gone, or this account cannot delete it.');
        logActivity({ action: 'delete', category: 'sleep', status: 'error', error_message: 'No row deleted', details: { id } });
        return false;
      }
      patch((prev) => removeById(prev, id));
      toast.success('Sleep entry deleted!');
      logActivity({ action: 'delete', category: 'sleep', details: { id } });
      return true;
    } catch (error) {
      console.error('Error deleting sleep entry:', error);
      toast.error('Failed to delete sleep entry');
      logActivity({ action: 'delete', category: 'sleep', status: 'error', error_message: errorText(error, 'Failed'), details: { id } });
      return false;
    }
  };

  return { entries, loading, addEntry, updateEntry, deleteEntry, refetch };
};
