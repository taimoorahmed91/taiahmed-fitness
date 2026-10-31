import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { PageLoading } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { supabase } from '@/integrations/supabase/client';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

const MASKED = '\u2022'.repeat(40);

/**
 * The personal MCP token. Behaviour is unchanged: only a hash is stored, the plain token is shown once when it is
 * generated, refreshing replaces it, revoking removes it (after a confirmation). The section header always says
 * whether a token exists, so it can stay closed; it opens by itself when a new token has just been made so it can be copied.
 */
export const ApiTokenSection = () => {
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const call = async (action: 'status' | 'generate' | 'revoke') => {
    const { data, error } = await supabase.functions.invoke('api-token', { body: { action } });
    if (error) {
      // Try to surface server-provided error (e.g. 429 rate limit)
      const ctx = (error as { context?: { error?: string; retry_in_seconds?: number } }).context;
      if (ctx?.error) throw new Error(ctx.error);
      throw error;
    }
    return data as {
      token?: string | null;
      expires_at?: string | null;
      exists?: boolean;
    };
  };

  const refreshStatus = async () => {
    try {
      const data = await call('status');
      setExists(!!data.exists);
      if (!data.exists) setPlainToken(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const data = await call('generate');
      setExists(true);
      setPlainToken(data.token ?? null);
      setOpen(true);
      toast.success('New token generated. Copy it now — it will not be shown again.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate token';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await call('revoke');
      setExists(false);
      setPlainToken(null);
      toast.success('Token revoked');
    } catch {
      toast.error('Failed to revoke token');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!plainToken) return;
    try {
      await navigator.clipboard.writeText(plainToken);
      toast.success('Token copied to clipboard');
    } catch {
      toast.error('Could not copy. Select the token text and copy it manually.');
    }
  };

  const summary = loading
    ? 'Checking token status\u2026'
    : plainToken
      ? 'New token ready to copy'
      : exists
        ? 'Active \u00b7 no expiry'
        : 'No token yet';

  return (
    <SettingsSection
      id="mcp-token"
      icon={KeyRound}
      title="MCP token"
      headingLevel="h3"
      collapsible
      summary={summary}
      open={open}
      onOpenChange={setOpen}
    >
      <SettingsRow
        label="Your token"
        labelId="mcp-token-label"
        description="A personal token for external integrations that connect to your data."
      >
        <div role="group" aria-labelledby="mcp-token-label" className="space-y-4">
          {loading ? (
            <PageLoading label="Loading token status" rows={1} />
          ) : (
            <>
              {plainToken && (
                <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                    Copy now — this token will not be shown again
                  </div>
                  <div className="flex items-stretch gap-2">
                    <code className="flex min-h-10 min-w-0 flex-1 items-center break-all rounded-md bg-background px-3 py-2 font-mono text-xs">
                      {plainToken}
                    </code>
                    <IconButton label="Copy token" tooltip variant="outline" onClick={handleCopy}>
                      <Copy />
                    </IconButton>
                  </div>
                </div>
              )}

              {!exists ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">You have no token yet.</p>
                  <Button onClick={handleGenerate} loading={busy} loadingText="Generating…" size="touch" className="w-full gap-2 sm:w-auto">
                    <KeyRound aria-hidden="true" /> Generate token
                  </Button>
                </div>
              ) : (
                <>
                  {!plainToken && (
                    <code className="flex min-h-10 items-center break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                      <span aria-hidden="true">{MASKED}</span>
                      <span className="sr-only">Token hidden. It cannot be shown again.</span>
                    </code>
                  )}
                  <p className="flex items-start gap-1.5 text-sm font-medium">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-chart-min" />
                    <span>Active. No expiry; valid until refreshed or revoked.</span>
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" size="touch" onClick={handleGenerate} loading={busy} loadingText="Refreshing…" className="gap-2">
                      <RefreshCw aria-hidden="true" /> Refresh token
                    </Button>
                    <ConfirmDeleteButton
                      variant="ghost"
                      size="touch"
                      onConfirm={handleRevoke}
                      confirmationTitle="Revoke token?"
                      confirmationDescription="Are you sure you want to revoke this access token? Connected services using it will lose access until you provide a new token."
                      confirmLabel="Yes, revoke"
                      disabled={busy}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" /> Revoke
                    </ConfirmDeleteButton>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </SettingsRow>
      <SettingsRow label="Good to know">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Only a SHA-256 hash is stored. The plain token is shown <strong className="font-semibold text-foreground">once</strong>, when it is generated.</li>
          <li>The token <strong className="font-semibold text-foreground">does not expire</strong>. It stays valid until you refresh or revoke it.</li>
          <li>Refreshing makes a new token (shown once) and stops the previous one working.</li>
          <li>A new token can be generated once every 30 seconds.</li>
        </ul>
      </SettingsRow>
    </SettingsSection>
  );
};
