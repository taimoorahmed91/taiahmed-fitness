import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';

export interface SleepEntry {
  id: string;
  hours: number;
  date: string;
  notes?: string;
}

export const useSleep = () => {
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  const fetchEntries = async () => {
    if (!user) { setEntries([]); setLoading(false); return; }
    try {
      const { data, error } = await supabase.from('fittrack_sleep').select('*').eq('user_id', user.id).order('date', { ascending: false });
      if (error) throw error;
      setEntries(data?.map(e => ({ id: e.id, hours: Number(e.hours), date: e.date, notes: e.notes || undefined })) || []);
    } catch (error) {
      console.error('Error fetching sleep entries:', error);
      toast.error('Failed to load sleep entries');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(); }, [user]);

  const addEntry = async (entry: Omit<SleepEntry, 'id'>) => {
    if (!user) { toast.error('Please log in to add sleep entries'); return; }
    try {
      const { error } = await supabase.from('fittrack_sleep').insert({ user_id: user.id, hours: entry.hours, date: entry.date, notes: entry.notes });
      if (error) throw error;
      toast.success('Sleep entry added!');
      logActivity({ action: 'create', category: 'sleep', details: { hours: entry.hours, date: entry.date, notes: entry.notes } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error adding sleep entry:', error);
      toast.error('Failed to add sleep entry');
      logActivity({ action: 'create', category: 'sleep', status: 'error', error_message: error?.message || 'Failed', details: { hours: entry.hours, date: entry.date } });
    }
  };

  const updateEntry = async (id: string, entry: Omit<SleepEntry, 'id'>) => {
    try {
      const { error } = await supabase.from('fittrack_sleep').update({ hours: entry.hours, date: entry.date, notes: entry.notes }).eq('id', id);
      if (error) throw error;
      toast.success('Sleep entry updated!');
      logActivity({ action: 'update', category: 'sleep', details: { id, hours: entry.hours, date: entry.date, notes: entry.notes } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error updating sleep entry:', error);
      toast.error('Failed to update sleep entry');
      logActivity({ action: 'update', category: 'sleep', status: 'error', error_message: error?.message || 'Failed', details: { id } });
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_sleep').delete().eq('id', id);
      if (error) throw error;
      toast.success('Sleep entry deleted!');
      logActivity({ action: 'delete', category: 'sleep', details: { id } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error deleting sleep entry:', error);
      toast.error('Failed to delete sleep entry');
      logActivity({ action: 'delete', category: 'sleep', status: 'error', error_message: error?.message || 'Failed', details: { id } });
    }
  };

  return { entries, loading, addEntry, updateEntry, deleteEntry, refetch: fetchEntries };
};
