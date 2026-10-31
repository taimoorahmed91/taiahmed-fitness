import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { useSharedTable } from '@/lib/sharedTable';
import { byDateDesc, upsertSorted, removeById, errorText } from '@/lib/sharedData';

export interface WeightEntry {
  id: string;
  weight: number;
  date: string;
  notes?: string;
}

const mapEntry = (e: Tables<'fittrack_weight'>): WeightEntry => ({
  id: e.id,
  weight: Number(e.weight),
  date: e.date,
  notes: e.notes || undefined,
});

const fetchWeightEntries = async (userId: string): Promise<WeightEntry[]> => {
  const { data, error } = await supabase
    .from('fittrack_weight')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapEntry);
};

export const useWeight = () => {
  // One shared query per signed-in user: every component calling useWeight reads the same entries.
  const { user, data: entries, loading, refetch, patch, invalidate } = useSharedTable<WeightEntry>({
    table: 'weight',
    fetchRows: fetchWeightEntries,
    errorMessage: 'Failed to load weight entries',
  });

  /**
   * Mutation contract (shared by every add / update / delete in this hook):
   * resolves `true` ONLY when the database confirmed the change by returning the affected row, and `false` for
   * anything else (no signed-in user, a database error, or zero rows affected, e.g. the row is gone or row-level
   * security refused it). It never rejects and a toast has already explained a failure, so a caller only has to
   * keep its draft on screen when it gets `false`. After a zero-row update/delete the list is refetched so the
   * screen matches the server.
   */
  const addEntry = async (entry: Omit<WeightEntry, 'id'>): Promise<boolean> => {
    if (!user) {
      toast.error('Please log in to add weight entries');
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('fittrack_weight')
        .insert({
          user_id: user.id,
          weight: entry.weight,
          date: entry.date,
          notes: entry.notes,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No row returned');
      const saved = mapEntry(data);
      patch((prev) => upsertSorted(prev, saved, byDateDesc), user.id);
      toast.success('Weight entry added!');
      logActivity({ action: 'create', category: 'weight', details: { weight: entry.weight, date: entry.date, notes: entry.notes } });
      return true;
    } catch (error) {
      console.error('Error adding weight entry:', error);
      toast.error('Failed to add weight entry');
      logActivity({ action: 'create', category: 'weight', status: 'error', error_message: errorText(error, 'Failed to add weight entry'), details: { weight: entry.weight, date: entry.date } });
      return false;
    }
  };

  const updateEntry = async (id: string, entry: Omit<WeightEntry, 'id'>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('fittrack_weight')
        .update({
          weight: entry.weight,
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
        toast.error('Could not update this weight entry. It may have been removed, or this account cannot change it.');
        logActivity({ action: 'update', category: 'weight', status: 'error', error_message: 'No row updated', details: { id } });
        return false;
      }
      const saved = mapEntry(data);
      patch((prev) => upsertSorted(prev, saved, byDateDesc));
      toast.success('Weight entry updated!');
      logActivity({ action: 'update', category: 'weight', details: { id, weight: entry.weight, date: entry.date, notes: entry.notes } });
      return true;
    } catch (error) {
      console.error('Error updating weight entry:', error);
      toast.error('Failed to update weight entry');
      logActivity({ action: 'update', category: 'weight', status: 'error', error_message: errorText(error, 'Failed to update weight entry'), details: { id } });
      return false;
    }
  };

  /** Resolves `true` only when a row was really deleted. */
  const deleteEntry = async (id: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('fittrack_weight').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        void invalidate();
        toast.error('Could not delete this weight entry. It may already be gone, or this account cannot delete it.');
        logActivity({ action: 'delete', category: 'weight', status: 'error', error_message: 'No row deleted', details: { id } });
        return false;
      }
      patch((prev) => removeById(prev, id));
      toast.success('Weight entry deleted!');
      logActivity({ action: 'delete', category: 'weight', details: { id } });
      return true;
    } catch (error) {
      console.error('Error deleting weight entry:', error);
      toast.error('Failed to delete weight entry');
      logActivity({ action: 'delete', category: 'weight', status: 'error', error_message: errorText(error, 'Failed to delete weight entry'), details: { id } });
      return false;
    }
  };

  return { entries, loading, addEntry, updateEntry, deleteEntry, refetch };
};
