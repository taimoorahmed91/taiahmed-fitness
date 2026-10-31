import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserSettings } from '@/hooks/useUserSettings';
import { cn } from '@/lib/utils';
import { InlineError } from './InlineError';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

/** Rest between sets and between exercises. Saved to the account on its own Save button (so it follows you to every device). */
export const RestTimersSection = () => {
  const { settings, loading, updateRestTimers } = useUserSettings();
  const [setRest, setSetRest] = useState('');
  const [exerciseRest, setExerciseRest] = useState('');
  const [saving, setSaving] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setSetRest(String(settings.set_rest_seconds));
      setExerciseRest(String(settings.exercise_rest_seconds));
    }
  }, [loading, settings.set_rest_seconds, settings.exercise_rest_seconds]);

  const handleSave = async () => {
    const s = parseInt(setRest, 10);
    const e = parseInt(exerciseRest, 10);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 5 || e < 5 || s > 900 || e > 900) {
      toast.error('Enter values between 5 and 900 seconds');
      setRestError('Enter whole numbers between 5 and 900 seconds in both fields.');
      return;
    }
    setRestError(null);
    setSaving(true);
    await updateRestTimers(s, e);
    setSaving(false);
  };

  const summary = loading
    ? 'Loading your timers\u2026'
    : `${settings.set_rest_seconds} s between sets \u00b7 ${settings.exercise_rest_seconds} s between exercises`;

  return (
    <SettingsSection
      id="rest-timers"
      icon={Timer}
      title="Workout rest timers"
      headingLevel="h3"
      collapsible
      summary={summary}
    >
      <SettingsRow
        label="Between sets"
        htmlFor="set-rest"
        description="Seconds of rest after each set, from 5 to 900. Saved to your account, so every device uses it."
      >
        <Input
          id="set-rest"
          type="number"
          inputMode="numeric"
          min={5}
          max={900}
          value={setRest}
          onChange={(ev) => { setSetRest(ev.target.value); setRestError(null); }}
          aria-invalid={restError ? true : undefined}
          aria-describedby={restError ? 'rest-error' : undefined}
          className={cn('sm:max-w-[12rem]', restError && 'border-destructive')}
        />
      </SettingsRow>
      <SettingsRow label="Between exercises" htmlFor="exercise-rest" description="Seconds of rest before the next exercise starts, from 5 to 900.">
        <Input
          id="exercise-rest"
          type="number"
          inputMode="numeric"
          min={5}
          max={900}
          value={exerciseRest}
          onChange={(ev) => { setExerciseRest(ev.target.value); setRestError(null); }}
          aria-invalid={restError ? true : undefined}
          aria-describedby={restError ? 'rest-error' : undefined}
          className={cn('sm:max-w-[12rem]', restError && 'border-destructive')}
        />
      </SettingsRow>
      <div className="space-y-3 pt-5">
        <InlineError id="rest-error" message={restError} />
        <Button onClick={handleSave} loading={saving} loadingText="Saving…" disabled={loading} className="w-full sm:w-auto">
          Save rest timers
        </Button>
      </div>
    </SettingsSection>
  );
};
