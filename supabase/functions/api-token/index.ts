import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

function hexToBytes(hex: string): Uint8Array {
  // Accept hex (64 chars => 32 bytes). If not hex, hash via SHA-256.
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  // Fallback: derive 32-byte key from the raw secret string
  return new Uint8Array(); // signal to caller to derive
}

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("FITTRACK_TOKEN_ENC_KEY") ?? "";
  let bytes = hexToBytes(raw);
  if (bytes.length !== 32) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    bytes = new Uint8Array(hash);
  }
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64encode(arr: Uint8Array): string {
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptToken(plain: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return { ciphertext: b64encode(new Uint8Array(ct)), iv: b64encode(iv) };
}

async function decryptToken(ciphertext: string, iv: string) {
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(iv) },
    key,
    b64decode(ciphertext),
  );
  return new TextDecoder().decode(pt);
}

function generateRandomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // URL-safe token, ~43 chars
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
        JSON.stringify({ exists: !!data, expires_at: data?.expires_at ?? null, created_at: data?.created_at ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "generate") {
      const token = generateRandomToken();
      const { ciphertext, iv } = await encryptToken(token);
      const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
      const { error } = await admin
        .from("fittrack_api_tokens")
        .upsert({ user_id: user.id, ciphertext, iv, expires_at, created_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      return new Response(JSON.stringify({ token, expires_at }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "expose") {
      const { data } = await admin
        .from("fittrack_api_tokens")
        .select("ciphertext, iv, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        return new Response(JSON.stringify({ token: null, expires_at: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (new Date(data.expires_at).getTime() <= Date.now()) {
        await admin.from("fittrack_api_tokens").delete().eq("user_id", user.id);
        return new Response(JSON.stringify({ token: null, expires_at: null, expired: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = await decryptToken(data.ciphertext, data.iv);
      return new Response(JSON.stringify({ token, expires_at: data.expires_at }), {
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
