import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Goal {
  id: string;
  user_id: string;
  goal_type: 'weekly' | 'monthly';
  category: 'calories' | 'workouts' | 'sleep';
  target_value: number;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface GoalProgress {
  goal: Goal;
  current_value: number;
  percentage: number;
}

export const useGoals = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsProgress, setGoalsProgress] = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchGoals = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setGoals([]);
        setGoalsProgress([]);
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      
      // Fetch active goals
      const { data, error } = await supabase
        .from('fittrack_goals')
        .select('*')
        .eq('user_id', user.id)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedGoals = (data || []) as Goal[];
      setGoals(typedGoals);

      // Calculate progress for each goal
      const progressList: GoalProgress[] = [];
      
      for (const goal of typedGoals) {
        let currentValue = 0;
        
        if (goal.category === 'calories') {
          const { data: meals } = await supabase
            .from('fittrack_meals')
            .select('calories')
            .eq('user_id', user.id)
            .gte('date', goal.start_date)
            .lte('date', goal.end_date);
          
          currentValue = (meals || []).reduce((sum, m) => sum + m.calories, 0);
        } else if (goal.category === 'workouts') {
          const { count } = await supabase
            .from('fittrack_gym_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date', goal.start_date)
            .lte('date', goal.end_date);
          
          currentValue = count || 0;
        } else if (goal.category === 'sleep') {
          const { data: sleepData } = await supabase
            .from('fittrack_sleep')
            .select('hours')
            .eq('user_id', user.id)
            .gte('date', goal.start_date)
            .lte('date', goal.end_date);
          
          currentValue = (sleepData || []).reduce((sum, s) => sum + Number(s.hours), 0);
        }

        progressList.push({
          goal,
          current_value: currentValue,
          percentage: Math.min(100, Math.round((currentValue / goal.target_value) * 100))
        });
      }

      setGoalsProgress(progressList);
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const addGoal = async (
    goalType: 'weekly' | 'monthly',
    category: 'calories' | 'workouts' | 'sleep',
    targetValue: number
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const today = new Date();
      let startDate: Date;
      let endDate: Date;

      if (goalType === 'weekly') {
        // Start from this week's Monday
        const dayOfWeek = today.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startDate = new Date(today);
        startDate.setDate(today.getDate() + diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
      } else {
        // Start from this month's first day
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      }

      const { error } = await supabase
        .from('fittrack_goals')
        .insert({
          user_id: user.id,
          goal_type: goalType,
          category,
          target_value: targetValue,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        });

      if (error) throw error;

      toast({
        title: 'Goal Created',
        description: `Your ${goalType} ${category} goal has been set!`,
      });

      fetchGoals();
    } catch (error) {
      console.error('Error adding goal:', error);
      toast({
        title: 'Error',
        description: 'Failed to create goal',
        variant: 'destructive',
      });
    }
  };

  const deleteGoal = async (goalId: string) => {
    try {
      const { error } = await supabase
        .from('fittrack_goals')
        .delete()
        .eq('id', goalId);

      if (error) throw error;

      toast({
        title: 'Goal Deleted',
        description: 'Goal has been removed',
      });

      fetchGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete goal',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchGoals();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchGoals();
    });

    return () => subscription.unsubscribe();
  }, [fetchGoals]);

  return { goals, goalsProgress, loading, addGoal, deleteGoal, refetch: fetchGoals };
};
