import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, CircleDot, Flame, User } from 'lucide-react';
import { toast } from 'sonner';
import { PageContainer, PageHeader, PageLoading, PageSection } from '@/components/layout/Page';
import { DataLoadError } from '@/components/feedback/DataLoadError';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePersonalData } from '@/hooks/usePersonalData';
import { usePersonalDataHistory } from '@/hooks/usePersonalDataHistory';
import { useWeight } from '@/hooks/useWeight';
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates';
import { ApiTokenSection } from '@/components/personal-data/ApiTokenSection';
import { BmiMeter } from '@/components/personal-data/BmiMeter';
import { InsightCutoffsSection } from '@/components/personal-data/InsightCutoffsSection';
import { ProfileSummary } from '@/components/personal-data/ProfileSummary';
import { RangeField } from '@/components/personal-data/RangeField';
import { RestTimersSection } from '@/components/personal-data/RestTimersSection';
import { ScheduleEditor } from '@/components/personal-data/ScheduleEditor';
import { FieldLabel, SettingsRow } from '@/components/personal-data/SettingsRow';
import { SettingsSection } from '@/components/personal-data/SettingsSection';
import { ValueHistory } from '@/components/personal-data/ValueHistory';
import {
  buildProfileSummary, buildSavePayload, calcAge, draftFromData, findRangeError, isDraftDirty,
  parseNumber, rangeHistoryRows, sanitizeNumericInput, singleHistoryRows, type PersonalDraft,
} from '@/components/personal-data/model';

/**
 * Personal Data: one page, read top to bottom.
 *
 *   1. Your settings at a glance          what is SAVED now (read only), with Edit links to the sections below
 *   2. Profile & body                     always open. name, birth date and age, gender, height, target weight (+ history), BMI
 *   3. Nutrition targets                  always open. gym-day and rest-day calories, protein and carbs, each a Min/Max range (+ history)
 *   4. Training schedule                  always open. weekday checkboxes with a workout template per day
 *      Save bar                           ONE Save for sections 2 to 4, and a plain "unsaved changes" status
 *   5. More settings (separate Saves)     collapsed cards that always show their current value in one line:
 *        Workout rest timers (account), Insight cutoffs (this device), MCP token (account)
 *
 * Load states: a FIRST load that failed shows an error with Try again instead of the summary and form (the values are
 * unknown, so nothing says "Not set" or "All changes saved"). A failed refresh keeps the form and its unsaved edits and
 * adds a notice. A true empty profile still shows the setup form.
 *
 * Sections 2 to 4 are never collapsed because their current values are the point of the page; only the
 * occasional settings in 5 fold away. History lives next to the value it belongs to, not in a list of its own.
 */
