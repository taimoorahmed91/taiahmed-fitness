import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwam13cWRpcXNrZ3Z6a3ZwanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzk2MDcsImV4cCI6MjA4ODcxNTYwN30.Yjhgz3lhN8b77E7HWI-IZLloxtuwSZqdOsOcAV-4II4';

// SSRF protection: only allow https URLs to public hosts; block private/loopback/link-local ranges
function isUrlSafe(rawUrl: string): boolean {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  // Block obvious internal hostnames
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  // Block raw IPs in private/loopback/link-local ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false; // cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 0) return false;
  }
  if (host.includes(':')) return false; // block raw IPv6 (covers ::1, fc00::/7, fe80::/10)
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Require an authenticated caller. Allow scheduled invocation via shared secret header.
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecret = req.headers.get('x-cron-secret') ?? '';
    const expectedCronSecret = Deno.env.get('SYNC_WHOOP_CRON_SECRET') ?? '';

    let authorized = false;
    if (expectedCronSecret && cronSecret && cronSecret === expectedCronSecret) {
      authorized = true;
    } else {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        const authClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user }, error } = await authClient.auth.getUser(token);
        if (!error && user) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all distinct user_ids that have whoop data
    const { data: users, error: usersError } = await supabase
      .from('fittrack_whoop_data')
      .select('user_id')
      .limit(1000);

    if (usersError) throw usersError;

    const uniqueUserIds = [...new Set((users || []).map((u: any) => u.user_id))];

    if (uniqueUserIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No users with WHOOP data found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let savedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const userId of uniqueUserIds) {
      const { data: settings } = await supabase
        .from('fittrack_user_settings')
        .select('whoop_api_url')
        .eq('user_id', userId)
        .maybeSingle();

      const url = ((settings as any)?.whoop_api_url ?? '').trim();
      if (!url) { skippedCount++; continue; }
      if (!isUrlSafe(url)) {
        errors.push({ user_id: userId, error: 'WHOOP URL rejected (must be https public host)' });
        continue;
      }

      let result: any;
      try {
        const response = await fetch(url, {
          headers: {
            'apikey': WHOOP_API_KEY,
            'Authorization': `Bearer ${WHOOP_API_KEY}`,
          },
          redirect: 'manual',
        });
        if (!response.ok) throw new Error(`WHOOP API returned ${response.status}`);
        result = await response.json();
      } catch (e: any) {
        errors.push({ user_id: userId, error: e?.message || 'fetch failed' });
        continue;
      }

      const recovery = result.recovery || {};
      const cycle = result.cycle || {};

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

      let cycleDate: string;
      if (cycle.end) {
        const d = new Date(cycle.end);
        cycleDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      } else {
        const d = new Date();
        cycleDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      }

      const totalInBedHours = (sleep as any).total_in_bed_time_milli
        ? Number(((sleep as any).total_in_bed_time_milli / 3600000).toFixed(2))
        : null;

      const { data: existing } = await supabase
        .from('fittrack_whoop_data')
        .select('id')
        .eq('user_id', userId)
        .eq('date', cycleDate)
        .maybeSingle();

      if (existing) continue;

      const { error } = await supabase.from('fittrack_whoop_data').insert({
        user_id: userId,
        date: cycleDate,
        recovery_score: recovery.recovery_score ?? null,
        hrv_rmssd_milli: recovery.hrv_rmssd_milli ?? null,
        resting_heart_rate: recovery.resting_heart_rate ?? null,
        spo2_percentage: recovery.spo2_percentage ?? null,
        skin_temp_celsius: recovery.skin_temp_celsius ?? null,
        sleep_performance_percentage: (sleep as any).sleep_performance_percentage ?? null,
        sleep_efficiency_percentage: (sleep as any).sleep_efficiency_percentage ?? null,
        total_in_bed_hours: totalInBedHours,
        total_rem_sleep_milli: (sleep as any).total_rem_sleep_time_milli ?? null,
        total_deep_sleep_milli: (sleep as any).total_slow_wave_sleep_time_milli ?? null,
        total_light_sleep_milli: (sleep as any).total_light_sleep_time_milli ?? null,
        total_awake_time_milli: (sleep as any).total_awake_time_milli ?? null,
        respiratory_rate: (sleep as any).respiratory_rate ?? null,
        disturbance_count: (sleep as any).disturbance_count ?? null,
        sleep_cycle_count: (sleep as any).sleep_cycle_count ?? null,
        strain: cycle.strain ?? null,
        kilojoule: cycle.kilojoule ?? null,
        average_heart_rate: cycle.average_heart_rate ?? null,
        max_heart_rate: cycle.max_heart_rate ?? null,
      });

      if (!error) {
        savedCount++;
        if (totalInBedHours) {
          await supabase.from('fittrack_sleep').upsert({
            user_id: userId,
            date: cycleDate,
            hours: totalInBedHours,
            notes: 'Imported from WHOOP',
            source: 'whoop',
          }, { onConflict: 'user_id,date,source' });
        }
      }
      else errors.push({ user_id: userId, error: error.message });
    }



    return new Response(JSON.stringify({
      message: `Synced WHOOP data for ${savedCount} user(s); skipped ${skippedCount} without URL`,
      saved: savedCount,
      skipped: skippedCount,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
