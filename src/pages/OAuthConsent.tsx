import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";

type AuthzDetails = {
  authorization_id: string;
  redirect_url?: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

// Only ChatGPT redirect URIs are allowed.
function isAllowedRedirectUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "chatgpt.com") return false;
    if (u.pathname.startsWith("/connector/oauth/")) return true;
    if (u.pathname === "/connector_platform_oauth_redirect") return true;
    return false;
  } catch {
    return false;
  }
}

// Same-origin relative path guard for post-login return.
function safeReturnPath(): string {
  const path = window.location.pathname + window.location.search;
  return path.startsWith("/") && !path.startsWith("//") ? path : "/oauth/consent";
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";

  const [status, setStatus] = useState<
    "loading" | "invalid" | "unauth" | "ready" | "deciding" | "error" | "blocked"
  >("loading");
  const [details, setDetails] = useState<AuthzDetails | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setStatus("invalid");
        return;
      }

      // Verify session with getUser (re-validates with auth server), not just getSession.
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (!active) return;

      if (userErr || !userData.user) {
        // Kick off Google login, preserving full return path (incl. authorization_id).
        const returnTo = `${window.location.origin}${safeReturnPath()}`;
        setStatus("unauth");
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: returnTo },
        });
        if (error) {
          setErrorMsg("Could not start sign-in. Please try again.");
          setStatus("error");
        }
        return;
      }

      setUserEmail(userData.user.email ?? null);

      const { data, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(
        authorizationId,
      );
      if (!active) return;

      if (error || !data) {
        setErrorMsg("This authorization request could not be loaded. It may have expired.");
        setStatus("error");
        return;
      }

      // If already consented previously, Supabase returns an immediate redirect_url.
      if (data.redirect_url && !data.client) {
        if (isAllowedRedirectUrl(data.redirect_url)) {
          window.location.href = data.redirect_url;
        } else {
          setStatus("blocked");
        }
        return;
      }

      setDetails(data as AuthzDetails);
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    if (!details) return;
    setStatus("deciding");
    setErrorMsg(null);

    // Re-verify session before acting.
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      setErrorMsg("Your session expired. Please sign in again.");
      setStatus("error");
      return;
    }

    try {
      const api = (supabase.auth as any).oauth;
      const { data, error } = approve
        ? await api.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await api.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

      if (error || !data?.redirect_url) {
        setErrorMsg("Could not complete this request. Please try again.");
        setStatus("error");
        return;
      }

      // Validate the redirect target before navigating (client-side allowlist).
      if (approve && !isAllowedRedirectUrl(data.redirect_url)) {
        setStatus("blocked");
        return;
      }
      // On deny, also require an allowed target host to avoid open redirect.
      if (!approve && !isAllowedRedirectUrl(data.redirect_url)) {
        setStatus("blocked");
        return;
      }
      window.location.href = data.redirect_url;
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  const redirectAllowed = details ? true : false; // Actual redirect URI is validated after decision.
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {status === "loading" && (
          <Card>
            <CardContent className="p-6 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading authorization request…</span>
            </CardContent>
          </Card>
        )}

        {status === "invalid" && (
          <Card>
            <CardHeader>
              <CardTitle>Invalid authorization request</CardTitle>
              <CardDescription>
                This link is missing required information. Please start the connection again from the
                requesting application.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === "unauth" && (
          <Card>
            <CardContent className="p-6 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Redirecting to sign in…</span>
            </CardContent>
          </Card>
        )}

        {status === "blocked" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle>Redirect not allowed</CardTitle>
              </div>
              <CardDescription>
                This authorization request would send you to a location that is not on the allowlist
                for this integration. For your safety, the request has been blocked.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === "error" && (
          <Card>
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>{errorMsg ?? "Please try again."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {(status === "ready" || status === "deciding") && details && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Authorize {details.client?.name ?? "application"}</CardTitle>
              </div>
              <CardDescription>
                {details.client?.name ?? "This application"} is requesting access to your FitTrack
                account
                {userEmail ? ` (${userEmail})` : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scopes.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Requested permissions</p>
                  <ul className="text-sm text-muted-foreground list-disc pl-5">
                    {scopes.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
                Approving grants this application access to your FitTrack data according to your
                existing permissions. You can revoke access at any time from your account.
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={!redirectAllowed || status === "deciding"}
                  onClick={() => decide(true)}
                >
                  {status === "deciding" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={status === "deciding"}
                  onClick={() => decide(false)}
                >
                  Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
