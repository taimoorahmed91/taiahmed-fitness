 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 
 export interface WeeklyAchievement {
   week_start: string;
   week_end: string;
   category: 'calories' | 'workouts' | 'sleep';
   target_value: number;
   achieved_value: number;
   percentage: number;
   met: boolean;
 }
 
 export interface Badge {
   id: string;
   name: string;
   description: string;
   icon: string;
   earned: boolean;
   earnedDate?: string;
   category: 'streak' | 'milestone' | 'consistency';
 }
 
 export interface GoalStats {
   totalGoalsSet: number;
   goalsMetCount: number;
   currentStreak: number;
   longestStreak: number;
   weeklyHistory: WeeklyAchievement[];
   badges: Badge[];
 }
 
 // Helper to get the Monday of a given date
 const getWeekMonday = (date: Date): Date => {
   const d = new Date(date);
   const dayOfWeek = d.getDay();
   const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
   d.setDate(d.getDate() - daysToMonday);
   d.setHours(0, 0, 0, 0);
   return d;
 };
 
 export const useGoalAchievements = () => {
   const [stats, setStats] = useState<GoalStats>({
     totalGoalsSet: 0,
     goalsMetCount: 0,
     currentStreak: 0,
     longestStreak: 0,
     weeklyHistory: [],
     badges: []
   });
   const [loading, setLoading] = useState(true);
 
   const calculateBadges = (goalsMetCount: number, currentStreak: number, longestStreak: number): Badge[] => {
     const badges: Badge[] = [
       {
         id: 'first-goal',
         name: 'First Goal Met',
         description: 'Complete your first weekly goal',
         icon: 'trophy',
         earned: goalsMetCount >= 1,
         category: 'milestone'
       },
       {
         id: 'five-goals',
         name: 'Goal Crusher',
         description: 'Complete 5 weekly goals',
         icon: 'medal',
         earned: goalsMetCount >= 5,
         category: 'milestone'
       },
       {
         id: 'ten-goals',
         name: 'Dedicated',
         description: 'Complete 10 weekly goals',
         icon: 'star',
         earned: goalsMetCount >= 10,
         category: 'milestone'
       },
       {
         id: 'twenty-goals',
         name: 'Unstoppable',
         description: 'Complete 20 weekly goals',
         icon: 'crown',
         earned: goalsMetCount >= 20,
         category: 'milestone'
       },
       {
         id: 'streak-2',
         name: 'On a Roll',
         description: 'Meet goals 2 weeks in a row',
         icon: 'flame',
         earned: longestStreak >= 2,
         category: 'streak'
       },
       {
         id: 'streak-4',
         name: 'Hot Streak',
         description: 'Meet goals 4 weeks in a row',
         icon: 'zap',
         earned: longestStreak >= 4,
         category: 'streak'
       },
       {
         id: 'streak-8',
         name: 'On Fire',
         description: 'Meet goals 8 weeks in a row',
         icon: 'rocket',
         earned: longestStreak >= 8,
         category: 'streak'
       },
       {
         id: 'streak-12',
         name: 'Legend',
         description: 'Meet goals 12 weeks in a row',
         icon: 'award',
         earned: longestStreak >= 12,
         category: 'streak'
       },
     ];
     return badges;
   };
 
   const fetchAchievements = useCallback(async () => {
     try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) {
         setLoading(false);
         return;
       }
 
       // Get all goals (including past ones)
       const { data: allGoals } = await supabase
         .from('fittrack_goals')
         .select('*')
         .eq('user_id', user.id)
         .eq('goal_type', 'weekly')
         .order('start_date', { ascending: false });
 
       const goals = allGoals || [];
       const totalGoalsSet = goals.length;
 
       // Calculate weekly history for past 12 weeks
       const weeklyHistory: WeeklyAchievement[] = [];
       const today = new Date();
       
       // Get unique weeks from goals
       const processedWeeks = new Set<string>();
 
       for (const goal of goals) {
         const weekStart = getWeekMonday(new Date(goal.start_date));
         const weekKey = weekStart.toISOString().split('T')[0];
         
         // Skip if we already processed this week for this category
         const uniqueKey = `${weekKey}-${goal.category}`;
         if (processedWeeks.has(uniqueKey)) continue;
         processedWeeks.add(uniqueKey);
 
         // Skip future weeks
         if (weekStart > today) continue;
 
         const weekEnd = new Date(weekStart);
         weekEnd.setDate(weekStart.getDate() + 6);
         const weekEndStr = weekEnd.toISOString().split('T')[0];
 
         let achievedValue = 0;
 
         if (goal.category === 'calories') {
           const { data: meals } = await supabase
             .from('fittrack_meals')
             .select('calories')
             .eq('user_id', user.id)
             .gte('date', weekKey)
             .lte('date', weekEndStr);
           achievedValue = (meals || []).reduce((sum, m) => sum + m.calories, 0);
         } else if (goal.category === 'workouts') {
           const { count } = await supabase
             .from('fittrack_gym_sessions')
             .select('*', { count: 'exact', head: true })
             .eq('user_id', user.id)
             .gte('date', weekKey)
             .lte('date', weekEndStr);
           achievedValue = count || 0;
         } else if (goal.category === 'sleep') {
           const { data: sleepData } = await supabase
             .from('fittrack_sleep')
             .select('hours')
             .eq('user_id', user.id)
             .gte('date', weekKey)
             .lte('date', weekEndStr);
           achievedValue = (sleepData || []).reduce((sum, s) => sum + Number(s.hours), 0);
         }
 
         const percentage = Math.min(100, Math.round((achievedValue / goal.target_value) * 100));
         const met = percentage >= 100;
 
         weeklyHistory.push({
           week_start: weekKey,
           week_end: weekEndStr,
           category: goal.category as 'calories' | 'workouts' | 'sleep',
           target_value: goal.target_value,
           achieved_value: achievedValue,
           percentage,
           met
         });
       }
 
       // Sort by week start (most recent first)
       weeklyHistory.sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
 
       // Calculate goals met count
       const goalsMetCount = weeklyHistory.filter(w => w.met).length;
 
       // Calculate streaks (by week, considering any goal met in a week as streak)
       const weeksMet = new Set<string>();
       weeklyHistory.forEach(w => {
         if (w.met) weeksMet.add(w.week_start);
       });
 
       const sortedWeeks = Array.from(weeksMet).sort((a, b) => 
         new Date(b).getTime() - new Date(a).getTime()
       );
 
       // Current streak (consecutive weeks from now)
       let currentStreak = 0;
       const currentWeekStart = getWeekMonday(today).toISOString().split('T')[0];
       let checkWeek = currentWeekStart;
       
       for (let i = 0; i < 52; i++) {
         if (weeksMet.has(checkWeek)) {
           currentStreak++;
           const prevWeek = new Date(checkWeek);
           prevWeek.setDate(prevWeek.getDate() - 7);
           checkWeek = prevWeek.toISOString().split('T')[0];
         } else {
           break;
         }
       }
 
       // Longest streak
       let longestStreak = 0;
       let tempStreak = 0;
       let prevWeekDate: Date | null = null;
 
       const ascendingWeeks = Array.from(weeksMet).sort((a, b) =>
         new Date(a).getTime() - new Date(b).getTime()
       );
 
       for (const weekStr of ascendingWeeks) {
         const weekDate = new Date(weekStr);
         if (prevWeekDate) {
           const diff = (weekDate.getTime() - prevWeekDate.getTime()) / (1000 * 60 * 60 * 24);
           if (diff === 7) {
             tempStreak++;
           } else {
             longestStreak = Math.max(longestStreak, tempStreak);
             tempStreak = 1;
           }
         } else {
           tempStreak = 1;
         }
         prevWeekDate = weekDate;
       }
       longestStreak = Math.max(longestStreak, tempStreak);
 
       const badges = calculateBadges(goalsMetCount, currentStreak, longestStreak);
 
       setStats({
         totalGoalsSet,
         goalsMetCount,
         currentStreak,
         longestStreak,
         weeklyHistory: weeklyHistory.slice(0, 12), // Last 12 entries
         badges
       });
     } catch (error) {
       console.error('Error fetching achievements:', error);
     } finally {
       setLoading(false);
     }
   }, []);
 
   useEffect(() => {
     fetchAchievements();
 
     const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
       fetchAchievements();
     });
 
     return () => subscription.unsubscribe();
   }, [fetchAchievements]);
 
   return { stats, loading, refetch: fetchAchievements };
 };