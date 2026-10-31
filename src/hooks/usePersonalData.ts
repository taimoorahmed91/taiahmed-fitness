import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import {
  INITIAL_SOURCE_STATUS, LOADED_SOURCE_STATUS, deriveSourceState, type SourceStatus,
} from '@/app/globalRefresh';
import { useRefreshSource } from '@/app/globalRefreshContext';

export interface PersonalData {
  id?: string;
  full_name: string | null;
  dob: string | null; // YYYY-MM-DD
  age: number | null;
  gender: string | null; // 'M' | 'F'
  height_cm: number | null;
  target_weight_kg: number | null;
  gym_day_calorie_target: number | null;
  gym_day_calorie_target_max: number | null;
  rest_day_calorie_target: number | null;
  rest_day_calorie_target_max: number | null;
  protein_multiplier: number | null;
  protein_multiplier_max: number | null;
  carb_multiplier: number | null;
  carb_multiplier_max: number | null;
  workout_days: number[];
  /** Map of weekday index (0=Sun..6=Sat, as string) to workout template id. */
  workout_day_templates: Record<string, string>;
}

const empty: PersonalData = {
  full_name: null,
  dob: null,
  age: null,
  gender: null,
  height_cm: null,
  target_weight_kg: null,
  gym_day_calorie_target: null,
  gym_day_calorie_target_max: null,
  rest_day_calorie_target: null,
  rest_day_calorie_target_max: null,
  protein_multiplier: null,
  protein_multiplier_max: null,
  carb_multiplier: null,
  carb_multiplier_max: null,
  workout_days: [],
  workout_day_templates: {},
};

export const usePersonalData = () => {
  const { user } = useUser();
  const [data, setData] = useState<PersonalData>(empty);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SourceStatus>(INITIAL_SOURCE_STATUS);
  // Whose profile is on screen, so a failed load for someone else never keeps the previous person's profile.
  const ownerRef = useRef<string | null>(null);

  /** Loads the profile. THROWS when the load failed (after recording it in `status`). With no user there is nothing to load. */
  const loadPersonalData = async ({ isStale }: { isStale: () => boolean }): Promise<void> => {
    if (!user) return;
    // Only the very first load shows "loading": a refresh keeps the form and the numbers on screen.
    if (ownerRef.current !== user.id) setLoading(true);
    try {
      const { data: row, error } = await supabase
        .from('fittrack_personal_data')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (isStale()) return;
      ownerRef.current = user.id;
      if (row) {
        setData({
          id: row.id,
          full_name: row.full_name,
          dob: row.dob,
          age: row.age,
          gender: row.gender,
          height_cm: row.height_cm ? Number(row.height_cm) : null,
          target_weight_kg: row.target_weight_kg ? Number(row.target_weight_kg) : null,
          gym_day_calorie_target: (row as any).gym_day_calorie_target ?? null,
          gym_day_calorie_target_max: (row as any).gym_day_calorie_target_max ?? null,
          rest_day_calorie_target: (row as any).rest_day_calorie_target ?? null,
          rest_day_calorie_target_max: (row as any).rest_day_calorie_target_max ?? null,
          protein_multiplier: (row as any).protein_multiplier != null ? Number((row as any).protein_multiplier) : null,
          protein_multiplier_max: (row as any).protein_multiplier_max != null ? Number((row as any).protein_multiplier_max) : null,
          carb_multiplier: (row as any).carb_multiplier != null ? Number((row as any).carb_multiplier) : null,
          carb_multiplier_max: (row as any).carb_multiplier_max != null ? Number((row as any).carb_multiplier_max) : null,
          workout_days: ((row as any).workout_days ?? []) as number[],
          workout_day_templates: ((row as any).workout_day_templates ?? {}) as Record<string, string>,
        });
      } else {
        setData({ ...empty, full_name: user.user_metadata?.full_name ?? null });
      }
      setStatus(LOADED_SOURCE_STATUS);
    } catch (error) {
      console.error('Error fetching personal data:', error);
      if (!isStale()) {
        if (ownerRef.current !== user.id) {
          // Never keep another person's profile (or an empty one) as if it were this person's.
          setData(empty);
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

  const { refetch, restart } = useRefreshSource(loadPersonalData);

  useEffect(() => {
    void restart();
  }, [user?.id, restart]);

  const state = useMemo(() => deriveSourceState(status), [status]);

  const save = async (payload: Omit<PersonalData, 'id'>) => {
    if (!user) return { error: new Error('Not signed in') };
    const { error } = await supabase
      .from('fittrack_personal_data')
      .upsert(
        { user_id: user.id, ...payload },
        { onConflict: 'user_id' }
      );
    // A change was saved: never accept a load that started before it.
    if (!error) await restart();
    return { error };
  };

  return {
    data, loading, save, refetch,
    state, phase: state.phase, loadFailed: state.loadFailed, refreshFailed: state.refreshFailed, error: state.error,
  };
};
