import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dumbbell, CalendarOff, Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DailySummary {
  id: string;
  user_id: string;
  date: string;
  calories_consumed: number;
  calories_remaining: number;
  calorie_goal: number;
  workout_status: string;
}

interface StatsCardsProps {
  weightMeasurementInterval: number;
  dailySummary: DailySummary | null;
}

export const StatsCards = ({ weightMeasurementInterval, dailySummary }: StatsCardsProps) => {
  const [didWorkoutToday, setDidWorkoutToday] = useState<boolean>(false);
  const [weightDueToday, setWeightDueToday] = useState<boolean | null>(null);
  const [daysUntilWeight, setDaysUntilWeight] = useState<number>(0);
  const [lastWeightDiffDays, setLastWeightDiffDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Get workout status from daily summary (passed via props, always fresh from RPC)
  const workoutStatus = dailySummary?.workout_status || 'yes';

  // Fetch gym session for today and last weight date on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const today = new Date().toISOString().split('T')[0];

        // Check if user has logged a gym session today
        const { data: gymData } = await supabase
          .from('fittrack_gym_sessions')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', today)
          .limit(1);

        setDidWorkoutToday(gymData && gymData.length > 0);

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
          setLastWeightDiffDays(diffDays);
        } else {
          // No weight entries yet
          setLastWeightDiffDays(null);
        }
      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [dailySummary]); // Re-fetch when summary updates

  // Recalculate weight status when interval or lastWeightDiffDays changes
  useEffect(() => {
    if (lastWeightDiffDays === null) {
      // No weight entries yet, measurement is due
      setWeightDueToday(true);
      setDaysUntilWeight(0);
    } else {
      if (lastWeightDiffDays >= weightMeasurementInterval) {
        setWeightDueToday(true);
        setDaysUntilWeight(0);
      } else {
        setWeightDueToday(false);
        setDaysUntilWeight(weightMeasurementInterval - lastWeightDiffDays);
      }
    }
  }, [weightMeasurementInterval, lastWeightDiffDays]);

  const isWorkoutDay = workoutStatus === 'yes';
  const showWorkoutReminder = isWorkoutDay && !didWorkoutToday;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Workout Status Card */}
      <Card className="shadow-md">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Workout</p>
              <p className={`text-sm font-medium mt-1 ${!showWorkoutReminder ? 'text-muted-foreground' : ''}`}>
                {loading ? '...' : (
                  didWorkoutToday 
                    ? 'You did workout today' 
                    : (isWorkoutDay ? 'Today is a workout day' : 'Today is not a workout day')
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {didWorkoutToday ? 'Rest now!' : (isWorkoutDay ? 'Get moving!' : 'Rest day')}
              </p>
            </div>
            <div className={`p-2 rounded-lg ${!showWorkoutReminder ? 'bg-muted' : 'bg-primary/10'}`}>
              {showWorkoutReminder ? (
                <Dumbbell className="h-5 w-5 text-primary" />
              ) : (
                <CalendarOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weight Status Card */}
      <Card className="shadow-md">
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>
    </div>
  );
};
