import { useState } from 'react';
import { Shuffle, Lock } from 'lucide-react';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const DEMO_EMAIL = 'demo@fittrack.local';

/** Read-only notice for the shared demo account, with a button to reshuffle its sample data. */
export const DemoBanner = () => {
  const [busy, setBusy] = useState(false);
  const regenerate = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('demo-login', { body: { action: 'regenerate' } });
    if (error || !data?.ok) {
      toast.error("Couldn't generate new sample data. Please try again.");
      setBusy(false);
      return;
    }
    window.location.reload();
  };
  return (
    <div className="border-t bg-primary/10">
      <div className="container flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <Lock className="h-4 w-4 text-primary" />
          Demo account — view only. Changes won't be saved.
        </span>
        <ConfirmDeleteButton size="sm" onConfirm={regenerate} disabled={busy} confirmationTitle="Replace demo data?" confirmationDescription="Are you sure you want to replace the current sample meals, workouts, templates and measurements with newly generated data? This affects the shared demo account only, not your personal account." confirmLabel="Yes, replace data">
          <Shuffle className="h-4 w-4 mr-1" />
          {busy ? 'Generating...' : 'Generate random data'}
        </ConfirmDeleteButton>
      </div>
    </div>
  );
};
