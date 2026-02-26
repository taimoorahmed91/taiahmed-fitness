import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';

export interface WaistEntry {
  id: string;
  waist: number;
  date: string;
  notes?: string;
}

export const useWaist = () => {
  const [entries, setEntries] = useState<WaistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  const fetchEntries = async () => {
    if (!user) { setEntries([]); setLoading(false); return; }
    try {
      const { data, error } = await supabase.from('fittrack_waist').select('*').eq('user_id', user.id).order('date', { ascending: false });
      if (error) throw error;
      setEntries(data?.map(e => ({ id: e.id, waist: Number(e.waist), date: e.date, notes: e.notes || undefined })) || []);
    } catch (error) {
      console.error('Error fetching waist entries:', error);
      toast.error('Failed to load waist entries');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(); }, [user]);

  const addEntry = async (entry: Omit<WaistEntry, 'id'>) => {
    if (!user) { toast.error('Please log in to add waist entries'); return; }
    try {
      const { error } = await supabase.from('fittrack_waist').insert({ user_id: user.id, waist: entry.waist, date: entry.date, notes: entry.notes });
      if (error) throw error;
      toast.success('Waist entry added!');
      logActivity({ action: 'create', category: 'waist', details: { waist: entry.waist, date: entry.date, notes: entry.notes } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error adding waist entry:', error);
      toast.error('Failed to add waist entry');
      logActivity({ action: 'create', category: 'waist', status: 'error', error_message: error?.message || 'Failed', details: { waist: entry.waist, date: entry.date } });
    }
  };

  const updateEntry = async (id: string, entry: Omit<WaistEntry, 'id'>) => {
    try {
      const { error } = await supabase.from('fittrack_waist').update({ waist: entry.waist, date: entry.date, notes: entry.notes }).eq('id', id);
      if (error) throw error;
      toast.success('Waist entry updated!');
      logActivity({ action: 'update', category: 'waist', details: { id, waist: entry.waist, date: entry.date, notes: entry.notes } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error updating waist entry:', error);
      toast.error('Failed to update waist entry');
      logActivity({ action: 'update', category: 'waist', status: 'error', error_message: error?.message || 'Failed', details: { id } });
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_waist').delete().eq('id', id);
      if (error) throw error;
      toast.success('Waist entry deleted!');
      logActivity({ action: 'delete', category: 'waist', details: { id } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error deleting waist entry:', error);
      toast.error('Failed to delete waist entry');
      logActivity({ action: 'delete', category: 'waist', status: 'error', error_message: error?.message || 'Failed', details: { id } });
    }
  };

  return { entries, loading, addEntry, updateEntry, deleteEntry, refetch: fetchEntries };
};
