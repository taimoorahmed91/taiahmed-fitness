import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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

/** Card heading that stays an h2 under the page's single (screen-reader) h1. Same look as CardTitle. */
const CardHeading = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-2xl font-semibold leading-none tracking-tight">{children}</h2>
);

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";

  const [status, setStatus] = useState<
    "loading" | "invalid" | "unauth" | "ready" | "deciding" | "error" | "blocked"
  >("loading");
  const [details, setDetails] = useState<AuthzDetails | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "deny" | null>(null);
  // Bumping this re-runs the load below without reloading the whole page.
  const [attempt, setAttempt] = useState(0);

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
  }, [authorizationId, attempt]);

  async function decide(approve: boolean) {
    if (!details) return;
    setDecision(approve ? "approve" : "deny");
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

  // Retry stays in the app: go back to the request if we already have it, otherwise load it again.
  const retry = () => {
    setErrorMsg(null);
    setDecision(null);
    if (details) {
      setStatus("ready");
    } else {
      setStatus("loading");
      setAttempt((n) => n + 1);
    }
  };
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <main className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="sr-only">Connect an application to FitTrack</h1>
        {status === "loading" && (
          <Card>
            <CardContent role="status" className="p-6 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>Loading authorization request…</span>
            </CardContent>
          </Card>
        )}

        {status === "invalid" && (
          <Card>
            <CardHeader>
              <CardHeading>Invalid authorization request</CardHeading>
              <CardDescription>
                This link is missing required information. Please start the connection again from the
                requesting application.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === "unauth" && (
          <Card>
            <CardContent role="status" className="p-6 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>Redirecting to sign in…</span>
            </CardContent>
          </Card>
        )}

        {status === "blocked" && (
          <Card>
            <CardHeader>
              <div role="alert" className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                <CardHeading>Redirect not allowed</CardHeading>
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
              <CardHeading>Something went wrong</CardHeading>
              <CardDescription role="alert">{errorMsg ?? "Please try again."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="touch" onClick={retry}>
                {details ? "Back to the request" : "Try loading the request again"}
              </Button>
            </CardContent>
          </Card>
        )}

        {(status === "ready" || status === "deciding") && details && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardHeading>Authorize {details.client?.name ?? "application"}</CardHeading>
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

              <div className="flex items-start gap-2 rounded-md border border-chart-warn/40 bg-chart-warn/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-warn" aria-hidden="true" />
                <p>
                  <strong className="font-semibold">Check before approving.</strong>{" "}
                  Approving grants this application access to your FitTrack data according to your
                  existing permissions. You can revoke access at any time from your account.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="touch"
                  className="flex-1"
                  aria-disabled={!redirectAllowed || status === "deciding" ? true : undefined}
                  loading={status === "deciding" && decision === "approve"}
                  loadingText="Approving…"
                  onClick={() => decide(true)}
                >
                  Approve
                </Button>
                <Button
                  size="touch"
                  className="flex-1"
                  variant="outline"
                  aria-disabled={status === "deciding" ? true : undefined}
                  loading={status === "deciding" && decision === "deny"}
                  loadingText="Denying…"
                  onClick={() => decide(false)}
                >
                  Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
