import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UserSettings {
  daily_calorie_goal: number;
}

export const useUserSettings = () => {
  const [settings, setSettings] = useState<UserSettings>({ daily_calorie_goal: 2000 });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSettings({ daily_calorie_goal: 2000 });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('fittrack_user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({ daily_calorie_goal: data.daily_calorie_goal });
      } else {
        // Create default settings for new user
        const { data: newData, error: insertError } = await supabase
          .from('fittrack_user_settings')
          .insert({ user_id: user.id, daily_calorie_goal: 2000 })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings({ daily_calorie_goal: newData.daily_calorie_goal });
      }
    } catch (error) {
      console.error('Error fetching user settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchSettings();
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateCalorieGoal = async (goal: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to update settings',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ daily_calorie_goal: goal })
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings((prev) => ({ ...prev, daily_calorie_goal: goal }));
      toast({
        title: 'Success',
        description: 'Daily calorie goal updated',
      });
    } catch (error) {
      console.error('Error updating calorie goal:', error);
      toast({
        title: 'Error',
        description: 'Failed to update calorie goal',
        variant: 'destructive',
      });
    }
  };

  return { settings, loading, updateCalorieGoal, refetch: fetchSettings };
};
