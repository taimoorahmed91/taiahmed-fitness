import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dumbbell, Utensils, CalendarOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface StatsCardsProps {
  todayCalories: number;
  weeklyWorkouts: number;
  totalMeals: number;
  calorieGoal?: number;
}

export const StatsCards = ({
  weeklyWorkouts,
  totalMeals,
}: StatsCardsProps) => {
  const [workoutStatus, setWorkoutStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('fittrack_daily_summary')
          .select('workout_status')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();

        if (error) throw error;
        
        setWorkoutStatus(data?.workout_status || 'yes');
      } catch (error) {
        console.error('Error fetching workout status:', error);
        setWorkoutStatus('yes');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const isWorkoutDay = workoutStatus === 'yes';

  const stats = [
    {
      label: 'Workout',
      value: loading ? '...' : (isWorkoutDay ? 'Today is a workout day' : 'Today is not a workout day'),
      icon: isWorkoutDay ? Dumbbell : CalendarOff,
      subtitle: isWorkoutDay ? 'Get moving!' : 'Rest day',
      isText: true,
      muted: !isWorkoutDay,
    },
    {
      label: 'Weekly Workouts',
      value: weeklyWorkouts,
      icon: Dumbbell,
      subtitle: 'This week',
    },
    {
      label: 'Total Meals Logged',
      value: totalMeals,
      icon: Utensils,
      subtitle: 'All time',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className={`${stat.isText ? 'text-sm font-medium mt-2' : 'text-2xl font-bold mt-1'} ${stat.muted ? 'text-muted-foreground' : ''}`}>
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
              </div>
              <div className={`p-2 rounded-lg ${stat.muted ? 'bg-muted' : 'bg-primary/10'}`}>
                <stat.icon className={`h-5 w-5 ${stat.muted ? 'text-muted-foreground' : 'text-primary'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
