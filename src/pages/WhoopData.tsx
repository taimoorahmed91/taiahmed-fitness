import { useEffect, useState, type ReactNode } from 'react';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState } from '@/components/layout/Page';
import { useWhoopData } from '@/hooks/useWhoopData';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, RefreshCw, Activity, Heart, Moon, Flame, Link as LinkIcon } from 'lucide-react';
import { WhoopHistoryList, whoopDateLabel, whoopLatestCards, type LatestReading } from '@/components/history/WhoopHistoryList';
import { useSharedTableState } from '@/lib/sharedTable';
import { tableView } from '@/components/feedback/tableView';
import { DataLoadError } from '@/components/feedback/DataLoadError';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';
import { EditWhoopEntryDialog } from '@/components/EditWhoopEntryDialog';
import type { WhoopEntry } from '@/hooks/useWhoopData';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';

/** Only web addresses are accepted for the sync endpoint. */
const isWebUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const CARD_ICONS = { recovery: Activity, heart: Heart, sleep: Moon, strain: Flame } as const;

/** A reading that was not recorded is a dash with a spoken "not recorded"; a recorded one is its text and unit. */
const Reading = ({ reading, spokenLabel }: { reading: LatestReading; spokenLabel: string }): ReactNode =>
  reading.recorded ? (
    reading.text
  ) : (
    <>
      <span aria-hidden="true">{reading.text}</span>
      <span className="sr-only">{spokenLabel} not recorded</span>
    </>
  );

type UrlState = 'loading' | 'ready' | 'error';

