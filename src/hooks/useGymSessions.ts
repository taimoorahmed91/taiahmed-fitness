import { GymSession } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { getSessionUser } from '@/lib/authSession';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import { useSharedTable } from '@/lib/sharedTable';
import { byDateDesc, upsertSorted, removeById, errorText } from '@/lib/sharedData';

const mapSession = (session: Tables<'fittrack_gym_sessions'>): GymSession => ({
  id: session.id,
  exercise: session.exercise,
  duration: session.duration,
  date: session.date,
  notes: session.notes || undefined,
  start_time: session.start_time || undefined,
  end_time: session.end_time || undefined,
});

const fetchAllSessions = async (userId: string): Promise<GymSession[]> => {
  const { data, error } = await supabase
    .from('fittrack_gym_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapSession);
};

export const useGymSessions = () => {
  // One shared query per signed-in user: Dashboard, Gym, Calendar, reports... all read the same sessions.
  const { data: sessions, loading, refetch, patch, invalidate } = useSharedTable<GymSession>({
    table: 'gym_sessions',
    fetchRows: fetchAllSessions,
    errorMessage: 'Failed to fetch gym sessions',
    errorToastKey: 'gym',
  });

  /**
   * Saves a finished workout. Rejects on any failure (never resolves quietly).
   * `expectedUserId`: the account the workout was recorded for. If a different account is signed in by now
   * (another tab, a switched account) nothing is saved, so one person's workout never lands in another's log.
   */
  const addSession = async (session: Omit<GymSession, 'id'>, options: { expectedUserId?: string | null } = {}) => {
    const user = await getSessionUser();
    if (!user) {
      toast.error('You must be logged in to add sessions');
      throw new Error('Not logged in');
    }
    if (options.expectedUserId && options.expectedUserId !== user.id) {
      toast.error('A different account is signed in now. Your workout was not saved; it stays on this device for the account that recorded it.');
      throw new Error('Signed-in account changed');
    }

    const { data, error } = await supabase
      .from('fittrack_gym_sessions')
      .insert({
        user_id: user.id,
        exercise: session.exercise,
        duration: session.duration,
        date: session.date,
        notes: session.notes || null,
        start_time: session.start_time || null,
        end_time: session.end_time || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add gym session');
      logActivity({ action: 'create', category: 'gym', status: 'error', error_message: error.message, details: { exercise: session.exercise, duration: session.duration, date: session.date } });
      throw error;
    }

    const newSession = mapSession(data);
    patch((prev) => upsertSorted(prev, newSession, byDateDesc), user.id);
    logActivity({ action: 'create', category: 'gym', details: { exercise: session.exercise, duration: session.duration, date: session.date, notes: session.notes, start_time: session.start_time } });
  };

  /** Resolves `true` only when the server confirmed the change; `false` (never a silent success) otherwise. */
  const updateSession = async (id: string, updates: Partial<Omit<GymSession, 'id'>>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('fittrack_gym_sessions')
        .update(updates as TablesUpdate<'fittrack_gym_sessions'>)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // No row came back: it no longer exists or this account may not change it (e.g. the read-only demo).
        // That is not a success. Refresh so the list matches the server.
        void invalidate();
        toast.error('Could not update this workout. It may have been removed, or this account cannot change it.');
        logActivity({ action: 'update', category: 'gym', status: 'error', error_message: 'No row updated', details: { id } });
        return false;
      }
      patch((prev) => upsertSorted(prev, mapSession(data), byDateDesc));
      toast.success('Workout updated successfully');
      logActivity({ action: 'update', category: 'gym', details: { id, ...updates } });
      return true;
    } catch (error) {
      console.error('Error updating gym session:', error);
      toast.error('Failed to update gym session');
      logActivity({ action: 'update', category: 'gym', status: 'error', error_message: errorText(error, 'Failed'), details: { id } });
      return false;
    }
  };

  /** Resolves `true` only when a row was really deleted. */
  const deleteSession = async (id: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('fittrack_gym_sessions').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        void invalidate();
        toast.error('Could not delete this workout. It may already be gone, or this account cannot delete it.');
        logActivity({ action: 'delete', category: 'gym', status: 'error', error_message: 'No row deleted', details: { id } });
        return false;
      }
      patch((prev) => removeById(prev, id));
      logActivity({ action: 'delete', category: 'gym', details: { id } });
      return true;
    } catch (error) {
      console.error('Error deleting gym session:', error);
      toast.error('Failed to delete gym session');
      logActivity({ action: 'delete', category: 'gym', status: 'error', error_message: errorText(error, 'Failed'), details: { id } });
      return false;
    }
  };

  const getThisWeekSessions = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return sessions.filter((session) => new Date(session.date) >= weekStart);
  };

  const getWeeklyWorkoutData = () => {
    const days: { date: string; duration: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayDuration = sessions.filter((s) => s.date === dateStr).reduce((sum, s) => sum + s.duration, 0);
      days.push({ date: date.toLocaleDateString('en-US', { weekday: 'short' }), duration: dayDuration });
    }
    return days;
  };

  const getLastSessionByTemplateName = async (templateName: string): Promise<GymSession | null> => {
    try {
      const user = await getSessionUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('fittrack_gym_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('exercise', templateName)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      return mapSession(data);
    } catch (error) {
      console.error('Error fetching last session:', error);
      return null;
    }
  };

  return { sessions, loading, addSession, updateSession, deleteSession, getThisWeekSessions, getWeeklyWorkoutData, getLastSessionByTemplateName, refetch };
};
