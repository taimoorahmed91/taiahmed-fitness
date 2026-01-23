import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dumbbell, Utensils, CalendarOff, Scale } from 'lucide-react';
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
  const [weightDueToday, setWeightDueToday] = useState<boolean | null>(null);
  const [daysUntilWeight, setDaysUntilWeight] = useState<number>(0);
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
        
        // Fetch workout status
        const { data: summaryData, error: summaryError } = await supabase
          .from('fittrack_daily_summary')
          .select('workout_status')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();

        if (summaryError) throw summaryError;
        setWorkoutStatus(summaryData?.workout_status || 'yes');

        // Fetch weight measurement interval from settings
        const { data: settingsData } = await supabase
          .from('fittrack_user_settings')
          .select('weight_measurement_interval')
          .eq('user_id', user.id)
          .maybeSingle();

        const interval = settingsData?.weight_measurement_interval || 3;

        // Fetch last weight entry
        const { data: weightData } = await supabase
          .from('fittrack_weight')
          .select('date')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (weightData?.date) {
          const lastWeightDate = new Date(weightData.date);
          const todayDate = new Date(today);
          const diffDays = Math.floor((todayDate.getTime() - lastWeightDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays >= interval) {
            setWeightDueToday(true);
            setDaysUntilWeight(0);
          } else {
            setWeightDueToday(false);
            setDaysUntilWeight(interval - diffDays);
          }
        } else {
          // No weight entries yet, measurement is due
          setWeightDueToday(true);
          setDaysUntilWeight(0);
        }
      } catch (error) {
        console.error('Error fetching status:', error);
        setWorkoutStatus('yes');
        setWeightDueToday(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const isWorkoutDay = workoutStatus === 'yes';

  const stats = [
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
      {/* Combined Status Card */}
      <Card className="shadow-md">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Workout Status */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Workout</p>
                <p className={`text-sm font-medium mt-1 ${!isWorkoutDay ? 'text-muted-foreground' : ''}`}>
                  {loading ? '...' : (isWorkoutDay ? 'Today is a workout day' : 'Today is not a workout day')}
                </p>
                <p className="text-xs text-muted-foreground">{isWorkoutDay ? 'Get moving!' : 'Rest day'}</p>
              </div>
              <div className={`p-2 rounded-lg ${!isWorkoutDay ? 'bg-muted' : 'bg-primary/10'}`}>
                {isWorkoutDay ? (
                  <Dumbbell className="h-5 w-5 text-primary" />
                ) : (
                  <CalendarOff className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Weight Status */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Weight</p>
                <p className={`text-sm font-medium mt-1 ${!weightDueToday ? 'text-muted-foreground' : ''}`}>
                  {loading ? '...' : (weightDueToday ? 'Measure your weight today' : `Next measurement in ${daysUntilWeight} day${daysUntilWeight !== 1 ? 's' : ''}`)}
                </p>
                <p className="text-xs text-muted-foreground">{weightDueToday ? 'Time to check in!' : 'On track'}</p>
              </div>
              <div className={`p-2 rounded-lg ${!weightDueToday ? 'bg-muted' : 'bg-primary/10'}`}>
                <Scale className={`h-5 w-5 ${weightDueToday ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Other Stats */}
      {stats.map((stat) => (
        <Card key={stat.label} className="shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
