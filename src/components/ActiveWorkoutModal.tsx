import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Check, Copy, Plus, Settings2, Timer, Trophy, Volume2, VolumeX } from 'lucide-react';
import { GymSession } from '@/types';
import { logActivity } from '@/hooks/useActivityLog';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/authSession';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import {
  clearDraft, defaultStorage, describePersistFailure, draftExercises, hasWorkoutData, resolveDraft, writeDraft,
  type PersistFailure,
} from '@/lib/workoutDraft';
import { workoutExerciseOrder } from '@/lib/workoutExerciseOrder';
import { exerciseVolume, bestWeights, isPersonalRecord, notesVolume, volumeChange } from '@/lib/workoutStats';
import {
  addExtraExercise, addVisibleSet, applySetUpdate, applyUseLastForSet, applyUseLastWeights, buildActiveWorkoutState,
  collectWorkoutEntries, extractWeightFromExerciseName, formatHHMM, formatSetLines, formatWorkoutNotes,
  hasAnySet, initialWorkoutData, parseNotesToPreviousReps, restoreWorkoutData,
  type ActiveWorkoutState, type AnyExerciseKey, type PreviousReps, type SetKey, type WorkoutData,
} from '@/lib/workoutSession';
import {
  REST_OVER_MESSAGE, restoreRestTimer, serializeRestTimer, shouldChime, startRest, transitionRestOver,
  type RestState, type RestType,
} from '@/lib/workoutTiming';
import { loadRestAlertEnabled, playRestAlert, saveRestAlertEnabled } from '@/lib/workoutRestAlert';
import { ReadinessBadge } from '@/components/ReadinessBadge';
import { OfflineBadge } from '@/components/OfflineBadge';
import { ElapsedClock, RestTimerPanel } from '@/components/workout/WorkoutClocks';
import { WorkoutExerciseCard } from '@/components/workout/WorkoutExerciseCard';

const NO_EXERCISES: string[] = [];
const REST_TIMER_SETTINGS_KEY = 'fittrack-rest-timer-settings';

interface RestTimerSettings {
  setRestSeconds: number;
  exerciseRestSeconds: number;
}

interface ActiveWorkoutModalProps {
  template: WorkoutTemplate | null;
  open: boolean;
  onClose: () => void;
  /** `ownerId` is the account the workout was recorded for; the saver must refuse if someone else is signed in now. */
  onFinish: (data: { exercise: string; duration: number; date: string; notes?: string; start_time?: string; end_time?: string }, ownerId: string | null) => Promise<boolean>;
  getLastSession?: (templateName: string) => Promise<GymSession | null>;
  historySessions?: GymSession[];
  recoveryScore?: number | null;
}

const DEFAULT_REST_TIMER_SETTINGS: RestTimerSettings = { setRestSeconds: 60, exerciseRestSeconds: 90 };

