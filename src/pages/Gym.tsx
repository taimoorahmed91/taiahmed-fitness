import { useState, useMemo, useEffect, useRef } from 'react';
import { useUser } from '@/contexts/UserContext';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import {
  claimQuarantined, defaultStorage, discardQuarantined, draftExercises, resolveDraft,
  type DraftResolution, type QuarantinedWorkout,
} from '@/lib/workoutDraft';
import { useSearchParams } from 'react-router-dom';
import { readTabParam, withTabParam } from '@/lib/urlTab';
import { useSharedTableState } from '@/lib/sharedTable';
import { daysSinceTemplate, isRecentlyDone } from '@/lib/recentTemplate';
import { GymForm } from '@/components/GymForm';
import { PageContainer, PageHeader, PageSection } from '@/components/layout/Page';
import { GymList } from '@/components/GymList';
import { DataFilter } from '@/components/DataFilter';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useDataFilter } from '@/hooks/useDataFilter';
import { useWorkoutTemplates, WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { WorkoutTemplateList } from '@/components/WorkoutTemplateList';
import { ActiveWorkoutModal } from '@/components/ActiveWorkoutModal';
import { EditTemplateModal } from '@/components/EditTemplateModal';
import { EditWorkoutSessionModal } from '@/components/EditWorkoutSessionModal';
import { PersonalRecordsList } from '@/components/PersonalRecordsList';
import { GymOverviewCard } from '@/components/GymOverviewCard';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useWhoopData } from '@/hooks/useWhoopData';
import { ReadinessBadge } from '@/components/ReadinessBadge';
import { lastSessionWithFallback } from '@/components/pwa/lastSessionFallback';
import { describeCachedTemplates } from '@/components/pwa/pwaFeedbackCopy';
import { GymSession } from '@/types';
import { formatDay } from '@/lib/historyDates';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CardSkeleton } from '@/components/feedback/CardSkeleton';
import { LoadingAnnouncement } from '@/components/feedback/LoadingAnnouncement';
import { PartialDataNotice } from '@/components/feedback/PartialDataNotice';
import { SectionUnavailable } from '@/components/feedback/SectionUnavailable';
import {
  GYM_LABELS,
  resolveGymData,
  resolveTemplatesState,
  sourceFromTable,
  type TemplatesLoadFlags,
} from '@/components/feedback/gymLoadState';
import { joinLabels } from '@/components/feedback/tableView';
import { Dumbbell, ClipboardList, PlayCircle, CalendarCheck, Play, Trophy, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

/** The open tab lives in the address (`/gym?tab=templates`) so refresh, shared links and Back/Forward keep it. */
const GYM_TABS = ['log', 'templates', 'records'] as const;
type GymTab = (typeof GYM_TABS)[number];
// "Log Workout" stays the default: it is the screen people open Gym for, and it is the one that was always first.
const DEFAULT_GYM_TAB: GymTab = 'log';

/** The paused workout, exactly as it was saved (its own exercise list), not as a template looks today. */
type PausedWorkoutInfo = { templateId: string; templateName: string; exercises: string[] };

type DraftView = {
  paused: PausedWorkoutInfo | null;
  status: DraftResolution['status'];
  legacyPending: boolean;
  claimable: QuarantinedWorkout[];
};

// Reads this account's paused workout (and tidies storage so only the signed-in account's own draft is in the
// shared slot). Another account's workout is set aside, never shown or resumed here.
const readDraftView = (userId: string | null, templateIds: ReadonlySet<string>, templatesReady: boolean): DraftView => {
  const resolution = resolveDraft(defaultStorage(), userId, { knownTemplateIds: templateIds, deferLegacy: !templatesReady });
  const state = resolution.draft?.state;
  return {
    paused: state
      ? { templateId: state.templateId, templateName: state.templateName ?? '', exercises: draftExercises(state) ?? [] }
      : null,
    status: resolution.status,
    legacyPending: resolution.legacyPending,
    claimable: resolution.claimable,
  };
};

const pausedAsTemplate = (info: PausedWorkoutInfo): WorkoutTemplate =>
  ({ id: info.templateId, name: info.templateName || 'Workout', exercises: info.exercises }) as WorkoutTemplate;

/** Plain sentence for a part of the screen that is paused because some of its data never loaded. */
const pausedText = (missing: readonly string[]) =>
  `Needs your ${joinLabels(missing) || 'data'}, which didn't load. Use Try again at the top of the page.`;

const Gym = () => {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const gymData = useGymSessions();
  const { sessions, addSession, deleteSession, updateSession, getLastSessionByTemplateName, refetch: refetchSessions } = gymData;
  const templatesHook = useWorkoutTemplates();
  const { templates, addTemplate, updateTemplate, deleteTemplate, refetch: refetchTemplates, isCached, cachedAt, getCachedLastSession } = templatesHook;

  // What each list may honestly say. Sessions: the real state of the shared table (loading, failed first load,
  // loaded). Templates: the hook's explicit flags (loading / error / loadFailed / refreshFailed). A failed first
  // load is never shown as "no workouts" or "no templates", and rows kept after a failed refresh stay visible.
  const sessionsTable = useSharedTableState('gym_sessions');
  const templateFlags: typeof templatesHook & TemplatesLoadFlags = templatesHook;
  const templatesState = resolveTemplatesState({
    loading: templatesHook.loading,
    loadFailed: templateFlags.loadFailed,
    refreshFailed: templateFlags.refreshFailed,
    error: templateFlags.error,
    count: templates.length,
  });
  const gymState = resolveGymData({ sessions: sourceFromTable(sessionsTable), templates: templatesState });
  const { sections } = gymState;
  const sessionsLoading = sections.history.view === 'loading';
  const templatesLoading = templatesState.view === 'loading';
  // Templates are certain only once they loaded: until then a paused workout from before templates were tied to
  // accounts is kept (not guessed at) and "Today" says nothing.
  const templatesReady = templatesState.view === 'ready';

  // Reload only what failed or kept stale rows. Each refetch joins a fetch that is already running.
  const retryGym = async () => {
    const needs = new Set([...gymState.failed, ...gymState.stale]);
    await Promise.all([
      needs.has('sessions') ? refetchSessions() : undefined,
      needs.has('templates') ? refetchTemplates() : undefined,
    ]);
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readTabParam<GymTab>(searchParams, GYM_TABS, DEFAULT_GYM_TAB);
  // A new history entry per change, so Back returns to the previous tab.
  const handleTabChange = (next: string) => {
    if (!(GYM_TABS as readonly string[]).includes(next)) return;
    setSearchParams((prev) => withTabParam(prev, next as GymTab, DEFAULT_GYM_TAB));
  };
  // Network first; this device's saved copy only when the network gives nothing (offline / poor signal).
  const getLastSession = (templateName: string) =>
    lastSessionWithFallback(templateName, getLastSessionByTemplateName, getCachedLastSession);
  const cachedNotice = isCached ? describeCachedTemplates(cachedAt, Date.now()) : null;
  const { data: personalData } = usePersonalData();
  const { entries: whoopEntries } = useWhoopData();
  // WHOOP syncs lag a day, so use the most recent recovery within the last 2 days.
  const latestRecovery = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const cutoff = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const latest = [...whoopEntries]
      .filter((e) => e.recovery_score != null && e.date <= today && e.date >= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) return { score: null as number | null, label: undefined as string | undefined };
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    const label = latest.date === today ? undefined : latest.date === yesterday ? 'yesterday' : formatDay(latest.date, today);
    return { score: latest.recovery_score as number, label };
  }, [whoopEntries]);
  const todayRecovery = latestRecovery.score;
  const [editingSession, setEditingSession] = useState<GymSession | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<WorkoutTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null);
  const [draftView, setDraftView] = useState<DraftView>(() => readDraftView(userId, new Set(), false));
  const pausedWorkout = draftView.paused;
  const [blockedStart, setBlockedStart] = useState<{ requested: WorkoutTemplate; existing: PausedWorkoutInfo } | null>(null);
  // The account that opened the workout on screen. If the signed-in account changes, the workout closes (its
  // saved copy stays with the account that owns it).
  const openedByRef = useRef<string | null>(null);

  const refreshDraft = (): DraftView => {
    const view = readDraftView(userId, new Set(templates.map((t) => t.id)), templatesReady);
    setDraftView(view);
    return view;
  };

  const openWorkout = (tpl: WorkoutTemplate | null) => {
    openedByRef.current = tpl ? userId : null;
    setActiveTemplate(tpl);
  };

  // Re-check the paused workout when the modal closes, the account or templates change, or the window regains focus.
  useEffect(() => {
    refreshDraft();
    window.addEventListener('focus', refreshDraft);
    window.addEventListener('storage', refreshDraft);
    return () => {
      window.removeEventListener('focus', refreshDraft);
      window.removeEventListener('storage', refreshDraft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate, userId, templates, templatesReady]);

  // A different account must never keep (or save) someone else's workout or edits.
  useEffect(() => {
    if (openedByRef.current !== userId) setActiveTemplate(null);
    setEditingSession(null);
    setEditingTemplate(null);
    setBlockedStart(null);
  }, [userId]);

  const {
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    dateRange,
    setDateRange,
    filteredData: filteredSessions,
  } = useDataFilter({
    data: sessions,
    searchFields: ['exercise', 'notes'] as (keyof GymSession)[],
    dateField: 'date' as keyof GymSession,
  });

  const handleEditClick = (session: GymSession) => {
    setEditingSession(session);
  };

  const handleStartWorkout = (template: WorkoutTemplate) => {
    if (activeTemplate) {
      // Modal already open
      if (activeTemplate.id === template.id) return;
      setBlockedStart({
        requested: template,
        existing: { templateId: activeTemplate.id, templateName: activeTemplate.name, exercises: activeTemplate.exercises },
      });
      return;
    }
    const existing = refreshDraft().paused;
    if (existing) {
      // Same template paused: resume the saved workout (its own saved exercises), not the template as it looks now.
      if (existing.templateId === template.id) {
        openWorkout(pausedAsTemplate(existing));
        return;
      }
      // Different template paused: show centered prompt with resume option
      setBlockedStart({ requested: template, existing });
      return;
    }
    openWorkout(template);
  };

  const handleStartManualWorkout = (name: string) => {
    const manualTemplate: WorkoutTemplate = {
      id: `manual-${Date.now()}`,
      name: name || 'Workout',
      exercises: [],
    } as WorkoutTemplate;

    if (activeTemplate) {
      setBlockedStart({
        requested: manualTemplate,
        existing: { templateId: activeTemplate.id, templateName: activeTemplate.name, exercises: activeTemplate.exercises },
      });
      return;
    }
    const existing = refreshDraft().paused;
    if (existing) {
      setBlockedStart({ requested: manualTemplate, existing });
      return;
    }
    openWorkout(manualTemplate);
  };

  const handleResumePaused = () => {
    const info = pausedWorkout ?? blockedStart?.existing;
    if (!info) return;
    setBlockedStart(null);
    openWorkout(pausedAsTemplate(info));
  };

  // After a refresh, reopen an interrupted workout automatically (once), as soon as it is certain which
  // saved workout belongs to this account.
  const autoResumed = useRef(false);
  useEffect(() => {
    if (autoResumed.current || activeTemplate || draftView.legacyPending) return;
    autoResumed.current = true;
    if (draftView.paused) openWorkout(pausedAsTemplate(draftView.paused));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftView]);

  const handleRestoreQuarantined = (id: string) => {
    const result = claimQuarantined(defaultStorage(), userId, id);
    if (result.ok === true) toast.success('Workout restored to your account.');
    else if (result.reason === 'busy') toast.error('Finish or discard your paused workout first, then restore this one.');
    else toast.error("Couldn't restore that workout. It is still kept on this device.");
    refreshDraft();
  };

  const handleDiscardQuarantined = (id: string): boolean => {
    const ok = discardQuarantined(defaultStorage(), id);
    refreshDraft();
    return ok;
  };

  const handleFinishWorkout = async (data: { exercise: string; duration: number; date: string; notes?: string; start_time?: string; end_time?: string }, ownerId: string | null): Promise<boolean> => {
    try {
      await addSession(data, { expectedUserId: ownerId });
      toast.success('Workout logged!');
      return true;
    } catch {
      return false;
    }
  };

  const handleEditTemplate = (template: WorkoutTemplate) => {
    setEditingTemplate(template);
  };

  // Resolves true only when the change was confirmed, so the edit dialog knows whether it may close.
  const handleSaveTemplate = (id: string, updates: { name: string; exercises: string[] }): Promise<boolean> =>
    updateTemplate(id, updates);

  // Rejects when the template was not created, so the create form keeps what was typed.
  const handleCreateTemplate = async (template: { name: string; exercises: string[] }): Promise<void> => {
    if (!(await addTemplate(template))) throw new Error('Template was not created');
  };

  // Parse notes to extract exercise names for creating template
  const parseNotesToExercises = (notes: string | undefined): string[] => {
    if (!notes) return [];
    
    // Notes format: "Exercise1: S1:12 S2:10 | Exercise2: S1:15 S2:12"
    const exerciseParts = notes.split(' | ');
    const exercises: string[] = [];
    
    for (const part of exerciseParts) {
      const colonIndex = part.indexOf(':');
      if (colonIndex !== -1) {
        const exerciseName = part.substring(0, colonIndex).trim();
        if (exerciseName) {
          exercises.push(exerciseName);
        }
      }
    }
    
    return exercises;
  };

  const handleCreateTemplateFromSession = async (session: GymSession) => {
    // Try to extract exercises from notes first
    let exercises = parseNotesToExercises(session.notes);
    
    // If no exercises found in notes, use the exercise name as a single exercise
    if (exercises.length === 0) {
      exercises = [session.exercise];
    }
    
    // Create template with the session's exercise name as the template name
    const created = await addTemplate({
      name: session.exercise,
      exercises,
    });

    if (created) toast.success(`Template "${session.exercise}" created with ${exercises.length} exercise(s)`);
  };


  return (
    <PageContainer className="min-w-0">
      <PageHeader icon={Dumbbell} title="Gym Schedule" description="Log your workouts and track your progress" />
      <LoadingAnnouncement loading={sessionsLoading || templatesLoading} label="Loading workouts" />

      {/* One persistent notice (not a toast): what never loaded (those parts are paused) and what shows earlier data. */}
      <PartialDataNotice
        failed={gymState.failed.map((source) => GYM_LABELS[source])}
        stale={gymState.stale.map((source) => GYM_LABELS[source])}
        onRetry={retryGym}
      />

      {draftView.status === 'unreadable' && !activeTemplate && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent role="alert" className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">Can't read the workout saved on this device</p>
                <p className="text-sm text-muted-foreground">
                  This browser is blocking storage (for example private browsing), so a paused workout can't be shown or resumed here.
                  Nothing was deleted. Allow site storage, then try again.
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" size="touch" className="w-full sm:w-auto" onClick={() => refreshDraft()}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {draftView.claimable.map((q) => (
        <Card key={q.id} className="border-chart-warn/50">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-chart-warn" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium break-words">Saved workout found: {q.state?.templateName || 'Untitled workout'}</p>
                <p className="text-sm text-muted-foreground">
                  It was saved on this device before workouts were tied to accounts, so we can't tell whose it is.
                  Restore it only if it is yours. It is kept safely either way.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button type="button" size="touch" onClick={() => handleRestoreQuarantined(q.id)}>Restore to my account</Button>
              <ConfirmDeleteButton
                size="touch"
                variant="outline"
                onConfirm={() => handleDiscardQuarantined(q.id)}
                confirmationTitle="Discard this saved workout?"
                confirmationDescription={`The saved workout “${q.state?.templateName || 'Untitled workout'}” and everything recorded in it will be deleted from this device. This cannot be undone.`}
                confirmLabel="Yes, discard it"
              >
                Discard
              </ConfirmDeleteButton>
            </div>
          </CardContent>
        </Card>
      ))}

      {pausedWorkout && !activeTemplate && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <PlayCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">Paused workout in progress</p>
                <p className="break-words text-sm text-muted-foreground">
                  {pausedWorkout.templateName || 'Untitled workout'}
                </p>
              </div>
            </div>
            <Button size="touch" className="w-full sm:w-auto" onClick={handleResumePaused}>Resume workout</Button>
          </CardContent>
        </Card>
      )}



      {(() => {
        // "Already done today" is worked out from saved sessions and the planned template, so say nothing until both
        // have loaded (and nothing at all if either failed: the notice above explains and offers Try again).
        if (sections.today.view !== 'ready') return null;
        // Weekday of the UTC calendar day, the same day `todayStr` (and the sessions' dates) use.
        const todayStr = new Date().toISOString().split('T')[0];
        const dow = new Date(`${todayStr}T00:00:00Z`).getUTCDay();
        if (!(personalData.workout_days || []).includes(dow)) return null;
        const tplId = personalData.workout_day_templates?.[String(dow)];
        const tpl = tplId ? templates.find((t) => t.id === tplId) : undefined;
        if (!tpl) return null;
        const doneToday = sessions.some(
          (s) => s.date === todayStr && s.exercise?.trim().toLowerCase() === tpl.name.trim().toLowerCase()
        );
        const daysAgo = daysSinceTemplate(sessions, tpl.name, todayStr);
        const recent = !doneToday && isRecentlyDone(daysAgo);
        return (
          <Card className={recent ? 'border-accent-foreground/50' : 'border-primary/40'}>
            <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <CalendarCheck className={`h-5 w-5 shrink-0 ${recent ? 'text-accent-foreground' : 'text-primary'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium break-words">Today: {tpl.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {doneToday
                      ? 'Already done today — nice work.'
                      : recent
                        ? `Done ${daysAgo === 1 ? 'yesterday' : '2 days ago'} — less than 48 hours since this routine. Try something different today.`
                        : `${tpl.exercises.length} exercise${tpl.exercises.length !== 1 ? 's' : ''} planned`}
                  </p>
                </div>
              </div>
              <Button variant={doneToday || recent ? 'outline' : 'default'} size="touch" className="w-full sm:w-auto" onClick={() => handleStartWorkout(tpl)}>
                <Play aria-hidden="true" />
                {doneToday ? 'Start again' : recent ? 'Start anyway' : 'Start workout'}
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      <ReadinessBadge score={todayRecovery} dateLabel={latestRecovery.label} />

      {cachedNotice && (
        <div
          role="status"
          data-offline-templates-notice
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-chart-warn/50 px-3 py-2 text-sm"
        >
          <p className="min-w-0 flex-1 basis-64">
            <span className="font-medium">{cachedNotice.title}.</span>{' '}
            <span className="text-muted-foreground">{cachedNotice.body}</span>
          </p>
          <Button type="button" variant="outline" size="touch" onClick={() => void refetchTemplates()}>
            Try again
          </Button>
        </div>
      )}

      <PageSection title="Workouts" hideTitle>
        <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
          {/* Three equal columns with the icon above the label on phones, so nothing wraps or overflows at 320px. */}
          <TabsList className="grid h-auto w-full grid-cols-3 sm:max-w-lg">
            <TabsTrigger value="log" className="min-h-11 flex-col gap-1 px-1 text-xs sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <Dumbbell className="h-4 w-4" aria-hidden="true" />
              Log Workout
            </TabsTrigger>
            <TabsTrigger value="templates" className="min-h-11 flex-col gap-1 px-1 text-xs sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="records" className="min-h-11 flex-col gap-1 px-1 text-xs sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <Trophy className="h-4 w-4" aria-hidden="true" />
              Records
            </TabsTrigger>
          </TabsList>

          <TabsContent value="log" className="space-y-6 mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <GymForm onStart={handleStartManualWorkout} />
            
              {sections.history.view === 'loading' ? (
                <CardSkeleton bodyClassName="h-40" />
              ) : sections.history.view === 'error' ? (
                <SectionUnavailable
                  title="Workout overview is paused"
                  description={pausedText(sections.history.missing)}
                  minHeightClassName="min-h-[12rem]"
                />
              ) : (
                <GymOverviewCard sessions={sessions} workoutDays={personalData.workout_days || []} />
              )}
            </div>

            {/* Filter and List. Loading and failed loads get their own message; GymList's empty text is only for a real empty history. */}
            {sections.history.view === 'loading' ? (
              <div className="space-y-6" aria-hidden="true">
                <CardSkeleton noHeader bodyClassName="h-12" />
                <CardSkeleton bodyClassName="h-48" />
              </div>
            ) : sections.history.view === 'error' ? (
              <SectionUnavailable
                title="Workout history is paused"
                description={pausedText(sections.history.missing)}
                minHeightClassName="min-h-[12rem]"
              />
            ) : (
              <>
                <DataFilter
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  timeFilter={timeFilter}
                  onTimeFilterChange={setTimeFilter}
                  searchPlaceholder="Search workouts..."
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  showDateRange
                />

                <GymList
                  sessions={filteredSessions}
                  allSessions={sessions}
                  onDelete={deleteSession}
                  onEdit={handleEditClick}
                  onCreateTemplate={handleCreateTemplateFromSession}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-6 mt-6">
            {sections.templates.view === 'loading' ? (
              <div aria-hidden="true">
                <CardSkeleton bodyClassName="h-40" />
              </div>
            ) : sections.templates.view === 'error' ? (
              // The template cards also show how often each one was run, so they wait for the history too.
              <SectionUnavailable
                title="Workout templates are paused"
                description={`${pausedText(sections.templates.missing)} You can still start a workout from the Log Workout tab.`}
                minHeightClassName="min-h-[14rem]"
              />
            ) : (
              <WorkoutTemplateList
                templates={templates}
                sessions={sessions}
                onCreate={handleCreateTemplate}
                onDelete={deleteTemplate}
                onStart={handleStartWorkout}
                onEdit={handleEditTemplate}
              />
            )}
          </TabsContent>

          <TabsContent value="records" className="space-y-6 mt-6">
            {sections.records.view === 'loading' ? (
              <div aria-hidden="true">
                <CardSkeleton bodyClassName="h-40" />
              </div>
            ) : sections.records.view === 'error' ? (
              <SectionUnavailable
                title="Personal records are paused"
                description={pausedText(sections.records.missing)}
                minHeightClassName="min-h-[14rem]"
              />
            ) : (
              <PersonalRecordsList sessions={sessions} templates={templates} />
            )}
          </TabsContent>
        </Tabs>
      </PageSection>

      {/* Edit Workout Modal */}
      <EditWorkoutSessionModal
        session={editingSession}
        open={!!editingSession}
        onClose={() => setEditingSession(null)}
        onSave={updateSession}
      />

      {/* Active Workout Modal */}
      <ActiveWorkoutModal
        template={activeTemplate}
        open={!!activeTemplate}
        onClose={() => openWorkout(null)}
        onFinish={handleFinishWorkout}
        getLastSession={getLastSession}
        historySessions={sessions}
        recoveryScore={todayRecovery}
      />

      {/* Edit Template Modal */}
      <EditTemplateModal
        template={editingTemplate}
        open={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSave={handleSaveTemplate}
      />

      {/* Centered blocking prompt when another workout is already in progress */}
      <Dialog open={!!blockedStart} onOpenChange={(o) => !o && setBlockedStart(null)}>
        <DialogContent layout="scroll" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workout already in progress</DialogTitle>
            <DialogDescription>
              You have a paused workout
              {blockedStart?.existing.templateName ? ` "${blockedStart.existing.templateName}"` : ''}.
              Resume it or close it before starting
              {blockedStart?.requested.name ? ` "${blockedStart.requested.name}"` : ' a new one'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0 sm:gap-2">
            <Button variant="outline" size="touch" onClick={() => setBlockedStart(null)}>
              Cancel
            </Button>
            <Button size="touch" onClick={handleResumePaused}>Resume existing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default Gym;
