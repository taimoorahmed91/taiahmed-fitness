import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated Supabase user
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, message, question } = await req.json();

    const username = Deno.env.get('N8N_WEBHOOK_USERNAME');
    const password = Deno.env.get('N8N_WEBHOOK_PASSWORD');
    if (!username || !password) {
      console.error('N8N webhook credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const basicAuth = btoa(`${username}:${password}`);

    if (action === 'test') {
      const response = await fetch('https://n8n.taimoorahmed.com/webhook/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${basicAuth}` },
        body: JSON.stringify({ action: 'test' }),
      });
      const data = await response.text();
      return new Response(
        JSON.stringify({ success: true, response: data, statusCode: response.status }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message || !question) {
      return new Response(
        JSON.stringify({ error: 'Message and question are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use verified user.id — never trust a client-supplied userid
    const response = await fetch('https://n8n.taimoorahmed.com/webhook/app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${basicAuth}` },
      body: JSON.stringify({ action, message, userid: user.id, question }),
    });
    const data = await response.text();

    return new Response(
      JSON.stringify({ success: true, response: data, statusCode: response.status }),
      { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to send message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
