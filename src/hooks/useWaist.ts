import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { useSharedTable } from '@/lib/sharedTable';
import { byDateDesc, upsertSorted, removeById, errorText } from '@/lib/sharedData';

export interface WaistEntry {
  id: string;
  waist: number;
  date: string;
  notes?: string;
}

const mapEntry = (e: Tables<'fittrack_waist'>): WaistEntry => ({
  id: e.id,
  waist: Number(e.waist),
  date: e.date,
  notes: e.notes || undefined,
});

const fetchWaistEntries = async (userId: string): Promise<WaistEntry[]> => {
  const { data, error } = await supabase
    .from('fittrack_waist')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapEntry);
};

export const useWaist = () => {
  // One shared query per signed-in user: every component calling useWaist reads the same entries.
  const { user, data: entries, loading, refetch, patch, invalidate } = useSharedTable<WaistEntry>({
    table: 'waist',
    fetchRows: fetchWaistEntries,
    errorMessage: 'Failed to load waist entries',
  });

  /**
   * Mutation contract (shared by every add / update / delete in this hook):
   * resolves `true` ONLY when the database confirmed the change by returning the affected row, and `false` for
   * anything else (no signed-in user, a database error, or zero rows affected, e.g. the row is gone or row-level
   * security refused it). It never rejects and a toast has already explained a failure, so a caller only has to
   * keep its draft on screen when it gets `false`. After a zero-row update/delete the list is refetched so the
   * screen matches the server.
   */
  const addEntry = async (entry: Omit<WaistEntry, 'id'>): Promise<boolean> => {
    if (!user) {
      toast.error('Please log in to add waist entries');
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('fittrack_waist')
        .insert({
          user_id: user.id,
          waist: entry.waist,
          date: entry.date,
          notes: entry.notes,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No row returned');
      const saved = mapEntry(data);
      patch((prev) => upsertSorted(prev, saved, byDateDesc), user.id);
      toast.success('Waist entry added!');
      logActivity({ action: 'create', category: 'waist', details: { waist: entry.waist, date: entry.date, notes: entry.notes } });
      return true;
    } catch (error) {
      console.error('Error adding waist entry:', error);
      toast.error('Failed to add waist entry');
      logActivity({ action: 'create', category: 'waist', status: 'error', error_message: errorText(error, 'Failed'), details: { waist: entry.waist, date: entry.date } });
      return false;
    }
  };

  const updateEntry = async (id: string, entry: Omit<WaistEntry, 'id'>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('fittrack_waist')
        .update({
          waist: entry.waist,
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
        toast.error('Could not update this waist entry. It may have been removed, or this account cannot change it.');
        logActivity({ action: 'update', category: 'waist', status: 'error', error_message: 'No row updated', details: { id } });
        return false;
      }
      const saved = mapEntry(data);
      patch((prev) => upsertSorted(prev, saved, byDateDesc));
      toast.success('Waist entry updated!');
      logActivity({ action: 'update', category: 'waist', details: { id, waist: entry.waist, date: entry.date, notes: entry.notes } });
      return true;
    } catch (error) {
      console.error('Error updating waist entry:', error);
      toast.error('Failed to update waist entry');
      logActivity({ action: 'update', category: 'waist', status: 'error', error_message: errorText(error, 'Failed'), details: { id } });
      return false;
    }
  };

  /** Resolves `true` only when a row was really deleted. */
  const deleteEntry = async (id: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('fittrack_waist').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        void invalidate();
        toast.error('Could not delete this waist entry. It may already be gone, or this account cannot delete it.');
        logActivity({ action: 'delete', category: 'waist', status: 'error', error_message: 'No row deleted', details: { id } });
        return false;
      }
      patch((prev) => removeById(prev, id));
      toast.success('Waist entry deleted!');
      logActivity({ action: 'delete', category: 'waist', details: { id } });
      return true;
    } catch (error) {
      console.error('Error deleting waist entry:', error);
      toast.error('Failed to delete waist entry');
      logActivity({ action: 'delete', category: 'waist', status: 'error', error_message: errorText(error, 'Failed'), details: { id } });
      return false;
    }
  };

  return { entries, loading, addEntry, updateEntry, deleteEntry, refetch };
};
