import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/hooks/useActivityLog';

export interface ExtraActivity {
  id: string;
  user_id: string;
  date: string;
  activity: string;
  intensity: number;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewExtraActivity = {
  date: string;
  activity: string;
  intensity: number;
  duration_minutes?: number | null;
  notes?: string | null;
};

export const useExtraActivities = () => {
  const [activities, setActivities] = useState<ExtraActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { toast } = useToast();

  const fetchActivities = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('fittrack_extra_activities')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setActivities((data as ExtraActivity[]) || []);
    } catch (error: any) {
      console.error('Error fetching extra activities:', error);
      toast({ title: 'Error', description: 'Failed to load extra activities', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [user]);

  const addActivity = async (entry: NewExtraActivity) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('fittrack_extra_activities').insert({
        user_id: user.id,
        date: entry.date,
        activity: entry.activity,
        intensity: entry.intensity,
        duration_minutes: entry.duration_minutes ?? null,
        notes: entry.notes ?? null,
      });
      if (error) throw error;
      toast({ title: 'Activity logged', description: 'Extra activity has been saved.' });
      logActivity({ action: 'create', category: 'extra_activities', details: entry });
      fetchActivities();
    } catch (error: any) {
      console.error('Error adding extra activity:', error);
      toast({ title: 'Error', description: 'Failed to save activity', variant: 'destructive' });
    }
  };

  const deleteActivity = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_extra_activities').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Activity deleted' });
      logActivity({ action: 'delete', category: 'extra_activities', details: { id } });
      fetchActivities();
    } catch (error: any) {
      console.error('Error deleting extra activity:', error);
      toast({ title: 'Error', description: 'Failed to delete activity', variant: 'destructive' });
    }
  };

  return { activities, loading, addActivity, deleteActivity, refetch: fetchActivities };
};
