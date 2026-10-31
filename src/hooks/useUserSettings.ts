import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser, onAuthIdentityChange } from '@/lib/authSession';
import { toast } from 'sonner';
import {
  INITIAL_SOURCE_STATUS, LOADED_SOURCE_STATUS, deriveSourceState, type SourceStatus,
} from '@/app/globalRefresh';
import { useRefreshSource } from '@/app/globalRefreshContext';

interface UserSettings {
  daily_calorie_goal: number;
  weight_measurement_interval: number;
  waist_measurement_interval: number;
  set_rest_seconds: number;
  exercise_rest_seconds: number;
}

const DEFAULTS: UserSettings = {
  daily_calorie_goal: 2000,
  weight_measurement_interval: 3,
  waist_measurement_interval: 7,
  set_rest_seconds: 60,
  exercise_rest_seconds: 90,
};

export const useUserSettings = () => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SourceStatus>(INITIAL_SOURCE_STATUS);
  // Whose settings are on screen, so a failed load for someone else never keeps the previous person's values.
  const ownerRef = useRef<string | null>(null);

  /** Loads the settings. THROWS when the load failed (after recording it in `status`). */
  const loadSettings = async ({ isStale }: { isStale: () => boolean }): Promise<void> => {
    let userId: string | null = null;
    try {
      const user = await getSessionUser();
      if (isStale()) return;
      if (!user) {
        ownerRef.current = null;
        setSettings(DEFAULTS);
        setStatus(LOADED_SOURCE_STATUS);
        return;
      }
      userId = user.id;

      const { data, error } = await supabase
        .from('fittrack_user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (isStale()) return;

      let row = data;
      if (!row) {
        const { data: newData, error: insertError } = await supabase
          .from('fittrack_user_settings')
          .insert({ user_id: user.id, daily_calorie_goal: 2000, weight_measurement_interval: 3, waist_measurement_interval: 7 } as any)
          .select()
          .single();

        if (insertError) throw insertError;
        if (isStale()) return;
        row = newData;
      }
      ownerRef.current = user.id;
      setSettings({
        daily_calorie_goal: row.daily_calorie_goal,
        weight_measurement_interval: row.weight_measurement_interval || 3,
        waist_measurement_interval: (row as any).waist_measurement_interval || 7,
        set_rest_seconds: (row as any).set_rest_seconds ?? 60,
        exercise_rest_seconds: (row as any).exercise_rest_seconds ?? 90,
      });
      setStatus(LOADED_SOURCE_STATUS);
    } catch (error) {
      console.error('Error fetching user settings:', error);
      if (!isStale()) {
        if (userId && ownerRef.current !== userId) {
          // Never keep another person's values (or fake defaults) as if they were this person's.
          ownerRef.current = null;
          setSettings(DEFAULTS);
          setStatus({ loaded: false, failed: true, error });
        } else {
          setStatus((prev) => ({ loaded: prev.loaded, failed: true, error }));
        }
      }
      throw error;
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  const { refetch, restart } = useRefreshSource(loadSettings);

  useEffect(() => {
    void restart();

    const subscription = onAuthIdentityChange(() => {
      void restart();
    });

    return () => subscription.unsubscribe();
  }, [restart]);

  const state = useMemo(() => deriveSourceState(status), [status]);

  const updateWeightInterval = async (interval: number) => {
    try {
      const user = await getSessionUser();
      if (!user) {
        toast.error('You must be logged in to update settings');
        return;
      }
      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ weight_measurement_interval: interval })
        .eq('user_id', user.id);
      if (error) throw error;
      setSettings((prev) => ({ ...prev, weight_measurement_interval: interval }));
      toast.success(`Weight measurement interval updated to every ${interval} days`);
    } catch (error) {
      console.error('Error updating weight interval:', error);
      toast.error('Failed to update weight interval');
    }
  };

  const updateWaistInterval = async (interval: number) => {
    try {
      const user = await getSessionUser();
      if (!user) {
        toast.error('You must be logged in to update settings');
        return;
      }
      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ waist_measurement_interval: interval } as any)
        .eq('user_id', user.id);
      if (error) throw error;
      setSettings((prev) => ({ ...prev, waist_measurement_interval: interval }));
      toast.success(`Waist measurement interval updated to every ${interval} days`);
    } catch (error) {
      console.error('Error updating waist interval:', error);
      toast.error('Failed to update waist interval');
    }
  };

  const updateRestTimers = async (setRest: number, exerciseRest: number) => {
    try {
      const user = await getSessionUser();
      if (!user) {
        toast.error('You must be logged in to update settings');
        return;
      }
      const { error } = await supabase
        .from('fittrack_user_settings')
        .update({ set_rest_seconds: setRest, exercise_rest_seconds: exerciseRest } as any)
        .eq('user_id', user.id);
      if (error) throw error;
      setSettings((prev) => ({ ...prev, set_rest_seconds: setRest, exercise_rest_seconds: exerciseRest }));
      toast.success('Rest timers updated');
    } catch (error) {
      console.error('Error updating rest timers:', error);
      toast.error('Failed to update rest timers');
    }
  };

  return {
    settings, loading, updateRestTimers, updateWeightInterval, updateWaistInterval, refetch,
    state, phase: state.phase, loadFailed: state.loadFailed, refreshFailed: state.refreshFailed, error: state.error,
  };
};
