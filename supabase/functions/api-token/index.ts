import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const GENERATE_COOLDOWN_MS = 30 * 1000; // 30s between generations

function b64url(arr: Uint8Array): string {
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(arr: Uint8Array): string {
  let out = "";
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, "0");
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(buf));
}

function generateRandomToken(): string {
  // ~43 char URL-safe token (256 bits of entropy)
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authClient = createClient(SUPABASE_URL, ANON);
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Always purge expired tokens for this user first
    await admin
      .from("fittrack_api_tokens")
      .delete()
      .eq("user_id", user.id)
      .lt("expires_at", new Date().toISOString());

    const { action } = await req.json().catch(() => ({ action: "status" }));

    if (action === "status") {
      const { data } = await admin
        .from("fittrack_api_tokens")
        .select("expires_at, created_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          exists: !!data,
          expires_at: data?.expires_at ?? null,
          created_at: data?.created_at ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "generate") {
      // Rate limit: 1 generation per 30s per user
      const { data: rate } = await admin
        .from("fittrack_api_token_rate")
        .select("last_generated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (rate?.last_generated_at) {
        const sinceMs = Date.now() - new Date(rate.last_generated_at).getTime();
        if (sinceMs < GENERATE_COOLDOWN_MS) {
          const retryIn = Math.ceil((GENERATE_COOLDOWN_MS - sinceMs) / 1000);
          return new Response(
            JSON.stringify({ error: `Too many requests. Try again in ${retryIn}s.`, retry_in_seconds: retryIn }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const token = generateRandomToken();
      const token_hash = await sha256Hex(token);
      const now = new Date();
      const expires_at = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();

      const { error: upsertErr } = await admin
        .from("fittrack_api_tokens")
        .upsert(
          { user_id: user.id, token_hash, expires_at, created_at: now.toISOString() },
          { onConflict: "user_id" },
        );
      if (upsertErr) throw upsertErr;

      await admin
        .from("fittrack_api_token_rate")
        .upsert({ user_id: user.id, last_generated_at: now.toISOString() }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ token, expires_at }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "revoke") {
      await admin.from("fittrack_api_tokens").delete().eq("user_id", user.id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("api-token error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
