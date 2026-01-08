import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';

export interface WeightEntry {
  id: string;
  weight: number;
  date: string;
  notes?: string;
}

export const useWeight = () => {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  const fetchEntries = async () => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('fittrack_weight')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setEntries(data?.map(e => ({
        id: e.id,
        weight: Number(e.weight),
        date: e.date,
        notes: e.notes || undefined,
      })) || []);
    } catch (error) {
      console.error('Error fetching weight entries:', error);
      toast.error('Failed to load weight entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [user]);

  const addEntry = async (entry: Omit<WeightEntry, 'id'>) => {
    if (!user) {
      toast.error('Please log in to add weight entries');
      return;
    }

    try {
      const { error } = await supabase.from('fittrack_weight').insert({
        user_id: user.id,
        weight: entry.weight,
        date: entry.date,
        notes: entry.notes,
      });

      if (error) throw error;
      toast.success('Weight entry added!');
      fetchEntries();
    } catch (error) {
      console.error('Error adding weight entry:', error);
      toast.error('Failed to add weight entry');
    }
  };

  const updateEntry = async (id: string, entry: Omit<WeightEntry, 'id'>) => {
    try {
      const { error } = await supabase
        .from('fittrack_weight')
        .update({
          weight: entry.weight,
          date: entry.date,
          notes: entry.notes,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Weight entry updated!');
      fetchEntries();
    } catch (error) {
      console.error('Error updating weight entry:', error);
      toast.error('Failed to update weight entry');
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_weight').delete().eq('id', id);
      if (error) throw error;
      toast.success('Weight entry deleted!');
      fetchEntries();
    } catch (error) {
      console.error('Error deleting weight entry:', error);
      toast.error('Failed to delete weight entry');
    }
  };

  return { entries, loading, addEntry, updateEntry, deleteEntry, refetch: fetchEntries };
};
