import { useState } from 'react';
import { Shuffle, Lock } from 'lucide-react';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { requestAppRefresh } from '@/app/refresh';
import { describeDemoRegeneration } from '@/app/globalRefresh';
import { useGlobalRefresh } from '@/app/globalRefreshContext';
import { PAGE_GUTTER_CLASS } from '@/components/layout/Page';

export const DEMO_EMAIL = 'demo@fittrack.local';

/**
 * Read-only notice for the shared demo account, with a button to reshuffle its sample data.
 * Rendered by the app header in normal page flow (not sticky): it scrolls away with the page
 * while the header keeps a small "Demo" badge visible.
 */
export const DemoBanner = () => {
  const [busy, setBusy] = useState(false);
  const globalRefresh = useGlobalRefresh();
  const regenerate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('demo-login', { body: { action: 'regenerate' } });
      if (error || !data?.ok) {
        toast.error("Couldn't generate new sample data. Please try again.");
        return;
      }
      // The sample data was replaced on the server, so anything loaded before is out of date.
      // Never reload the page: that would throw away what the visitor is doing.
      if (globalRefresh) {
        // Invalidate every shared table and reload the ones on screen. The batch never reuses a fetch
        // that began before the change, and we only say "loaded" once it really finished.
        const { kind, message, description } = describeDemoRegeneration(await globalRefresh.run({ invalidate: true }));
        toast[kind](message, { description });
      } else if (requestAppRefresh()) {
        toast.success('New sample data requested.');
      } else {
        toast.success('New sample data is ready.', { description: 'Pages load it when you open them.' });
      }
    } catch (error) {
      console.error('Demo data regeneration failed:', error);
      toast.error("Couldn't generate new sample data. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Demo account notice"
      className="border-b bg-primary/10 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className={`container flex flex-wrap items-center justify-between gap-2 py-2 text-sm ${PAGE_GUTTER_CLASS}`}>
        <span className="flex items-center gap-2 text-foreground">
          <Lock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Demo account — view only. Changes won't be saved.
        </span>
        <ConfirmDeleteButton size="touch" aria-label="Generate random data" onConfirm={regenerate} disabled={busy} confirmationTitle="Replace demo data?" confirmationDescription="Are you sure you want to replace the current sample meals, workouts, templates and measurements with newly generated data? This affects the shared demo account only, not your personal account." confirmLabel="Yes, replace data">
          <Shuffle className="h-4 w-4 mr-1" aria-hidden="true" />
          {busy ? 'Generating...' : 'Generate random data'}
        </ConfirmDeleteButton>
      </div>
    </section>
  );
};
