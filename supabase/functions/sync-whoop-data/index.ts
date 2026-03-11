import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_API_URL = 'https://apjmwqdiqskgvzkvpjpx.supabase.co/functions/v1/get-latest-collective';
const WHOOP_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwam13cWRpcXNrZ3Z6a3ZwanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzk2MDcsImV4cCI6MjA4ODcxNTYwN30.Yjhgz3lhN8b77E7HWI-IZLloxtuwSZqdOsOcAV-4II4';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all distinct user_ids that have whoop data
    const { data: users, error: usersError } = await supabase
      .from('fittrack_whoop_data')
      .select('user_id')
      .limit(100);

    if (usersError) throw usersError;

    const uniqueUserIds = [...new Set((users || []).map(u => u.user_id))];

    if (uniqueUserIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No users with WHOOP data found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch latest WHOOP data
    const response = await fetch(WHOOP_API_URL, {
      headers: {
        'apikey': WHOOP_API_KEY,
        'Authorization': `Bearer ${WHOOP_API_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`WHOOP API returned ${response.status}`);

    const result = await response.json();
    const recovery = result.recovery || {};
    const cycle = result.cycle || {};

    // Handle sleep: combine all sleep records for summed fields, use nap:false for percentage fields
    let sleep: Record<string, unknown> = {};
    const rawSleep = result.sleep;
    if (Array.isArray(rawSleep) && rawSleep.length > 0) {
      if (rawSleep.length === 1) {
        sleep = rawSleep[0];
      } else {
        const mainSleep = rawSleep.find((s: any) => s.nap === false) || rawSleep[0];
        const sumFields = ['total_in_bed_time_milli', 'total_awake_time_milli', 'total_light_sleep_time_milli', 'total_slow_wave_sleep_time_milli', 'total_rem_sleep_time_milli', 'disturbance_count', 'sleep_cycle_count'];
        sleep = { ...mainSleep };
        for (const field of sumFields) {
          (sleep as any)[field] = rawSleep.reduce((sum: number, s: any) => sum + (Number(s[field]) || 0), 0);
        }
      }
    } else if (rawSleep && typeof rawSleep === 'object') {
      sleep = rawSleep as Record<string, unknown>;
    }

    // Use cycle.end for the date (represents the day the cycle covers)
    let cycleDate: string;
    if (cycle.end) {
      const d = new Date(cycle.end);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      cycleDate = `${year}-${month}-${day}`;
    } else {
      const d = new Date();
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      cycleDate = `${year}-${month}-${day}`;
    }

    const totalInBedHours = sleep.total_in_bed_time_milli
      ? Number((sleep.total_in_bed_time_milli / 3600000).toFixed(2))
      : null;

    let savedCount = 0;

    for (const userId of uniqueUserIds) {
      // Check if entry already exists for this date
      const { data: existing } = await supabase
        .from('fittrack_whoop_data')
        .select('id')
        .eq('user_id', userId)
        .eq('date', cycleDate)
        .maybeSingle();

      if (existing) continue; // Skip if already exists

      const { error } = await supabase.from('fittrack_whoop_data').insert({
        user_id: userId,
        date: cycleDate,
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
      });

      if (!error) savedCount++;
    }

    return new Response(JSON.stringify({ 
      message: `Synced WHOOP data for ${savedCount} user(s)`,
      date: cycleDate,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
