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
  achieved: boolean;
  days_passed: number; // includes today
  week_start_date: Date;
  current_period_start: Date;
  current_period_end: Date;
}

// Helper to get the Monday of the current week
const getCurrentWeekMonday = (): Date => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

// Helper to get the Sunday of the current week
const getCurrentWeekSunday = (): Date => {
  const monday = getCurrentWeekMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
};

// Helper to get the first day of the current month
const getCurrentMonthStart = (): Date => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
};

// Helper to get the last day of the current month
const getCurrentMonthEnd = (): Date => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
};

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

      const todayStr = new Date().toISOString().split('T')[0];
      const todayDate = new Date();
      
      // Fetch active goals
      const { data, error } = await supabase
        .from('fittrack_goals')
        .select('*')
        .eq('user_id', user.id)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedGoals = (data || []) as Goal[];
      setGoals(typedGoals);

      // Calculate progress for each goal
      const progressList: GoalProgress[] = [];
      
      for (const goal of typedGoals) {
        let currentValue = 0;
        
        // For weekly goals, always use the current week (Mon-Sun)
        // For monthly goals, use the goal's date range
        let queryStartDate = goal.start_date;
        let queryEndDate = goal.end_date;
        let currentPeriodStart = new Date(goal.start_date);
        let currentPeriodEnd = new Date(goal.end_date);
        
        if (goal.goal_type === 'weekly') {
          const weekMonday = getCurrentWeekMonday();
          const weekSunday = getCurrentWeekSunday();
          queryStartDate = weekMonday.toISOString().split('T')[0];
          queryEndDate = weekSunday.toISOString().split('T')[0];
          currentPeriodStart = weekMonday;
          currentPeriodEnd = weekSunday;
        } else if (goal.goal_type === 'monthly') {
          const monthStart = getCurrentMonthStart();
          const monthEnd = getCurrentMonthEnd();
          queryStartDate = monthStart.toISOString().split('T')[0];
          queryEndDate = monthEnd.toISOString().split('T')[0];
          currentPeriodStart = monthStart;
          currentPeriodEnd = monthEnd;
        }
        
        if (goal.category === 'calories') {
          const { data: meals } = await supabase
            .from('fittrack_meals')
            .select('calories')
            .eq('user_id', user.id)
            .gte('date', queryStartDate)
            .lte('date', queryEndDate);
          
          currentValue = (meals || []).reduce((sum, m) => sum + m.calories, 0);
        } else if (goal.category === 'workouts') {
          const { count } = await supabase
            .from('fittrack_gym_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date', queryStartDate)
            .lte('date', queryEndDate);
          
          currentValue = count || 0;
        } else if (goal.category === 'sleep') {
          const { data: sleepData } = await supabase
            .from('fittrack_sleep')
            .select('hours')
            .eq('user_id', user.id)
            .gte('date', queryStartDate)
            .lte('date', queryEndDate);
          
          currentValue = (sleepData || []).reduce((sum, s) => sum + Number(s.hours), 0);
        }

        // Calculate days passed for the current period
        let daysPassed = 1; // at least today
        if (goal.goal_type === 'weekly') {
          const weekStart = getCurrentWeekMonday();
          const diffTime = todayDate.getTime() - weekStart.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          daysPassed = Math.min(7, Math.max(1, diffDays + 1));
        } else if (goal.goal_type === 'monthly') {
          const monthStart = getCurrentMonthStart();
          const monthEnd = getCurrentMonthEnd();
          const totalDays = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const diffTime = todayDate.getTime() - monthStart.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          daysPassed = Math.min(totalDays, Math.max(1, diffDays + 1));
        }

        progressList.push({
          goal,
          current_value: currentValue,
          percentage: Math.min(100, Math.round((currentValue / goal.target_value) * 100)),
          achieved: (goal.category === 'calories' || goal.category === 'sleep')
            ? currentValue <= goal.target_value
            : currentValue >= goal.target_value,
          days_passed: daysPassed,
          week_start_date: getCurrentWeekMonday(),
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd
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
    targetValue: number,
    customStartDate?: Date,
    customEndDate?: Date
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let startDate: Date;
      let endDate: Date;

      if (customStartDate && customEndDate) {
        // Use custom dates provided by user
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        // Auto-calculate based on goal type (legacy behavior)
        const today = new Date();
        if (goalType === 'weekly') {
          const dayOfWeek = today.getDay();
          const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          startDate = new Date(today);
          startDate.setDate(today.getDate() - daysToMonday);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
        } else {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        }
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
