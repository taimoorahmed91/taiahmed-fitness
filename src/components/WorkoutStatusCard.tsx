import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Dumbbell, CalendarOff } from 'lucide-react';

export const WorkoutStatusCard = () => {
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

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Dumbbell className="h-5 w-5 text-primary" />
          Workout
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          {isWorkoutDay ? (
            <>
              <div className="p-2 rounded-full bg-primary/10">
                <Dumbbell className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Today is a workout day</p>
            </>
          ) : (
            <>
              <div className="p-2 rounded-full bg-muted">
                <CalendarOff className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Today is not a workout day</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
