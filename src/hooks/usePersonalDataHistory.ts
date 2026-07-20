import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';

export type PersonalHistoryField =
  | 'target_weight_kg'
  | 'gym_day_calorie_target'
  | 'rest_day_calorie_target';

export interface PersonalHistoryEntry {
  id: string;
  field: PersonalHistoryField;
  value: number;
  changed_at: string;
}

export const usePersonalDataHistory = () => {
  const { user } = useUser();
  const [entries, setEntries] = useState<PersonalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('fittrack_personal_data_history')
      .select('*')
      .eq('user_id', user.id)
      .order('changed_at', { ascending: false });
    setEntries((data || []) as PersonalHistoryEntry[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const latestFor = (field: PersonalHistoryField) =>
    entries.find((e) => e.field === field) || null;

  const historyFor = (field: PersonalHistoryField) =>
    entries.filter((e) => e.field === field);

  return { entries, loading, refetch, latestFor, historyFor };
};
