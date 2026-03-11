import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { logActivity } from '@/hooks/useActivityLog';

export interface WhoopEntry {
  id: string;
  date: string;
  recovery_score: number | null;
  hrv_rmssd_milli: number | null;
  resting_heart_rate: number | null;
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  sleep_performance_percentage: number | null;
  sleep_efficiency_percentage: number | null;
  total_in_bed_hours: number | null;
  total_rem_sleep_milli: number | null;
  total_deep_sleep_milli: number | null;
  total_light_sleep_milli: number | null;
  total_awake_time_milli: number | null;
  respiratory_rate: number | null;
  disturbance_count: number | null;
  sleep_cycle_count: number | null;
  strain: number | null;
  kilojoule: number | null;
  average_heart_rate: number | null;
  max_heart_rate: number | null;
}

const WHOOP_API_URL = 'https://apjmwqdiqskgvzkvpjpx.supabase.co/functions/v1/get-latest-collective';
const WHOOP_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwam13cWRpcXNrZ3Z6a3ZwanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzk2MDcsImV4cCI6MjA4ODcxNTYwN30.Yjhgz3lhN8b77E7HWI-IZLloxtuwSZqdOsOcAV-4II4';

export const useWhoopData = () => {
  const [entries, setEntries] = useState<WhoopEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const { user } = useUser();

  const fetchEntries = async () => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('fittrack_whoop_data')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setEntries(data?.map(e => ({
        id: e.id,
        date: e.date,
        recovery_score: e.recovery_score ? Number(e.recovery_score) : null,
        hrv_rmssd_milli: e.hrv_rmssd_milli ? Number(e.hrv_rmssd_milli) : null,
        resting_heart_rate: e.resting_heart_rate ? Number(e.resting_heart_rate) : null,
        spo2_percentage: e.spo2_percentage ? Number(e.spo2_percentage) : null,
        skin_temp_celsius: e.skin_temp_celsius ? Number(e.skin_temp_celsius) : null,
        sleep_performance_percentage: e.sleep_performance_percentage ? Number(e.sleep_performance_percentage) : null,
        sleep_efficiency_percentage: e.sleep_efficiency_percentage ? Number(e.sleep_efficiency_percentage) : null,
        total_in_bed_hours: e.total_in_bed_hours ? Number(e.total_in_bed_hours) : null,
        total_rem_sleep_milli: e.total_rem_sleep_milli ? Number(e.total_rem_sleep_milli) : null,
        total_deep_sleep_milli: e.total_deep_sleep_milli ? Number(e.total_deep_sleep_milli) : null,
        total_light_sleep_milli: e.total_light_sleep_milli ? Number(e.total_light_sleep_milli) : null,
        total_awake_time_milli: e.total_awake_time_milli ? Number(e.total_awake_time_milli) : null,
        respiratory_rate: e.respiratory_rate ? Number(e.respiratory_rate) : null,
        disturbance_count: e.disturbance_count,
        sleep_cycle_count: e.sleep_cycle_count,
        strain: e.strain ? Number(e.strain) : null,
        kilojoule: e.kilojoule ? Number(e.kilojoule) : null,
        average_heart_rate: e.average_heart_rate ? Number(e.average_heart_rate) : null,
        max_heart_rate: e.max_heart_rate ? Number(e.max_heart_rate) : null,
      })) || []);
    } catch (error) {
      console.error('Error fetching whoop data:', error);
      toast.error('Failed to load WHOOP data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [user]);

  const fetchFromAPI = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    setFetching(true);
    try {
      const response = await fetch(WHOOP_API_URL, {
        headers: {
          'apikey': WHOOP_API_KEY,
          'Authorization': `Bearer ${WHOOP_API_KEY}`,
        },
      });

      if (!response.ok) throw new Error(`API returned ${response.status}`);
      
      const result = await response.json();
      
      // Extract fields from the API response
      const recovery = result.recovery || {};
      const cycle = result.cycle || {};

      // Handle sleep: can be array or single object. Only use nap: false record.
      let sleep: Record<string, any> = {};
      const rawSleep = result.sleep;
      if (Array.isArray(rawSleep)) {
        sleep = rawSleep.find((s: any) => s.nap === false) || {};
      } else if (rawSleep && typeof rawSleep === 'object') {
        sleep = rawSleep.nap === false ? rawSleep : {};
      }

      // Use cycle.end for the date (represents the day the cycle covers)
      let cycleDate: string;
      if (cycle.end) {
        const d = new Date(cycle.end);
        cycleDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        const d = new Date();
        cycleDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      // Check for duplicate entry
      const { data: existing } = await supabase
        .from('fittrack_whoop_data')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', cycleDate)
        .maybeSingle();

      if (existing) {
        toast.info(`Data for ${cycleDate} already exists. No duplicate added.`);
        setFetching(false);
        return;
      }

      // Convert total_in_bed_time_milli to hours
      const totalInBedHours = sleep.total_in_bed_time_milli 
        ? Number((sleep.total_in_bed_time_milli / 3600000).toFixed(2))
        : null;

      const entry = {
        user_id: user.id,
        date: cycleStart,
        recovery_score: recovery.recovery_score ?? null,
        hrv_rmssd_milli: recovery.hrv_rmssd_milli ?? null,
        resting_heart_rate: recovery.resting_heart_rate ?? null,
        spo2_percentage: recovery.spo2_percentage ?? null,
        skin_temp_celsius: recovery.skin_temp_celsius ?? null,
        sleep_performance_percentage: sleep.sleep_performance_percentage ?? null,
        sleep_efficiency_percentage: sleep.sleep_efficiency_percentage ?? null,
        total_in_bed_hours: totalInBedHours,
        total_rem_sleep_milli: sleep.total_rem_sleep_time_milli ?? null,
        total_deep_sleep_milli: sleep.total_slow_wave_sleep_time_milli ?? null,
        total_light_sleep_milli: sleep.total_light_sleep_time_milli ?? null,
        total_awake_time_milli: sleep.total_awake_time_milli ?? null,
        respiratory_rate: sleep.respiratory_rate ?? null,
        disturbance_count: sleep.disturbance_count ?? null,
        sleep_cycle_count: sleep.sleep_cycle_count ?? null,
        strain: cycle.strain ?? null,
        kilojoule: cycle.kilojoule ?? null,
        average_heart_rate: cycle.average_heart_rate ?? null,
        max_heart_rate: cycle.max_heart_rate ?? null,
      };

      const { error } = await supabase.from('fittrack_whoop_data').insert(entry);

      if (error) throw error;

      toast.success('WHOOP data fetched and saved!');
      logActivity({ action: 'create', category: 'whoop', details: { date: cycleStart, recovery_score: entry.recovery_score, strain: entry.strain } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error fetching WHOOP data:', error);
      toast.error('Failed to fetch WHOOP data: ' + (error?.message || 'Unknown error'));
      logActivity({ action: 'create', category: 'whoop', status: 'error', error_message: error?.message || 'Failed to fetch WHOOP data' });
    } finally {
      setFetching(false);
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      const { error } = await supabase.from('fittrack_whoop_data').delete().eq('id', id);
      if (error) throw error;
      toast.success('WHOOP entry deleted!');
      logActivity({ action: 'delete', category: 'whoop', details: { id } });
      fetchEntries();
    } catch (error: any) {
      console.error('Error deleting whoop entry:', error);
      toast.error('Failed to delete WHOOP entry');
      logActivity({ action: 'delete', category: 'whoop', status: 'error', error_message: error?.message, details: { id } });
    }
  };

  return { entries, loading, fetching, fetchFromAPI, deleteEntry, refetch: fetchEntries };
};