const WhoopData = () => {
  const { entries, fetching, rawApiResponse, fetchFromAPI, deleteEntry, updateEntry, refetch } = useWhoopData();
  // Where the WHOOP table really is. An empty list only means "no entries" once it has loaded.
  const tableState = useSharedTableState('whoop');
  const view = tableView(tableState);
  const [editEntry, setEditEntry] = useState<WhoopEntry | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { user } = useUser();
  const [savedUrl, setSavedUrl] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  // "Not set" is only true once the settings really loaded; a failed load is "unknown", never "Not set".
  const [urlState, setUrlState] = useState<UrlState>('loading');
  const [urlAttempt, setUrlAttempt] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setUrlState('loading');
    const loadUrl = async () => {
      const { data, error } = await supabase
        .from('fittrack_user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('Failed to load WHOOP URL:', error);
        setUrlState('error');
        return;
      }
      const url = (data as { whoop_api_url?: string | null } | null)?.whoop_api_url ?? '';
      setSavedUrl(url);
      setUrlInput(url);
      setUrlState('ready');
    };
    void loadUrl();
    return () => {
      cancelled = true;
    };
  }, [userId, urlAttempt]);

  const handleSaveUrl = async () => {
    if (!user) return;
    const value = urlInput.trim();
    if (value && !isWebUrl(value)) {
      setUrlError('Enter a full web address that starts with https:// (or http://).');
      document.getElementById('whoop-url')?.focus();
      return;
    }
    setUrlError(null);
    setSavingUrl(true);
    const { error } = await supabase
      .from('fittrack_user_settings')
      .update({ whoop_api_url: value || null })
      .eq('user_id', user.id);
    setSavingUrl(false);
    if (error) {
      toast.error('Failed to save WHOOP URL');
      return;
    }
    setSavedUrl(value);
    setUrlInput(value);
    toast.success(value ? 'WHOOP URL saved' : 'WHOOP URL cleared');
  };

  const handleFetch = () => {
    fetchFromAPI();
  };

  const handleEdit = (entry: WhoopEntry) => {
    setEditEntry(entry);
    setEditOpen(true);
  };

  const latestEntry = entries[0];
  const avg7 = (() => {
    const recent = entries.slice(0, 7);
    const avg = (vals: (number | null)[], d = 0) => {
      const v = vals.filter((x): x is number => x != null).map(Number);
      return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(d)) : null;
    };
    return {
      recovery: avg(recent.map((e) => e.recovery_score)),
      rhr: avg(recent.map((e) => e.resting_heart_rate)),
      strain: avg(recent.map((e) => e.strain), 1),
    };
  })();

  return (
    <PageContainer>
      <PageHeader
        title="WHOOP Data"
        description="Fetch and track your WHOOP recovery, sleep, and strain data"
        actions={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button onClick={handleFetch} loading={fetching} loadingText="Syncing…">
              <RefreshCw aria-hidden="true" />
              Sync Now
            </Button>
            <p className="text-xs text-muted-foreground">Auto-syncs daily at 14:00 CET</p>
          </div>
        }
      />

      {/* A refresh failed but the rows below are the last good ones: say so and keep them on screen. */}
      {view === 'ready' && tableState.refreshFailed && (
        <StaleDataNotice subject="your WHOOP data" onRetry={refetch} />
      )}

      {/* Summary: skeleton while loading, an error (never "0 entries" or "No WHOOP data yet") if the first load failed. */}
      {view === 'loading' && (
        <div role="status" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <span className="sr-only">Loading WHOOP readings</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" aria-hidden="true" />
          ))}
        </div>
      )}
      {view === 'error' && (
        <DataLoadError
          title="We couldn't load your WHOOP data"
          description="Your saved readings are safe. Your latest readings and history will show once they load."
          onRetry={refetch}
          minHeightClassName="min-h-[12rem]"
        />
      )}
      {view === 'ready' && latestEntry && (
        <PageSection title="Latest readings" hideTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {whoopLatestCards(latestEntry).map((card) => {
              const Icon = CARD_ICONS[card.key];
              return (
                <Card key={card.key}>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1">
                      <Icon className="h-4 w-4" aria-hidden="true" /> {card.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      <Reading reading={card.main} spokenLabel={card.label} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {card.sub.label}: <Reading reading={card.sub} spokenLabel={card.sub.label} />
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Latest reading:{' '}
            <time dateTime={latestEntry.date} className="font-medium text-foreground">{whoopDateLabel(latestEntry.date)}</time>
            {avg7.recovery !== null && <> · 7-day avg recovery <span className="font-medium text-foreground">{avg7.recovery}%</span></>}
            {avg7.rhr !== null && <> · RHR <span className="font-medium text-foreground">{avg7.rhr} bpm</span></>}
            {avg7.strain !== null && <> · strain <span className="font-medium text-foreground">{avg7.strain}</span></>}
          </p>
        </PageSection>
      )}

      {/* WHOOP API URL config */}
      <PageSection title="WHOOP connection" hideTitle>
        <Card>
          <details className="group">
            <summary className="cursor-pointer list-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  <LinkIcon className="h-4 w-4" aria-hidden="true" /> WHOOP API URL
                  <Badge variant={urlState === 'ready' && savedUrl ? 'default' : 'outline'} className="ml-1">
                    {urlState === 'loading' ? 'Checking…' : urlState === 'error' ? 'Not checked' : savedUrl ? 'Connected' : 'Not set'}
                  </Badge>
                  <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Tap to edit</span>
                </CardTitle>
                <CardDescription>
                  Paste the WHOOP data endpoint URL used by Sync Now.
                </CardDescription>
              </CardHeader>
            </summary>
            <CardContent className="space-y-3">
              {urlState === 'error' && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <span className="flex items-start gap-2">
                    <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>We couldn't load your saved URL. Try again before saving, so it is not overwritten.</span>
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setUrlAttempt((n) => n + 1)}>
                    Try again
                  </Button>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="whoop-url" className="sr-only">WHOOP URL</Label>
                  <Input
                    id="whoop-url"
                    type="url"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                    placeholder={savedUrl || 'https://...'}
                    aria-invalid={urlError ? true : undefined}
                    aria-describedby={[urlError ? 'whoop-url-error' : null, savedUrl ? 'whoop-url-current' : null].filter(Boolean).join(' ') || undefined}
                    className={urlError ? 'border-destructive' : undefined}
                  />
                  {urlError && (
                    <p id="whoop-url-error" className="flex items-start gap-1.5 text-sm text-destructive">
                      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{urlError}</span>
                    </p>
                  )}
                  {savedUrl && (
                    <p id="whoop-url-current" className="text-xs text-muted-foreground break-all">
                      Current: {savedUrl}
                    </p>
                  )}
                </div>
                <Button onClick={handleSaveUrl} loading={savingUrl} loadingText="Saving…" size="touch" disabled={urlState !== 'ready'}>
                  Save URL
                </Button>
              </div>
            </CardContent>
          </details>
        </Card>
      </PageSection>

      {/* History: grouped by week, five core readings per row, every reading when a row is opened */}
      <PageSection title="WHOOP history" hideTitle>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">History</CardTitle>
            {view === 'ready' && <CardDescription>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</CardDescription>}
          </CardHeader>
          <CardContent className={view === 'ready' && entries.length > 0 ? 'px-0' : undefined}>
            {view === 'loading' ? (
              <PageLoading label="Loading WHOOP history" rows={4} />
            ) : view === 'error' ? (
              <p className="flex min-h-[8rem] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Your WHOOP history will show here once your entries load.
              </p>
            ) : entries.length === 0 ? (
              <PageEmptyState
                icon={Activity}
                title="No WHOOP data yet"
                description="Use Sync Now to fetch your first readings."
              />
            ) : (
              <WhoopHistoryList entries={entries} onEdit={handleEdit} onDelete={deleteEntry} />
            )}
          </CardContent>
        </Card>
      </PageSection>

      {/* Raw API Response */}
      {rawApiResponse && (
        <PageSection title="Raw API response" hideTitle>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Raw API Response</CardTitle>
              <CardDescription>Unmodified data exactly as returned from the WHOOP API</CardDescription>
            </CardHeader>
            <CardContent>
              <pre role="region" tabIndex={0} aria-label="Raw WHOOP API response" className="bg-muted p-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-x-auto text-xs font-mono whitespace-pre-wrap break-words max-h-[600px] overflow-y-auto">
                {JSON.stringify(rawApiResponse, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </PageSection>
      )}

      <EditWhoopEntryDialog
        entry={editEntry}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={updateEntry}
      />
    </PageContainer>
  );
};

export default WhoopData;
