import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { useSharedTable } from '@/lib/sharedTable';
import { byDateCreatedDesc, upsertSorted, removeById } from '@/lib/sharedData';

export interface ExtraActivity {
  id: string;
  user_id: string;
  date: string;
  time: string | null;
  activity: string;
  intensity: number;
  calories: number;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewExtraActivity = {
  date: string;
  time?: string | null;
  activity: string;
  intensity: number;
  calories?: number;
  duration_minutes?: number | null;
  notes?: string | null;
};

const fetchExtraActivities = async (userId: string): Promise<ExtraActivity[]> => {
  const { data, error } = await supabase
    .from('fittrack_extra_activities')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const useExtraActivities = () => {
  // One shared query per signed-in user: every component calling useExtraActivities reads the same rows.
  const { user, data: activities, loading, refetch, patch, invalidate } = useSharedTable<ExtraActivity>({
    table: 'extra_activities',
    fetchRows: fetchExtraActivities,
    errorMessage: 'Failed to load extra activities',
    errorToastKey: 'extras',
  });

  const addActivity = async (entry: NewExtraActivity) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('fittrack_extra_activities')
        .insert({
          user_id: user.id,
          date: entry.date,
          time: entry.time ?? null,
          activity: entry.activity,
          intensity: entry.intensity,
          calories: entry.calories ?? 0,
          duration_minutes: entry.duration_minutes ?? null,
          notes: entry.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      patch((prev) => upsertSorted(prev, data, byDateCreatedDesc), user.id);
      toast.success('Activity logged', { description: 'Extra activity has been saved.' });
      logActivity({ action: 'create', category: 'extra_activities', details: entry });
    } catch (error) {
      console.error('Error adding extra activity:', error);
      toast.error('Failed to save activity');
    }
  };

  const updateActivity = async (id: string, entry: NewExtraActivity) => {
    try {
      const { data, error } = await supabase
        .from('fittrack_extra_activities')
        .update({
          date: entry.date,
          time: entry.time ?? null,
          activity: entry.activity,
          intensity: entry.intensity,
          calories: entry.calories ?? 0,
          duration_minutes: entry.duration_minutes ?? null,
          notes: entry.notes ?? null,
        })
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) {
        patch((prev) => upsertSorted(prev, data, byDateCreatedDesc));
      } else {
        await invalidate();
      }
      toast.success('Activity updated');
      logActivity({ action: 'update', category: 'extra_activities', details: { id, ...entry } });
    } catch (error) {
      console.error('Error updating extra activity:', error);
      toast.error('Failed to update activity');
    }
  };

  const deleteActivity = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_extra_activities').delete().eq('id', id);
      if (error) throw error;
      patch((prev) => removeById(prev, id));
      toast.success('Activity deleted');
      logActivity({ action: 'delete', category: 'extra_activities', details: { id } });
    } catch (error) {
      console.error('Error deleting extra activity:', error);
      toast.error('Failed to delete activity');
    }
  };

  return { activities, loading, addActivity, updateActivity, deleteActivity, refetch };
};
