import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, message, userid, question } = await req.json();

    const username = Deno.env.get('N8N_WEBHOOK_USERNAME');
    const password = Deno.env.get('N8N_WEBHOOK_PASSWORD');
    
    if (!username || !password) {
      console.error('N8N webhook credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Basic Auth header
    const basicAuth = btoa(`${username}:${password}`);

    // Handle test action - route to demo webhook with same auth
    if (action === 'test') {
      const response = await fetch('https://n8n.taimoorahmed.com/webhook/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${basicAuth}`,
        },
        body: JSON.stringify({ action: 'test' }),
      });

      const data = await response.text();

      return new Response(
        JSON.stringify({ success: true, response: data, statusCode: response.status }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regular chat action - requires message, userid, and question
    if (!message || !userid || !question) {
      return new Response(
        JSON.stringify({ error: 'Message, userid, and question are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://n8n.taimoorahmed.com/webhook/app', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: JSON.stringify({ action, message, userid, question }),
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