const PersonalDataPage = () => {
  const { data, loading, save, refetch, phase, loadFailed, refreshFailed } = usePersonalData();
  const { historyFor, refetch: refetchHistory } = usePersonalDataHistory();
  const { entries: weightEntries } = useWeight();
  const currentWeight = weightEntries[0]?.weight ?? null;
  const { templates } = useWorkoutTemplates();
  const templateIds = useMemo(() => templates.map((t) => t.id), [templates]);

  const [draft, setDraft] = useState<PersonalDraft>(() => draftFromData(data));
  const [saving, setSaving] = useState(false);

  // A failed first load wins even while a retry runs, so the error stays on screen until data really arrives.
  const view: 'loading' | 'error' | 'ready' = loadFailed ? 'error' : loading || phase === 'loading' ? 'loading' : 'ready';

  // When newly loaded data arrives, the form follows it, unless the person has unsaved edits: those are never replaced.
  const baselineRef = useRef(data);
  const templateIdsRef = useRef(templateIds);
  templateIdsRef.current = templateIds;
  useEffect(() => {
    const previous = baselineRef.current;
    baselineRef.current = data;
    setDraft((current) => (isDraftDirty(current, previous, templateIdsRef.current) ? current : draftFromData(data)));
  }, [data]);

  const patch = (p: Partial<PersonalDraft>) => setDraft((d) => ({ ...d, ...p }));
  /** Typed number fields accept digits and one dot (a comma turns into a dot); anything else is ignored. */
  const numeric = (key: keyof PersonalDraft) => (value: string) => {
    const next = sanitizeNumericInput(value);
    if (next !== null) patch({ [key]: next } as Partial<PersonalDraft>);
  };

  const handleDobChange = (dob: string) => {
    const age = calcAge(dob);
    patch(age !== null ? { dob, age: String(age) } : { dob });
  };

  const handleSave = async () => {
    const rangeError = findRangeError(draft);
    if (rangeError) {
      toast.error(rangeError);
      return;
    }
    setSaving(true);
    const payload = buildSavePayload(draft, templateIds);
    const { error } = await save(payload);
    setSaving(false);
    if (error) toast.error('Failed to save personal data');
    else {
      // What was saved is now the baseline: show it as saved, even if the reload that follows is still running.
      setDraft(draftFromData(payload));
      toast.success('Personal data saved');
      refetchHistory();
    }
  };

  const dirty = isDraftDirty(draft, data, templateIds);
  const summary = useMemo(() => buildProfileSummary(data, currentWeight, templates.length), [data, currentWeight, templates.length]);
  const targetWeightHistory = singleHistoryRows(historyFor('target_weight_kg'));
  const gymHistory = rangeHistoryRows(historyFor('gym_day_calorie_target'), historyFor('gym_day_calorie_target_max'));
  const restHistory = rangeHistoryRows(historyFor('rest_day_calorie_target'), historyFor('rest_day_calorie_target_max'));

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        icon={User}
        title="Personal Data"
        description="Your profile, nutrition targets and training schedule"
      />

      {view === 'loading' ? (
        <PageLoading label="Loading personal data" rows={3} />
      ) : view === 'error' ? (
        <DataLoadError
          title="We couldn't load your personal data"
          description="Your saved profile, targets and schedule are safe and nothing was changed. They will show here once they load."
          onRetry={refetch}
          minHeightClassName="min-h-[16rem]"
        />
      ) : (
        <>
          {/* A refresh failed but everything below is the last good data (and any edits not yet saved). */}
          {refreshFailed && <StaleDataNotice subject="your personal data" onRetry={refetch} />}
          <ProfileSummary model={summary} />

          <div className="space-y-6">
            <SettingsSection
              id="profile"
              icon={User}
              title="Profile & body"
              description="Who you are and the body measurements your targets are based on."
            >
              <SettingsRow label="Name" htmlFor="fullName">
                <Input
                  id="fullName"
                  value={draft.fullName}
                  onChange={(e) => patch({ fullName: e.target.value })}
                  placeholder="Full name"
                  className="md:max-w-md"
                />
              </SettingsRow>

              <SettingsRow
                label="Date of birth and age"
                labelId="birth-label"
                description="Age fills in by itself when you pick a date of birth."
                descriptionId="age-hint"
              >
                <div role="group" aria-labelledby="birth-label" className="grid grid-cols-1 gap-3 sm:max-w-md sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
                    <Input id="dob" type="date" value={draft.dob} onChange={(e) => handleDobChange(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="age">Age (years)</FieldLabel>
                    <Input
                      id="age"
                      inputMode="numeric"
                      value={draft.age}
                      onChange={(e) => numeric('age')(e.target.value)}
                      aria-describedby="age-hint"
                    />
                  </div>
                </div>
              </SettingsRow>

              <SettingsRow label="Gender" labelId="gender-label">
                <RadioGroup
                  value={draft.gender}
                  onValueChange={(gender) => patch({ gender })}
                  aria-labelledby="gender-label"
                  className="flex flex-wrap gap-x-6"
                >
                  <div className="flex min-h-11 items-center gap-2">
                    <RadioGroupItem value="M" id="g-m" />
                    <Label htmlFor="g-m" className="flex min-h-11 min-w-11 cursor-pointer items-center">Male</Label>
                  </div>
                  <div className="flex min-h-11 items-center gap-2">
                    <RadioGroupItem value="F" id="g-f" />
                    <Label htmlFor="g-f" className="flex min-h-11 min-w-11 cursor-pointer items-center">Female</Label>
                  </div>
                </RadioGroup>
              </SettingsRow>

              <SettingsRow
                label="Height and target weight"
                labelId="body-label"
                description="Changes to your target weight are kept in a history."
              >
                <div role="group" aria-labelledby="body-label" className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:max-w-sm [&>*]:min-w-0">
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="height">Height (cm)</FieldLabel>
                      <Input
                        id="height"
                        inputMode="decimal"
                        value={draft.height}
                        onChange={(e) => numeric('height')(e.target.value)}
                        placeholder="e.g. 175"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="target">Target weight (kg)</FieldLabel>
                      <Input
                        id="target"
                        inputMode="decimal"
                        value={draft.targetWeight}
                        onChange={(e) => numeric('targetWeight')(e.target.value)}
                        placeholder="e.g. 75.5"
                      />
                    </div>
                  </div>
                  <ValueHistory rows={targetWeightHistory} unit="kg" label="Target weight" />
                </div>
              </SettingsRow>

              <SettingsRow
                label="Body mass index"
                description="Worked out from the height above and your latest logged weight."
              >
                <BmiMeter heightCm={parseNumber(draft.height)} weightKg={currentWeight} />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection
              id="targets"
              icon={Flame}
              title="Nutrition targets"
              description="Daily ranges your meals are compared against. Each one is a minimum and a maximum."
            >
              <RangeField
                label="Gym day calories"
                description="Your daily range on days you log a workout."
                unit="kcal"
                min={draft.gymMin}
                max={draft.gymMax}
                onMin={numeric('gymMin')}
                onMax={numeric('gymMax')}
                placeholders={['e.g. 2300', 'e.g. 2600']}
                emptyNote="Not set. The rest day target, then your daily calorie goal, is used instead."
                history={<ValueHistory rows={gymHistory} unit="kcal" label="Gym day calories" />}
              />
              <RangeField
                label="Rest day calories"
                description="Your daily range on days with no workout."
                unit="kcal"
                min={draft.restMin}
                max={draft.restMax}
                onMin={numeric('restMin')}
                onMax={numeric('restMax')}
                placeholders={['e.g. 1900', 'e.g. 2200']}
                emptyNote="Not set. The gym day target, then your daily calorie goal, is used instead."
                history={<ValueHistory rows={restHistory} unit="kcal" label="Rest day calories" />}
              />
              <RangeField
                label="Protein"
                description="Grams of protein for each kg of body weight."
                unit="g/kg"
                min={draft.proteinMin}
                max={draft.proteinMax}
                onMin={numeric('proteinMin')}
                onMax={numeric('proteinMax')}
                placeholders={['e.g. 1.8', 'e.g. 2.2']}
                emptyNote="Not set. No protein range is shown."
                bodyWeightKg={currentWeight}
              />
              <RangeField
                label="Carbs"
                description="Grams of carbs for each kg of body weight."
                unit="g/kg"
                min={draft.carbMin}
                max={draft.carbMax}
                onMin={numeric('carbMin')}
                onMax={numeric('carbMax')}
                placeholders={['e.g. 3', 'e.g. 4']}
                emptyNote="Not set. No carb range is shown."
                bodyWeightKg={currentWeight}
              />
            </SettingsSection>

            <SettingsSection
              id="schedule"
              icon={CalendarDays}
              title="Training schedule"
              description="The dashboard uses these days to tell workout days from rest days."
            >
              <SettingsRow
                label="Workout days and templates"
                labelId="workout-days-label"
                description={`${draft.workoutDays.length === 1 ? '1 workout day' : `${draft.workoutDays.length} workout days`} a week. A template is optional.`}
              >
                <div role="group" aria-labelledby="workout-days-label" className="space-y-2">
                  <ScheduleEditor
                    workoutDays={draft.workoutDays}
                    dayTemplates={draft.dayTemplates}
                    templates={templates}
                    onToggleDay={(day, on) =>
                      setDraft((d) => ({
                        ...d,
                        workoutDays: on ? [...d.workoutDays, day].sort((a, b) => a - b) : d.workoutDays.filter((x) => x !== day),
                      }))
                    }
                    onTemplate={(day, templateId) =>
                      setDraft((d) => {
                        const next = { ...d.dayTemplates };
                        if (templateId === null) delete next[String(day)];
                        else next[String(day)] = templateId;
                        return { ...d, dayTemplates: next };
                      })
                    }
                  />
                  {templates.length === 0 && (
                    <p className="text-sm text-muted-foreground">Create templates on the Gym page to assign them here.</p>
                  )}
                </div>
              </SettingsRow>
            </SettingsSection>

            <div className="flex flex-col gap-3 rounded-lg border bg-card p-[var(--card-pad)] shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p role="status" className="flex items-start gap-2 text-sm">
                {dirty ? (
                  <>
                    <CircleDot aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span><strong className="font-semibold">Unsaved changes.</strong> Save to update the summary at the top.</span>
                  </>
                ) : (
                  <>
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">All changes saved.</span>
                  </>
                )}
              </p>
              <Button onClick={handleSave} loading={saving} loadingText="Saving…" className="w-full sm:w-auto">
                Save profile, targets &amp; schedule
              </Button>
            </div>
          </div>
        </>
      )}

      <PageSection
        title="More settings"
        description="These save on their own, separately from the profile above. Open one to change it."
        className="space-y-4"
      >
        <div className="space-y-4">
          <RestTimersSection />
          <InsightCutoffsSection />
          <ApiTokenSection />
        </div>
      </PageSection>
    </PageContainer>
  );
};

export default PersonalDataPage;
