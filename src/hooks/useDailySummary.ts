import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DailySummary {
  id: string;
  user_id: string;
  date: string;
  calories_consumed: number;
  calories_remaining: number;
  calorie_goal: number;
  workout_status: string;
}

export const useDailySummary = () => {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSummary = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSummary(null);
        setLoading(false);
        return;
      }

      // Call the database function to get or create today's summary
      const { data, error } = await supabase.rpc('get_or_create_daily_summary', {
        p_user_id: user.id
      });

      if (error) throw error;

      setSummary(data as DailySummary);
    } catch (error) {
      console.error('Error fetching daily summary:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch daily summary',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSummary();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchSummary();
    });

    return () => subscription.unsubscribe();
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
};
