import { useState, useEffect } from 'react';
import { GymSession } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useGymSessions = () => {
  const [sessions, setSessions] = useState<GymSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSessions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSessions([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('fittrack_gym_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;

      const formattedSessions: GymSession[] = (data || []).map((session) => ({
        id: session.id,
        exercise: session.exercise,
        duration: session.duration,
        date: session.date,
        notes: session.notes || undefined,
        start_time: session.start_time || undefined,
      }));

      setSessions(formattedSessions);
    } catch (error) {
      console.error('Error fetching gym sessions:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch gym sessions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchSessions();
    });

    return () => subscription.unsubscribe();
  }, []);

  const addSession = async (session: Omit<GymSession, 'id'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to add sessions',
          variant: 'destructive',
        });
        return;
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
        })
        .select()
        .single();

      if (error) throw error;

      const newSession: GymSession = {
        id: data.id,
        exercise: data.exercise,
        duration: data.duration,
        date: data.date,
        notes: data.notes || undefined,
        start_time: data.start_time || undefined,
      };

      setSessions((prev) => [newSession, ...prev]);
    } catch (error) {
      console.error('Error adding gym session:', error);
      toast({
        title: 'Error',
        description: 'Failed to add gym session',
        variant: 'destructive',
      });
    }
  };

  const updateSession = async (id: string, updates: Partial<Omit<GymSession, 'id'>>) => {
    try {
      const { error } = await supabase
        .from('fittrack_gym_sessions')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setSessions((prev) =>
        prev.map((session) => (session.id === id ? { ...session, ...updates } : session))
      );

      toast({
        title: 'Success',
        description: 'Workout updated successfully',
      });
    } catch (error) {
      console.error('Error updating gym session:', error);
      toast({
        title: 'Error',
        description: 'Failed to update gym session',
        variant: 'destructive',
      });
    }
  };

  const deleteSession = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fittrack_gym_sessions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSessions((prev) => prev.filter((session) => session.id !== id));
    } catch (error) {
      console.error('Error deleting gym session:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete gym session',
        variant: 'destructive',
      });
    }
  };

  const getThisWeekSessions = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);

    return sessions.filter((session) => {
      const sessionDate = new Date(session.date);
      return sessionDate >= weekStart;
    });
  };

  const getWeeklyWorkoutData = () => {
    const days: { date: string; duration: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayDuration = sessions
        .filter((session) => session.date === dateStr)
        .reduce((sum, session) => sum + session.duration, 0);
      days.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        duration: dayDuration,
      });
    }
    return days;
  };

  return { sessions, loading, addSession, updateSession, deleteSession, getThisWeekSessions, getWeeklyWorkoutData, refetch: fetchSessions };
};
