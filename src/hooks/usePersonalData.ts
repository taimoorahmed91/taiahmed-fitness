import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';

export interface PersonalData {
  id?: string;
  full_name: string | null;
  dob: string | null; // YYYY-MM-DD
  age: number | null;
  gender: string | null; // 'M' | 'F'
  height_cm: number | null;
  target_weight_kg: number | null;
  gym_day_calorie_target: number | null;
  rest_day_calorie_target: number | null;
}

const empty: PersonalData = {
  full_name: null,
  dob: null,
  age: null,
  gender: null,
  height_cm: null,
  target_weight_kg: null,
  gym_day_calorie_target: null,
  rest_day_calorie_target: null,
};

export const usePersonalData = () => {
  const { user } = useUser();
  const [data, setData] = useState<PersonalData>(empty);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: row } = await supabase
      .from('fittrack_personal_data')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
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
        rest_day_calorie_target: (row as any).rest_day_calorie_target ?? null,
      });
    } else {
      setData({ ...empty, full_name: user.user_metadata?.full_name ?? null });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = async (payload: Omit<PersonalData, 'id'>) => {
    if (!user) return { error: new Error('Not signed in') };
    const { error } = await supabase
      .from('fittrack_personal_data')
      .upsert(
        { user_id: user.id, ...payload },
        { onConflict: 'user_id' }
      );
    if (!error) await refetch();
    return { error };
  };

  return { data, loading, save, refetch };
};