// Local cache only — the source of truth is fittrack_user_settings so the
// durations are identical on every device the user logs in from.
const loadRestTimerSettings = (): RestTimerSettings => {
  try {
    const saved = localStorage.getItem(REST_TIMER_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load rest timer settings:', e);
  }
  return DEFAULT_REST_TIMER_SETTINGS;
};

const saveRestTimerSettings = (settings: RestTimerSettings) => {
  try {
    localStorage.setItem(REST_TIMER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save rest timer settings on this device:', e);
  }
};

const fetchRestTimerSettings = async (): Promise<RestTimerSettings | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await supabase
    .from('fittrack_user_settings')
    .select('set_rest_seconds, exercise_rest_seconds')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as { set_rest_seconds?: number | null; exercise_rest_seconds?: number | null };
  return {
    setRestSeconds: row.set_rest_seconds ?? DEFAULT_REST_TIMER_SETTINGS.setRestSeconds,
    exerciseRestSeconds: row.exercise_rest_seconds ?? DEFAULT_REST_TIMER_SETTINGS.exerciseRestSeconds,
  };
};

const persistRestTimerSettings = async (settings: RestTimerSettings) => {
  const user = await getSessionUser();
  if (!user) return;
  await supabase
    .from('fittrack_user_settings')
    .update({
      set_rest_seconds: settings.setRestSeconds,
      exercise_rest_seconds: settings.exerciseRestSeconds,
    } as never)
    .eq('user_id', user.id);
};

type Debrief = { name: string; duration: number; volume: number; change: { diff: number; pct: number } | null; prs: string[]; completed: number; total: number; copyText: string };

export const ActiveWorkoutModal = ({ template, open, onClose, onFinish, getLastSession, historySessions = [], recoveryScore = null }: ActiveWorkoutModalProps) => {
  const { user } = useUser();
  const userIdRef = useRef<string | null>(user?.id ?? null);
  userIdRef.current = user?.id ?? null;
  // The account this workout belongs to, fixed when it is opened. Storage writes and the final save use it,
  // never "whoever is signed in right now".
  const ownerIdRef = useRef<string | null>(null);
  // Why saving to this device is failing (null = it is working). Shown as a persistent warning.
  const [persistFailure, setPersistFailure] = useState<PersistFailure | null>(null);
  const persistFailureRef = useRef<PersistFailure | null>(null);
  const latestStateRef = useRef<ActiveWorkoutState | null>(null);
  // The workout exactly as it was started (name + exercise list). A resumed workout keeps using THIS, never a
  // template that was edited or reordered meanwhile, because all entered data is keyed by exercise index.
  const [snapshot, setSnapshot] = useState<{ templateId: string; name: string; exercises: string[] } | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [restAlertOn, setRestAlertOn] = useState(loadRestAlertEnabled);
  const toggleRestAlert = () => setRestAlertOn((v) => {
    saveRestAlertEnabled(!v);
    return !v;
  });
  const allTimeBest = useMemo(
    () => bestWeights(historySessions.map((s) => parseNotesToPreviousReps(s.notes).reps as unknown as Record<string, Record<string, string | undefined>>)),
    [historySessions],
  );

  // Everything the user has entered. `dataRef` always holds the latest value so
  // handlers can run several pure updates in a row (Use Last) and stay stable.
  const [data, setData] = useState<WorkoutData>(() => initialWorkoutData(0));
  const dataRef = useRef(data);
  const commitData = useCallback((next: WorkoutData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const [previousReps, setPreviousReps] = useState<PreviousReps>({});
  const [previousNotes, setPreviousNotes] = useState<Record<string, string>>({});
  const [previousSequences, setPreviousSequences] = useState<Record<string, number>>({});
  const previousRepsRef = useRef(previousReps);
  previousRepsRef.current = previousReps;
  const previousNotesRef = useRef(previousNotes);
  previousNotesRef.current = previousNotes;
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  // Template id this screen has loaded (or started). Nothing is written to storage until it
  // matches the open template, so a finished/discarded workout can never leak into the next one.
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Add-exercise UI state
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');

  // Rest timer. This holds only start metadata (start time, length, type, running/over).
  // The ticking digits live inside <RestTimerPanel>, so a second passing re-renders nothing here.
  const [rest, setRest] = useState<RestState | null>(null);
  const restRef = useRef<RestState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const restAlertRef = useRef(restAlertOn);
  restAlertRef.current = restAlertOn;

  // Timer settings
  const [timerSettings, setTimerSettings] = useState<RestTimerSettings>(loadRestTimerSettings);
  const timerSettingsRef = useRef(timerSettings);
  timerSettingsRef.current = timerSettings;
  const [showSettings, setShowSettings] = useState(false);

  // Pull the authoritative durations from the user's account so every device
  // (phone, laptop) uses the same rest times.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchRestTimerSettings().then((remote) => {
      if (!cancelled && remote) {
        setTimerSettings(remote);
        saveRestTimerSettings(remote);
      }
    });
    return () => { cancelled = true; };
  }, [open]);

  // Keep a stable ref to getLastSession so the open/template effect doesn't
  // re-run every time the parent's sessions list updates (which would wipe
  // in-memory previousReps/previousSequences placeholders mid-workout).
  const getLastSessionRef = useRef(getLastSession);
  useEffect(() => { getLastSessionRef.current = getLastSession; }, [getLastSession]);

  const activeSnapshot = template && snapshot && snapshot.templateId === template.id ? snapshot : null;
  const baseExercises = activeSnapshot?.exercises ?? template?.exercises ?? NO_EXERCISES;
  const workoutName = activeSnapshot?.name ?? template?.name ?? '';

  // All exercises = the workout's own list (saved snapshot when resumed) + extras (added during this session only)
  const allExercises = useMemo(
    () => (template ? [...baseExercises, ...data.extraExercises] : []),
    [template, baseExercises, data.extraExercises],
  );
  const allExercisesRef = useRef(allExercises);
  allExercisesRef.current = allExercises;

  const setRestState = useCallback((next: RestState | null) => {
    restRef.current = next;
    setRest(next);
  }, []);

  // Save to this device when the workout data changes. Not on clock ticks: the stored rest timer is
  // just { startedAt, total, type }, and remaining time is recomputed from it on restore.
  // The result is never ignored: a failed write raises the visible warning below.
  const persist = useCallback((state: ActiveWorkoutState): boolean => {
    latestStateRef.current = state;
    const result = writeDraft(defaultStorage(), ownerIdRef.current, state);
    const failure = result.ok === false ? result.reason : null;
    persistFailureRef.current = failure;
    setPersistFailure(failure);
    return result.ok;
  }, []);

  useEffect(() => {
    if (!open || !template || !startTime || hydratedId !== template.id) return;
    persist(buildActiveWorkoutState({
      templateId: template.id,
      templateName: workoutName,
      exercises: baseExercises,
      startTime,
      data,
      previousSequences,
      expandedExercise,
      restTimer: serializeRestTimer(rest),
    }));
  }, [open, template, startTime, hydratedId, data, previousSequences, expandedExercise, rest, workoutName, baseExercises, persist]);

  // While nothing can be stored, leaving the page would lose the workout: ask the browser to confirm first.
  useEffect(() => {
    if (!open || !persistFailure) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasWorkoutData(dataRef.current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, persistFailure]);

  const retryPersist = () => {
    const state = latestStateRef.current;
    if (state && persist(state)) toast.success('Your progress is saved on this device again.');
  };

  useEffect(() => {
    let cancelled = false;
    if (!(open && template)) {
      setHydratedId(null);
      return;
    }
    // Only this account's own saved workout is ever loaded (see lib/workoutDraft.ts).
    ownerIdRef.current = userIdRef.current;
    latestStateRef.current = null;
    const resolution = resolveDraft(defaultStorage(), ownerIdRef.current, {
      knownTemplateIds: template.id.startsWith('manual-') ? undefined : new Set([template.id]),
    });
    const savedState = resolution.draft?.state ?? null;
    const restoring = !!savedState && savedState.templateId === template.id;
    // Resume from the saved snapshot so the saved sets still line up with the exercises they were typed for.
    const baseEx = restoring ? draftExercises(savedState) ?? template.exercises : template.exercises;
    const baseName = restoring ? savedState.templateName || template.name : template.name;
    setSnapshot({ templateId: template.id, name: baseName, exercises: baseEx });

    if (restoring) {
      commitData(restoreWorkoutData(savedState, baseEx.length));
      setStartTime(new Date(savedState.startTime));
      setExpandedExercise(savedState.expandedExercise ?? null);
      // Recompute from the original start time; expired timers are dropped.
      setRestState(restoreRestTimer(savedState.restTimer, Date.now()));
    } else {
      commitData(initialWorkoutData(baseEx.length));
      setStartTime(new Date());
      setExpandedExercise(0);
      setRestState(null);
      logActivity({ action: 'start_workout', category: 'gym', details: { template_name: baseName, exercises: baseEx } });
    }
    setAnnouncement('');
    setHydratedId(template.id);

    setPreviousReps({});
    setPreviousNotes({});
    setPreviousSequences(restoring ? savedState.previousSequences || {} : {});
    setShowAddExercise(false);
    setNewExerciseName('');

    if (getLastSessionRef.current) {
      const allEx = [...baseEx];
      getLastSessionRef.current(baseName).then((lastSession) => {
        if (cancelled) return;
        if (lastSession?.notes) {
          const parsed = parseNotesToPreviousReps(lastSession.notes);
          setPreviousReps(parsed.reps);
          setPreviousNotes(parsed.notes);
          // Keep the saved display order on resume; history only orders a new workout.
          if (!restoring || !savedState.previousSequences) {
            setPreviousSequences(parsed.sequences);
          }
          if (!restoring) {
            setExpandedExercise((current) => current === 0 ? workoutExerciseOrder(allEx, parsed.sequences)[0]?.index ?? null : current);
          }
          // Bump the default visible set count for any exercise whose previous
          // session logged more than 3 sets (capped at 6). Only raises counts —
          // never lowers a user's in-progress count.
          const current = dataRef.current;
          const counts = { ...current.exerciseSetCount };
          let changed = false;
          allEx.forEach((exName, idx) => {
            const prevCount = parsed.setCounts[exName];
            if (prevCount && prevCount > (counts[idx] || 3)) {
              counts[idx] = Math.min(6, prevCount);
              changed = true;
            }
          });
          if (changed) commitData({ ...current, exerciseSetCount: counts });
          // Note: previous reps/weights are shown as "last" context only — never pre-filled
          // into the actual inputs, so exercises don't appear "complete" and timestamps
          // still get recorded when the user enters their first rep.
        }
      });
    }
    return () => { cancelled = true; };
    // Intentionally exclude getLastSession from deps — it's recreated on every
    // sessions update (auto-refresh / realtime) and would otherwise wipe the
    // in-memory previousReps/previousSequences placeholders mid-workout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  const beginRest = useCallback((type: RestType) => {
    const s = timerSettingsRef.current;
    setRestState(startRest(type, type === 'set' ? s.setRestSeconds : s.exerciseRestSeconds, Date.now()));
    setAnnouncement('');
  }, [setRestState]);

  // The rest timer reached zero. Show "Rest over" and announce it once; sound is optional extra.
  const handleRestElapsed = useCallback((startedAt: number) => {
    const current = restRef.current;
    const result = transitionRestOver(current, startedAt);
    if (!result.announce || !current) return;
    setRestState(result.rest);
    setAnnouncement(REST_OVER_MESSAGE);
    if (restAlertRef.current && shouldChime(current.startedAt, current.total, Date.now())) playRestAlert();
  }, [setRestState]);

  const dismissRest = useCallback(() => {
    setRestState(null);
    setAnnouncement('');
  }, [setRestState]);

  const handleAddExercise = () => {
    const trimmed = newExerciseName.trim();
    if (!trimmed || !template) return;
    const result = addExtraExercise(dataRef.current, baseExercises.length, trimmed);
    commitData(result.data);
    setExpandedExercise(result.index);
    setNewExerciseName('');
    setShowAddExercise(false);
  };

  // --- Stable per-exercise handlers (all take the ORIGINAL exercise index) ---
  const handleToggle = useCallback((index: number, isOpen: boolean) => setExpandedExercise(isOpen ? index : null), []);

  const handleAddSet = useCallback((index: number) => {
    const next = addVisibleSet(dataRef.current, index);
    if (next !== dataRef.current) commitData(next);
  }, [commitData]);

  const handleUpdateSet = useCallback((index: number, key: AnyExerciseKey, value: string) => {
    const result = applySetUpdate(dataRef.current, { index, key, value, time: formatHHMM(new Date()) });
    if (result.data !== dataRef.current) commitData(result.data);
    if (result.rest) beginRest(result.rest);
  }, [commitData, beginRest]);

  // Use Last goes through the same update path as typing: a filled rep is stamped with the time
  // it was tapped, takes the sequence number and starts the right rest timer.
  const handleUseLastSet = useCallback((index: number, key: SetKey) => {
    const previous = previousRepsRef.current[allExercisesRef.current[index]];
    const result = applyUseLastForSet(dataRef.current, previous, index, key, formatHHMM(new Date()));
    if (result.data !== dataRef.current) commitData(result.data);
    if (result.rest) beginRest(result.rest);
  }, [commitData, beginRest]);

  const handleUseLastWeights = useCallback((index: number) => {
    const previous = previousRepsRef.current[allExercisesRef.current[index]];
    const visible = dataRef.current.exerciseSetCount[index] || 3;
    const result = applyUseLastWeights(dataRef.current, previous, index, visible, formatHHMM(new Date()));
    if (result.data !== dataRef.current) commitData(result.data);
  }, [commitData]);

  const setNote = useCallback((index: number, value: string | null) => {
    const current = dataRef.current;
    const notes = { ...current.exerciseNotes };
    if (value === null) delete notes[index];
    else notes[index] = value;
    commitData({ ...current, exerciseNotes: notes });
  }, [commitData]);

  const handleNoteChange = useCallback((index: number, value: string) => setNote(index, value), [setNote]);

  const handleCarryNote = useCallback((index: number) => {
    const prev = previousNotesRef.current[allExercisesRef.current[index]];
    if (!prev || dataRef.current.exerciseNotes[index]) return;
    setNote(index, prev);
  }, [setNote]);

  const handleCopyNote = useCallback((index: number) => {
    const prev = previousNotesRef.current[allExercisesRef.current[index]];
    if (prev) setNote(index, prev);
  }, [setNote]);

  const handleClearNote = useCallback((index: number) => {
    const name = allExercisesRef.current[index];
    setNote(index, null);
    setPreviousNotes((p) => {
      const next = { ...p };
      delete next[name];
      return next;
    });
  }, [setNote]);

  const formatSetsForNotes = () => {
    if (!template || !startTime) return '';
    const endTimeStr = formatHHMM(new Date());
    const startTimeStr = formatHHMM(startTime);
    const entries = collectWorkoutEntries(allExercises, data.exerciseSets, data.exerciseSequence, data.exerciseTimestamps, data.exerciseNotes, data.exerciseSetCount);
    return formatWorkoutNotes(entries, startTimeStr, endTimeStr);
  };

  // Readable text for the debrief "Copy details" button: times, every set
  // (reps @ weight, stamped time), per-exercise notes and new PRs.
  const buildCopyText = (prs: string[], durationMinutes: number, volume: number, endAnchor: Date) => {
    if (!template || !startTime) return '';
    const startTimeStr = formatHHMM(startTime);
    const endTimeStr = formatHHMM(endAnchor);
    const lines: string[] = [
      `Workout: ${workoutName}`,
      `Date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Start: ${startTimeStr} · End: ${endTimeStr} · Duration: ${durationMinutes} min`,
      `Total volume: ${Math.round(volume).toLocaleString()} kg`,
    ];
    collectWorkoutEntries(allExercises, data.exerciseSets, data.exerciseSequence, data.exerciseTimestamps, data.exerciseNotes, data.exerciseSetCount).forEach((entry) => {
      lines.push('');
      lines.push(`${entry.seq}. ${entry.exercise}`);
      formatSetLines(entry).forEach((l) => lines.push(l));
      if (entry.note) lines.push(`   Note: ${entry.note}`);
    });
    if (prs.length > 0) {
      lines.push('');
      lines.push('New personal records:');
      prs.forEach((p) => lines.push(`- ${p}`));
    }
    return lines.join('\n');
  };

  const handleComplete = async () => {
    if (!template || !startTime || savingRef.current) return;
    const completedAt = new Date();
    const notes = formatSetsForNotes();
    const formattedStartTime = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;

    // Prefer the latest per-set timestamp as the end anchor — that's the real
    // moment the workout finished, independent of when "Complete" was tapped.
    let endAnchor = completedAt;
    let bestMin = -1;
    Object.values(data.exerciseTimestamps).forEach((ts) => {
      if (!ts) return;
      Object.values(ts).forEach((t) => {
        if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return;
        const [h, m] = t.split(':').map((x) => parseInt(x, 10));
        const mins = h * 60 + m;
        if (mins > bestMin) bestMin = mins;
      });
    });
    if (bestMin >= 0) {
      const candidate = new Date(startTime);
      candidate.setHours(Math.floor(bestMin / 60), bestMin % 60, 0, 0);
      const behind = startTime.getTime() - candidate.getTime();
      if (behind > 60 * 60000) {
        candidate.setDate(candidate.getDate() + 1); // crossed midnight
        endAnchor = candidate;
      } else if (behind <= 0) {
        endAnchor = candidate;
      }
      // A set stamped in the same minute the workout started (HH:MM has no
      // seconds) is not a midnight crossing; keep the real completion time.
    }
    const durationMinutes = Math.max(1, Math.round((endAnchor.getTime() - startTime.getTime()) / 60000));

    const previous = [...historySessions]
      .filter((h) => h.exercise === workoutName && notesVolume(h.notes) > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const prs = allExercises.filter((ex, i) => isPR(i, ex));
    const summary = {
      name: workoutName,
      duration: durationMinutes,
      volume: totalVolume,
      change: volumeChange(totalVolume, previous ? notesVolume(previous.notes) : null),
      prs,
      completed: completedCount,
      total: allExercises.length,
      copyText: buildCopyText(prs, durationMinutes, totalVolume, endAnchor),
    };

    // The workout belongs to the account that recorded it. If someone else is signed in by now, do not save it
    // into their log: it stays on this device for its owner.
    if (ownerIdRef.current !== userIdRef.current) {
      toast.error('The signed-in account changed, so this workout was not saved. It stays on this device for the account that recorded it.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    let success = false;
    try {
      success = await onFinish({
        exercise: workoutName,
        duration: durationMinutes,
        date: new Date().toISOString().split('T')[0],
        notes: notes || undefined,
        start_time: formattedStartTime,
        end_time: endAnchor.toISOString(),
      }, ownerIdRef.current);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }

    if (success) {
      logActivity({ action: 'finish_workout', category: 'gym', details: { template_name: workoutName, duration: durationMinutes, notes } });
      // Stop writing this workout back to storage, then remove the saved copy.
      setHydratedId(null);
      if (!clearDraft(defaultStorage(), ownerIdRef.current, template.id) && persistFailureRef.current === null) {
        toast.warning('Workout saved. The copy kept on this device could not be removed, so it may show up as a paused workout. Discard it from the Gym page.');
      }
      setRestState(null);
      setDebrief(summary);
    } else {
      logActivity({ action: 'finish_workout', category: 'gym', status: 'error', error_message: 'Save failed, retaining data', details: { template_name: workoutName } });
    }
    // If save failed, workout data stays in localStorage so user can retry
  };

  // Closing keeps the workout on this device. If saving to the device is failing, closing would lose it,
  // so try once more and stay open (with the warning) when that still fails.
  const requestClose = () => {
    if (savingRef.current) return;
    if (persistFailureRef.current !== null && hasWorkoutData(dataRef.current)) {
      const state = latestStateRef.current;
      if (!state || !persist(state)) {
        toast.error("Can't pause: your progress isn't saved on this device. Fix the warning above, or tap Complete Workout to log it now.");
        return;
      }
    }
    onClose();
  };

  // Returns false when the saved copy could not be removed, so the confirm dialog stays open with its error
  // instead of closing while the workout would still come back.
  const handleCancel = (): boolean => {
    const cleared =
      clearDraft(defaultStorage(), ownerIdRef.current, template?.id ?? '') ||
      // Nothing could be stored in these cases, so there is nothing to remove.
      persistFailureRef.current === 'unavailable' ||
      persistFailureRef.current === 'no-identity';
    if (!cleared) return false;
    setHydratedId(null);
    logActivity({ action: 'cancel_workout', category: 'gym', details: { template_name: workoutName } });
    onClose();
    return true;
  };

  const handleSaveSettings = (setRest: number, exerciseRest: number) => {
    const newSettings = { setRestSeconds: setRest, exerciseRestSeconds: exerciseRest };
    setTimerSettings(newSettings);
    saveRestTimerSettings(newSettings);
    void persistRestTimerSettings(newSettings);
    setShowSettings(false);
  };

  const totalVolume = useMemo(
    () => allExercises.reduce(
      (sum, ex, i) => sum + exerciseVolume(data.exerciseSets[i] as unknown as Record<string, string | undefined>, extractWeightFromExerciseName(ex)),
      0,
    ),
    [allExercises, data.exerciseSets],
  );
  const isPR = (i: number, ex: string) =>
    isPersonalRecord(data.exerciseSets[i] as unknown as Record<string, string | undefined>, allTimeBest[ex]);

  const completedCount = allExercises.filter((_, i) => hasAnySet(data.exerciseSets[i])).length;

  // Display order only. Every card still reads and writes by its original index.
  const displayOrder = useMemo(() => workoutExerciseOrder(allExercises, previousSequences), [allExercises, previousSequences]);

  const copyDetails = async () => {
    if (!debrief?.copyText) return;
    try {
      await navigator.clipboard.writeText(debrief.copyText);
    } catch {
      // Clipboard API can be blocked (e.g. older mobile browsers); fall back.
      const ta = document.createElement('textarea');
      ta.value = debrief.copyText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedDetails(true);
    setTimeout(() => setCopiedDetails(false), 2000);
  };

  if (debrief) {
    const close = () => { setDebrief(null); onClose(); };
    // Mobile: the trailing touch from "Complete Workout" lands outside this smaller
    // dialog; ignore outside taps so it only closes via Done / X / Escape.
    return (
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent
          layout="scroll"
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" aria-hidden="true" />Workout complete!</DialogTitle>
            <DialogDescription>{debrief.name} · {debrief.completed}/{debrief.total} exercises</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Duration</p><p className="text-xl font-bold">{debrief.duration} min</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Volume</p><p className="text-xl font-bold text-primary">{Math.round(debrief.volume).toLocaleString()} kg</p></div>
            </div>
            <p className="text-sm text-center">
              {debrief.change
                ? <><span className={debrief.change.diff >= 0 ? 'text-[hsl(var(--chart-min))] font-semibold' : 'text-destructive font-semibold'}>{debrief.change.diff >= 0 ? '+' : ''}{Math.round(debrief.change.diff).toLocaleString()} kg ({debrief.change.pct >= 0 ? '+' : ''}{debrief.change.pct}%)</span> vs last {debrief.name}</>
                : <span className="text-muted-foreground">No previous {debrief.name} volume to compare yet.</span>}
            </p>
            {debrief.prs.length > 0 ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1">
                <p className="text-sm font-semibold flex items-center gap-1"><Trophy className="h-4 w-4 text-primary" aria-hidden="true" />New personal records</p>
                {debrief.prs.map((p) => <p key={p} className="text-sm">{p}</p>)}
              </div>
            ) : (
              <p className="text-sm text-center text-muted-foreground">Solid effort — no new PRs this session.</p>
            )}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:space-x-0">
            <Button variant="outline" size="touch" onClick={copyDetails}>
              {copiedDetails ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copiedDetails ? 'Copied!' : 'Copy details'}
            </Button>
            <Button size="touch" onClick={close}>Done</Button>
          </DialogFooter>
          <p role="status" className="sr-only">{copiedDetails ? 'Workout details copied to the clipboard.' : ''}</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (!template) return null;

  const ready = hydratedId === template.id;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !saving && requestClose()}>
      <DialogContent
        layout="mobile-full"
        closeLabel="Pause workout and close"
        className="flex flex-col gap-0 p-0 max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] max-sm:pt-[max(0.5rem,env(safe-area-inset-top))] sm:max-w-2xl"
      >
        {/* Fixed top: title, clock and rest timer stay in view while the exercises scroll. */}
        <DialogHeader className="shrink-0 space-y-2 border-b px-3 pb-3 pt-1 text-left sm:px-4 sm:pt-4">
          <div className="flex items-center gap-1 pr-12 sm:pr-10">
            <DialogTitle className="flex min-w-0 flex-1 items-center gap-2 pr-0">
              <Timer className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 break-words leading-tight">{workoutName}</span>
            </DialogTitle>
            <IconButton
              label={restAlertOn ? 'Mute rest timer alert' : 'Unmute rest timer alert'}
              className="h-11 w-11 shrink-0"
              onClick={toggleRestAlert}
            >
              {restAlertOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" className="text-muted-foreground" />}
            </IconButton>
            <IconButton
              label="Rest timer settings"
              aria-expanded={showSettings}
              className="h-11 w-11 shrink-0"
              onClick={() => setShowSettings((s) => !s)}
            >
              <Settings2 aria-hidden="true" />
            </IconButton>
          </div>
          <DialogDescription className="sr-only">
            {persistFailure
              ? 'Log reps and weight for each set. Warning: your progress is not being saved on this device. Read the warning below the title.'
              : 'Log reps and weight for each set. Your progress is saved on this device while you train.'}
          </DialogDescription>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {ready && startTime && <ElapsedClock startMs={startTime.getTime()} className="text-2xl text-primary" />}
            <p className="text-sm text-muted-foreground">
              {completedCount}/{allExercises.length} exercises
              {' · '}<span className="font-semibold text-foreground">{Math.round(totalVolume).toLocaleString()} kg</span> volume
            </p>
          </div>

          {rest && <RestTimerPanel rest={rest} onElapsed={handleRestElapsed} onDismiss={dismissRest} />}
        </DialogHeader>

        {/* Never claim "saving" while it is failing: say so, say why, and offer a retry. */}
        {persistFailure && (
          <div role="alert" className="mx-3 mt-3 shrink-0 space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm sm:mx-4">
            <p className="font-medium text-destructive">{describePersistFailure(persistFailure).title}</p>
            <p className="text-muted-foreground">{describePersistFailure(persistFailure).body}</p>
            <Button type="button" size="touch" variant="outline" onClick={retryPersist}>Try saving again</Button>
          </div>
        )}

        {/* One polite announcement per finished rest, independent of sound and vibration. */}
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
          <ReadinessBadge score={recoveryScore} compact />
          {/* Not shown while saving is failing: that badge's wording promises a save that is not happening. */}
          {!persistFailure && <OfflineBadge message="Offline · workout is saving on this device" className="self-center" />}

          {showSettings && (
            <TimerSettingsPanel
              settings={timerSettings}
              onSave={handleSaveSettings}
              onClose={() => setShowSettings(false)}
            />
          )}

          {ready && displayOrder.map(({ exercise, index }) => (
            <WorkoutExerciseCard
              key={index}
              index={index}
              exercise={exercise}
              isExtra={index >= baseExercises.length}
              seq={data.exerciseSequence[index]}
              previousSeq={previousSequences[exercise]}
              sets={data.exerciseSets[index]}
              timestamps={data.exerciseTimestamps[index]}
              setCount={data.exerciseSetCount[index] || 3}
              note={data.exerciseNotes[index] || ''}
              previousSets={previousReps[exercise]}
              previousNote={previousNotes[exercise]}
              isPR={isPR(index, exercise)}
              complete={hasAnySet(data.exerciseSets[index])}
              expanded={expandedExercise === index}
              onToggle={handleToggle}
              onUpdateSet={handleUpdateSet}
              onUseLastSet={handleUseLastSet}
              onUseLastWeights={handleUseLastWeights}
              onAddSet={handleAddSet}
              onNoteChange={handleNoteChange}
              onCarryNote={handleCarryNote}
              onCopyNote={handleCopyNote}
              onClearNote={handleClearNote}
            />
          ))}

          {/* Add exercise (session-only) */}
          {showAddExercise ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <Label htmlFor="wk-add-exercise" className="text-xs text-muted-foreground">
                Add an exercise to this session (won't be saved to template)
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="wk-add-exercise"
                  autoFocus
                  placeholder="e.g., 20kg Dumbbell Curl"
                  enterKeyHint="done"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExercise();
                    }
                  }}
                  className="h-11 min-w-0 flex-1 basis-full"
                  maxLength={500}
                />
                <Button size="touch" className="flex-1" onClick={handleAddExercise} disabled={!newExerciseName.trim()}>
                  Add
                </Button>
                <Button
                  size="touch"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setShowAddExercise(false);
                    setNewExerciseName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="touch" className="w-full border-dashed" onClick={() => setShowAddExercise(true)}>
              <Plus aria-hidden="true" />
              Add exercise (session only)
            </Button>
          )}
        </div>

        <DialogFooter className="grid shrink-0 grid-cols-2 gap-2 border-t px-3 pt-2 sm:flex sm:space-x-0 sm:px-4 sm:py-3">
          <ConfirmDeleteButton
            size="touch"
            variant="ghost"
            onConfirm={handleCancel}
            disabled={saving}
            confirmationTitle="Discard workout?"
            confirmationDescription="Are you sure you want to discard this workout? All unsaved sets, weights, times and comments will be lost. Choose No, keep it to continue, or Pause & Resume Later to keep your progress."
            confirmLabel="Yes, discard workout"
            className="px-2 text-destructive hover:text-destructive"
          >
            Cancel Workout
          </ConfirmDeleteButton>
          <Button variant="outline" size="touch" onClick={requestClose} className="h-auto min-h-11 whitespace-normal px-2 py-1 leading-tight">
            Pause & Resume Later
          </Button>
          <Button size="touch" onClick={handleComplete} loading={saving} loadingText="Saving workout…" className="col-span-2">
            Complete Workout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Timer Settings Panel Component
const TimerSettingsPanel = ({
  settings,
  onSave,
  onClose,
}: {
  settings: RestTimerSettings;
  onSave: (setRest: number, exerciseRest: number) => void;
  onClose: () => void;
}) => {
  const [setRest, setSetRest] = useState(settings.setRestSeconds.toString());
  const [exerciseRest, setExerciseRest] = useState(settings.exerciseRestSeconds.toString());
  const save = () => onSave(parseInt(setRest) || 60, parseInt(exerciseRest) || 90);

  return (
    <div role="group" aria-labelledby="wk-timer-settings-title" className="space-y-3 rounded-lg border bg-muted/50 p-3">
      <p id="wk-timer-settings-title" className="text-sm font-medium">Rest Timer Settings</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="wk-set-rest" className="text-xs">Between sets (sec)</Label>
          <Input
            id="wk-set-rest"
            type="number"
            inputMode="numeric"
            enterKeyHint="next"
            min={5}
            value={setRest}
            onChange={(e) => setSetRest(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wk-exercise-rest" className="text-xs">Between exercises (sec)</Label>
          <Input
            id="wk-exercise-rest"
            type="number"
            inputMode="numeric"
            enterKeyHint="done"
            min={5}
            value={exerciseRest}
            onChange={(e) => setExerciseRest(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            className="h-11"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="touch" onClick={onClose}>
          Cancel
        </Button>
        <Button size="touch" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
};
