import { shouldShowFetchError } from '@/lib/fetchErrorToast';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser, onAuthIdentityChange } from '@/lib/authSession';
import { toast } from 'sonner';
import {
  INITIAL_SOURCE_STATUS, LOADED_SOURCE_STATUS, deriveSourceState, type SourceStatus,
} from '@/app/globalRefresh';
import { useRefreshSource } from '@/app/globalRefreshContext';

interface DailySummary {
  id: string;
  user_id: string;
  date: string;
  calories_consumed: number;
  calories_remaining: number;
  calorie_goal: number;
  workout_status: string;
}

export const useDailySummary = () => {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SourceStatus>(INITIAL_SOURCE_STATUS);
  // Whose summary is on screen, so a failed load for someone else never keeps the previous person's numbers.
  const ownerRef = useRef<string | null>(null);

  /** Loads today's summary. THROWS when the load failed (after recording it in `status`). */
  const loadSummary = async ({ isStale }: { isStale: () => boolean }): Promise<void> => {
    let userId: string | null = null;
    try {
      const user = await getSessionUser();
      if (isStale()) return;
      if (!user) {
        ownerRef.current = null;
        setSummary(null);
        setStatus(LOADED_SOURCE_STATUS);
        return;
      }
      userId = user.id;

      // Call the database function to get or create today's summary
      const { data, error } = await supabase.rpc('get_or_create_daily_summary', {
        p_user_id: user.id
      });

      if (error) throw error;
      if (isStale()) return;

      ownerRef.current = user.id;
      setSummary(data as DailySummary);
      setStatus(LOADED_SOURCE_STATUS);
    } catch (error) {
      console.error('Error fetching daily summary:', error);
      if (!isStale()) {
        if (shouldShowFetchError('summary')) toast.error('Failed to fetch daily summary');
        if (userId && ownerRef.current !== userId) {
          ownerRef.current = null;
          setSummary(null);
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

  const { refetch, restart } = useRefreshSource(loadSummary);

  useEffect(() => {
    void restart();

    const subscription = onAuthIdentityChange(() => {
      void restart();
    });

    return () => subscription.unsubscribe();
  }, [restart]);

  const state = useMemo(() => deriveSourceState(status), [status]);

  return {
    summary, loading, refetch,
    state, phase: state.phase, loadFailed: state.loadFailed, refreshFailed: state.refreshFailed, error: state.error,
  };
};
