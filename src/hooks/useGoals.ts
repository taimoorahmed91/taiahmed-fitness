import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser, onAuthIdentityChange } from '@/lib/authSession';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';
import {
  INITIAL_SOURCE_STATUS, LOADED_SOURCE_STATUS, deriveSourceState, type SourceStatus,
} from '@/app/globalRefresh';
import { useRefreshSource } from '@/app/globalRefreshContext';

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
  days_passed: number;
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
  const [status, setStatus] = useState<SourceStatus>(INITIAL_SOURCE_STATUS);
  // Whose goals are on screen, so a failed load for someone else never keeps the previous person's goals.
  const ownerRef = useRef<string | null>(null);

  /** Loads goals and their progress. THROWS when any part failed (after recording it in `status`). */
  const loadGoals = async ({ isStale }: { isStale: () => boolean }): Promise<void> => {
    let userId: string | null = null;
    try {
      const user = await getSessionUser();
      if (isStale()) return;
      if (!user) {
        ownerRef.current = null;
        setGoals([]); setGoalsProgress([]); setStatus(LOADED_SOURCE_STATUS);
        return;
      }
      userId = user.id;

      const todayStr = new Date().toISOString().split('T')[0];
      const todayDate = new Date();
      
      const { data, error } = await supabase
        .from('fittrack_goals')
        .select('*')
        .eq('user_id', user.id)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (isStale()) return;

      const typedGoals = (data || []) as Goal[];

      const progressList: GoalProgress[] = [];
      
      for (const goal of typedGoals) {
        let currentValue = 0;
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
          const { data: meals, error: mealsError } = await supabase.from('fittrack_meals').select('calories').eq('user_id', user.id).gte('date', queryStartDate).lte('date', queryEndDate);
          if (mealsError) throw mealsError;
          currentValue = (meals || []).reduce((sum, m) => sum + m.calories, 0);
        } else if (goal.category === 'workouts') {
          const { count, error: countError } = await supabase.from('fittrack_gym_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('date', queryStartDate).lte('date', queryEndDate);
          if (countError) throw countError;
          currentValue = count || 0;
        } else if (goal.category === 'sleep') {
          const { data: sleepData, error: sleepError } = await supabase.from('fittrack_sleep').select('hours').eq('user_id', user.id).gte('date', queryStartDate).lte('date', queryEndDate);
          if (sleepError) throw sleepError;
          currentValue = (sleepData || []).reduce((sum, s) => sum + Number(s.hours), 0);
        }

        let daysPassed = 1;
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
          achieved: (goal.category === 'calories' || goal.category === 'sleep') ? currentValue <= goal.target_value : currentValue >= goal.target_value,
          days_passed: daysPassed,
          week_start_date: getCurrentWeekMonday(),
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd
        });
      }

      if (isStale()) return;
      // Goals and their progress are committed together, so a half-loaded answer never shows.
      ownerRef.current = user.id;
      setGoals(typedGoals);
      setGoalsProgress(progressList);
      setStatus(LOADED_SOURCE_STATUS);
    } catch (error) {
      console.error('Error fetching goals:', error);
      if (!isStale()) {
        if (userId && ownerRef.current !== userId) {
          ownerRef.current = null;
          setGoals([]); setGoalsProgress([]);
          setStatus({ loaded: false, failed: true, error });
        } else {
          setStatus((prev) => ({ loaded: prev.loaded, failed: true, error }));
        }
      }
      throw error;
    } finally { if (!isStale()) setLoading(false); }
  };

  const { refetch, restart } = useRefreshSource(loadGoals);

  const addGoal = async (
    goalType: 'weekly' | 'monthly',
    category: 'calories' | 'workouts' | 'sleep',
    targetValue: number,
    customStartDate?: Date,
    customEndDate?: Date
  ) => {
    try {
      const user = await getSessionUser();
      if (!user) throw new Error('Not authenticated');

      let startDate: Date;
      let endDate: Date;

      if (customStartDate && customEndDate) {
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
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

      const { error } = await supabase.from('fittrack_goals').insert({
        user_id: user.id,
        goal_type: goalType,
        category,
        target_value: targetValue,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      });

      if (error) throw error;

      toast.success('Goal Created', { description: `Your ${goalType} ${category} goal has been set!` });
      logActivity({ action: 'create', category: 'goals', details: { goal_type: goalType, goal_category: category, target_value: targetValue } });
      void restart();
    } catch (error: any) {
      console.error('Error adding goal:', error);
      toast.error('Failed to create goal');
      logActivity({ action: 'create', category: 'goals', status: 'error', error_message: error?.message || 'Failed', details: { goal_type: goalType, goal_category: category, target_value: targetValue } });
    }
  };

  const deleteGoal = async (goalId: string) => {
    try {
      const { error } = await supabase.from('fittrack_goals').delete().eq('id', goalId);
      if (error) throw error;
      toast.success('Goal Deleted', { description: 'Goal has been removed' });
      logActivity({ action: 'delete', category: 'goals', details: { id: goalId } });
      void restart();
    } catch (error: any) {
      console.error('Error deleting goal:', error);
      toast.error('Failed to delete goal');
      logActivity({ action: 'delete', category: 'goals', status: 'error', error_message: error?.message || 'Failed', details: { id: goalId } });
    }
  };

  useEffect(() => {
    void restart();
    const subscription = onAuthIdentityChange(() => { void restart(); });
    return () => subscription.unsubscribe();
  }, [restart]);

  const state = useMemo(() => deriveSourceState(status), [status]);

  return {
    goals, goalsProgress, loading, addGoal, deleteGoal, refetch,
    state, phase: state.phase, loadFailed: state.loadFailed, refreshFailed: state.refreshFailed, error: state.error,
  };
};
