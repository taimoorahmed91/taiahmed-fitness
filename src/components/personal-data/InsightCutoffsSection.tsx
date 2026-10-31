import { useState } from 'react';
import { Activity } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInsightThresholds } from '@/hooks/useInsightThresholds';
import { DEFAULT_RECOVERY_CUTOFF, DEFAULT_SLEEP_CUTOFF } from '@/lib/crossMetricIntelligence';
import { cn } from '@/lib/utils';
import { InlineError } from './InlineError';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { formatNumber } from './model';

/** The recovery and sleep cutoffs the Reports insights use. Saved on this device only, on their own Save button. */
export const InsightCutoffsSection = () => {
  const { thresholds, save } = useInsightThresholds();
  const [rec, setRec] = useState(String(thresholds.recoveryCutoff));
  const [sleep, setSleep] = useState(String(thresholds.sleepCutoff));
  const [recError, setRecError] = useState<string | null>(null);
  const [sleepError, setSleepError] = useState<string | null>(null);

  const handleSave = () => {
    const r = parseFloat(rec.replace(',', '.'));
    const s = parseFloat(sleep.replace(',', '.'));
    const recBad = !(r > 0 && r <= 100);
    const sleepBad = !(s > 0 && s <= 24);
    setRecError(recBad ? 'Enter a recovery percentage from 1 to 100.' : null);
    setSleepError(sleepBad ? 'Enter hours of sleep from 1 to 24.' : null);
    if (recBad || sleepBad) { toast.error('Recovery must be 1–100% and sleep 1–24 hours'); return; }
    save({ recoveryCutoff: r, sleepCutoff: s });
    toast.success('Insight cutoffs saved');
  };

  const reset = () => {
    setRecError(null);
    setSleepError(null);
    setRec(String(DEFAULT_RECOVERY_CUTOFF));
    setSleep(String(DEFAULT_SLEEP_CUTOFF));
    save({ recoveryCutoff: DEFAULT_RECOVERY_CUTOFF, sleepCutoff: DEFAULT_SLEEP_CUTOFF });
  };

  return (
    <SettingsSection
      id="insight-cutoffs"
      icon={Activity}
      title="Insight cutoffs"
      headingLevel="h3"
      collapsible
      summary={`High recovery from ${formatNumber(thresholds.recoveryCutoff)}% \u00b7 short sleep under ${formatNumber(thresholds.sleepCutoff)} h`}
    >
      <SettingsRow
        label="High recovery"
        htmlFor="rec-cut"
        description="Percent from 1 to 100. Days at or above this recovery count as high-recovery days in the Reports insights and the dashboard summary."
        descriptionId="rec-cut-hint"
      >
        <Input
          id="rec-cut"
          inputMode="decimal"
          value={rec}
          onChange={(e) => { setRec(e.target.value.replace(',', '.')); setRecError(null); }}
          aria-invalid={recError ? true : undefined}
          aria-describedby={recError ? 'rec-cut-hint rec-cut-error' : 'rec-cut-hint'}
          className={cn('sm:max-w-[12rem]', recError && 'border-destructive')}
        />
        <InlineError id="rec-cut-error" message={recError} />
      </SettingsRow>
      <SettingsRow label="Short sleep" htmlFor="sleep-cut" description="Hours from 1 to 24. Nights under this many hours count as short sleep." descriptionId="sleep-cut-hint">
        <Input
          id="sleep-cut"
          inputMode="decimal"
          value={sleep}
          onChange={(e) => { setSleep(e.target.value.replace(',', '.')); setSleepError(null); }}
          aria-invalid={sleepError ? true : undefined}
          aria-describedby={sleepError ? 'sleep-cut-hint sleep-cut-error' : 'sleep-cut-hint'}
          className={cn('sm:max-w-[12rem]', sleepError && 'border-destructive')}
        />
        <InlineError id="sleep-cut-error" message={sleepError} />
      </SettingsRow>
      <div className="space-y-3 pt-5">
        <p className="text-sm text-muted-foreground">Saved on this device only.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={handleSave}>Save cutoffs</Button>
          <Button type="button" variant="outline" onClick={reset}>Reset to defaults</Button>
        </div>
      </div>
    </SettingsSection>
  );
};
