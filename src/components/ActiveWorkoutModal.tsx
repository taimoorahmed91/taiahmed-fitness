import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Timer, CheckCircle2, ChevronDown, ChevronUp, Clock, Settings2, Plus, StickyNote } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { GymSession } from '@/types';
import { Progress } from '@/components/ui/progress';
import { logActivity } from '@/hooks/useActivityLog';

const ACTIVE_WORKOUT_KEY = 'fittrack-active-workout';
const REST_TIMER_SETTINGS_KEY = 'fittrack-rest-timer-settings';

interface ExerciseSets {
  warmup?: string;
  warmupWeight?: string;
  set1: string;
  set2: string;
  set3: string;
  set4?: string;
  set5?: string;
  set6?: string;
  set1Weight?: string;
  set2Weight?: string;
  set3Weight?: string;
  set4Weight?: string;
  set5Weight?: string;
  set6Weight?: string;
}

interface ExerciseTimestamps {
  warmupTime?: string;
  set1Time?: string;
  set2Time?: string;
  set3Time?: string;
  set4Time?: string;
  set5Time?: string;
  set6Time?: string;
}

type SetKey = 'warmup' | 'set1' | 'set2' | 'set3' | 'set4' | 'set5' | 'set6';
type WeightKey = 'warmupWeight' | 'set1Weight' | 'set2Weight' | 'set3Weight' | 'set4Weight' | 'set5Weight' | 'set6Weight';
type AnyExerciseKey = SetKey | WeightKey;

interface ExerciseSequence {
  [exerciseIndex: number]: number; // sequence number (1-based)
}

interface PreviousReps {
  [exerciseName: string]: ExerciseSets;
}

interface RestTimerSettings {
  setRestSeconds: number;
  exerciseRestSeconds: number;
}

interface ActiveWorkoutState {
  templateId: string;
  templateName: string;
  exercises: string[];
  extraExercises: string[];
  startTime: string;
  exerciseSets: Record<number, ExerciseSets>;
  exerciseTimestamps: Record<number, ExerciseTimestamps>;
  exerciseSequence: ExerciseSequence;
  exerciseNotes: Record<number, string>;
  exerciseSetCount?: Record<number, number>;
  nextSequence: number;
  expandedExercise: number | null;
  restTimer?: {
    remaining: number;
    total: number;
    type: 'set' | 'exercise';
    startedAt: string;
  } | null;
}

interface ActiveWorkoutModalProps {
  template: WorkoutTemplate | null;
  open: boolean;
  onClose: () => void;
  onFinish: (data: { exercise: string; duration: number; date: string; notes?: string; start_time?: string }) => Promise<boolean>;
  getLastSession?: (templateName: string) => Promise<GymSession | null>;
}

// Extract the leading numeric weight value from an exercise name (e.g. "60kg Bench Press" -> "60")
const extractWeightFromExerciseName = (name: string): string => {
  const match = name.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : '';
};

const parseNotesToPreviousReps = (notes: string | undefined): { reps: PreviousReps; notes: Record<string, string>; sequences: Record<string, number>; setCounts: Record<string, number> } => {
  const result: PreviousReps = {};
  const noteMap: Record<string, string> = {};
  const seqMap: Record<string, number> = {};
  const setCounts: Record<string, number> = {};
  if (!notes) return { reps: result, notes: noteMap, sequences: seqMap, setCounts };

  const exerciseParts = notes.split(' | ');
  for (const part of exerciseParts) {
    // Capture leading sequence prefix like "1." if present
    const seqPrefix = part.match(/^(\d+)\./);
    const cleaned = part.replace(/^\d+\./, '');
    const colonIndex = cleaned.indexOf(':');
    if (colonIndex === -1) continue;

    const exerciseName = cleaned.substring(0, colonIndex).trim();
    if (seqPrefix) seqMap[exerciseName] = parseInt(seqPrefix[1], 10);
    let setsText = cleaned.substring(colonIndex + 1).trim();

    // Extract trailing note: "[note: ...]"
    const noteMatch = setsText.match(/\s*\[note:\s*([^\]]*)\]\s*$/);
    if (noteMatch) {
      noteMap[exerciseName] = noteMatch[1].trim();
      setsText = setsText.replace(noteMatch[0], '').trim();
    }

    const sets: ExerciseSets = { set1: '', set2: '', set3: '' };

    // Match warmup: W:<reps> optionally followed by @<weight>kg
    const warmupMatch = setsText.match(/(?:^|\s)W:(\d+)(?:@(\d+(?:\.\d+)?)kg)?/);
    if (warmupMatch) {
      sets.warmup = warmupMatch[1];
      if (warmupMatch[2]) sets.warmupWeight = warmupMatch[2];
    }

    // Match S<n>:<reps> (n = 1..6) optionally followed by @<weight>kg
    let maxSetNum = 0;
    const setMatches = setsText.match(/S(\d):(\d+)(?:@(\d+(?:\.\d+)?)kg)?/g);
    if (setMatches) {
      for (const match of setMatches) {
        const m = match.match(/S(\d):(\d+)(?:@(\d+(?:\.\d+)?)kg)?/);
        if (!m) continue;
        const [, setNum, reps, weight] = m;
        const n = parseInt(setNum, 10);
        if (n < 1 || n > 6) continue;
        maxSetNum = Math.max(maxSetNum, n);
        (sets as unknown as Record<string, string | undefined>)[`set${n}`] = reps;
        if (weight) (sets as unknown as Record<string, string | undefined>)[`set${n}Weight`] = weight;
      }
    }
    if (maxSetNum > 0) setCounts[exerciseName] = Math.min(6, Math.max(3, maxSetNum));
    result[exerciseName] = sets;
  }
  return { reps: result, notes: noteMap, sequences: seqMap, setCounts };
};

const loadRestTimerSettings = (): RestTimerSettings => {
  try {
    const saved = localStorage.getItem(REST_TIMER_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load rest timer settings:', e);
  }
  return { setRestSeconds: 60, exerciseRestSeconds: 90 };
};

const saveRestTimerSettings = (settings: RestTimerSettings) => {
  localStorage.setItem(REST_TIMER_SETTINGS_KEY, JSON.stringify(settings));
};

const saveActiveWorkout = (state: ActiveWorkoutState) => {
  localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(state));
};

const loadActiveWorkout = (): ActiveWorkoutState | null => {
  try {
    const saved = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load active workout:', e);
  }
  return null;
};

const clearActiveWorkout = () => {
  localStorage.removeItem(ACTIVE_WORKOUT_KEY);
};

export const ActiveWorkoutModal = ({ template, open, onClose, onFinish, getLastSession }: ActiveWorkoutModalProps) => {
  const [extraExercises, setExtraExercises] = useState<string[]>([]);
  const [exerciseSets, setExerciseSets] = useState<Record<number, ExerciseSets>>({});
  const [exerciseTimestamps, setExerciseTimestamps] = useState<Record<number, ExerciseTimestamps>>({});
  const [exerciseSequence, setExerciseSequence] = useState<ExerciseSequence>({});
  const [nextSequence, setNextSequence] = useState(1);
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>({});
  // Visible non-warmup set count per exercise index (3..6). Defaults to 3, bumped
  // up when previous session history shows more sets were used for that exercise.
  const [exerciseSetCount, setExerciseSetCount] = useState<Record<number, number>>({});
  const [previousReps, setPreviousReps] = useState<PreviousReps>({});
  const [previousNotes, setPreviousNotes] = useState<Record<string, string>>({});
  const [previousSequences, setPreviousSequences] = useState<Record<string, number>>({});
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRestored, setIsRestored] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  // Add-exercise UI state
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');

  // Rest timer state
  const [restTimerRemaining, setRestTimerRemaining] = useState<number>(0);
  const [restTimerTotal, setRestTimerTotal] = useState<number>(0);
  const [restTimerType, setRestTimerType] = useState<'set' | 'exercise'>('set');
  const [isRestTimerActive, setIsRestTimerActive] = useState(false);
  const restTimerStartedAt = useRef<Date | null>(null);

  // Timer settings
  const [timerSettings, setTimerSettings] = useState<RestTimerSettings>(loadRestTimerSettings);
  const [showSettings, setShowSettings] = useState(false);

  // Track previous values to detect when a rep is newly entered
  const prevExerciseSets = useRef<Record<number, ExerciseSets>>({});

  // Keep a stable ref to getLastSession so the open/template effect doesn't
  // re-run every time the parent's sessions list updates (which would wipe
  // in-memory previousReps/previousSequences placeholders mid-workout).
  const getLastSessionRef = useRef(getLastSession);
  useEffect(() => { getLastSessionRef.current = getLastSession; }, [getLastSession]);

  // All exercises = template + extras (added during this session only)
  const allExercises = template ? [...template.exercises, ...extraExercises] : [];

  // Save state to localStorage whenever it changes
  const persistState = useCallback(() => {
    if (open && template && startTime) {
      const state: ActiveWorkoutState = {
        templateId: template.id,
        templateName: template.name,
        exercises: template.exercises,
        extraExercises,
        startTime: startTime.toISOString(),
        exerciseSets,
        exerciseTimestamps,
        exerciseSequence,
        exerciseNotes,
        exerciseSetCount,
        nextSequence,
        expandedExercise,
        restTimer: isRestTimerActive && restTimerStartedAt.current ? {
          remaining: restTimerRemaining,
          total: restTimerTotal,
          type: restTimerType,
          startedAt: restTimerStartedAt.current.toISOString(),
        } : null,
      };
      saveActiveWorkout(state);
    }
  }, [open, template, startTime, extraExercises, exerciseSets, exerciseTimestamps, exerciseSequence, exerciseNotes, exerciseSetCount, nextSequence, expandedExercise, isRestTimerActive, restTimerRemaining, restTimerTotal, restTimerType]);

  useEffect(() => {
    if (!isCancelled && (isRestored || (open && startTime))) {
      persistState();
    }
  }, [persistState, isRestored, open, startTime, isCancelled]);

  useEffect(() => {
    if (open && template) {
      const savedState = loadActiveWorkout();
      
      if (savedState && savedState.templateId === template.id) {
        setStartTime(new Date(savedState.startTime));
        setExtraExercises(savedState.extraExercises || []);
        setExerciseSets(savedState.exerciseSets);
        setExerciseTimestamps(savedState.exerciseTimestamps || {});
        setExerciseSequence(savedState.exerciseSequence || {});
        setNextSequence(savedState.nextSequence || 1);
        setExerciseNotes(savedState.exerciseNotes || {});
        setExerciseSetCount(savedState.exerciseSetCount || {});
        prevExerciseSets.current = JSON.parse(JSON.stringify(savedState.exerciseSets));
        setExpandedExercise(savedState.expandedExercise);
        setIsRestored(true);

        // Restore rest timer if active — recompute from original startedAt
        if (savedState.restTimer) {
          const startedAt = new Date(savedState.restTimer.startedAt);
          const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
          const remaining = Math.max(0, savedState.restTimer.total - elapsed);
          if (remaining > 0) {
            restTimerStartedAt.current = startedAt;
            setRestTimerTotal(savedState.restTimer.total);
            setRestTimerRemaining(remaining);
            setRestTimerType(savedState.restTimer.type);
            setIsRestTimerActive(true);
          }
        }
      } else {
        setStartTime(new Date());
        setElapsedSeconds(0);
        setExpandedExercise(0);
        setIsRestored(false);
        setIsCancelled(false);
        setIsRestTimerActive(false);
        setRestTimerRemaining(0);
        setExerciseSequence({});
        setNextSequence(1);
        setExtraExercises([]);
        setExerciseNotes({});

        const initialSets: Record<number, ExerciseSets> = {};
        const initialTimestamps: Record<number, ExerciseTimestamps> = {};
        const initialSetCount: Record<number, number> = {};
        template.exercises.forEach((_, index) => {
          initialSets[index] = { set1: '', set2: '', set3: '' };
          initialTimestamps[index] = {};
          initialSetCount[index] = 3;
        });
        setExerciseSets(initialSets);
        setExerciseTimestamps(initialTimestamps);
        setExerciseSetCount(initialSetCount);
        prevExerciseSets.current = JSON.parse(JSON.stringify(initialSets));
        logActivity({ action: 'start_workout', category: 'gym', details: { template_name: template.name, exercises: template.exercises } });
      }
      
      setPreviousReps({});
      setPreviousNotes({});
      setPreviousSequences({});
      setShowAddExercise(false);
      setNewExerciseName('');

      if (getLastSessionRef.current) {
        const tpl = template;
        const allEx = [...tpl.exercises];
        getLastSessionRef.current(tpl.name).then((lastSession) => {
          if (lastSession?.notes) {
            const parsed = parseNotesToPreviousReps(lastSession.notes);
            setPreviousReps(parsed.reps);
            setPreviousNotes(parsed.notes);
            setPreviousSequences(parsed.sequences);
            // Bump the default visible set count for any exercise whose previous
            // session logged more than 3 sets (capped at 6). Only raises counts —
            // never lowers a user's in-progress count.
            setExerciseSetCount((prev) => {
              const next = { ...prev };
              allEx.forEach((exName, idx) => {
                const prevCount = parsed.setCounts[exName];
                if (prevCount && prevCount > (next[idx] || 3)) {
                  next[idx] = Math.min(6, prevCount);
                }
              });
              return next;
            });
            // Note: previous reps/weights are shown as placeholders only — never pre-filled
            // into the actual inputs, so exercises don't appear "complete" and timestamps
            // still get recorded when the user enters their first rep.
          }
        });
      }
    }
    // Intentionally exclude getLastSession from deps — it's recreated on every
    // sessions update (auto-refresh / realtime) and would otherwise wipe the
    // in-memory previousReps/previousSequences placeholders mid-workout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template]);

  // Main workout timer
  useEffect(() => {
    if (!open || !startTime) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [open, startTime]);

  // Rest timer countdown — driven by wall-clock timestamps so background tab
  // throttling (browsers throttle setInterval to ~1/min when hidden) doesn't
  // cause the timer to drift. We always compute remaining from startedAt+total.
  useEffect(() => {
    if (!isRestTimerActive) return;

    const tick = () => {
      const startedAt = restTimerStartedAt.current;
      if (!startedAt) return;
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, restTimerTotal - elapsed);
      setRestTimerRemaining(remaining);
      if (remaining <= 0) setIsRestTimerActive(false);
    };

    tick(); // immediate sync (e.g. when tab becomes visible again)
    const interval = setInterval(tick, 1000);
    const onVisibility = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', tick);
    };
  }, [isRestTimerActive, restTimerTotal]);

  const startRestTimer = (type: 'set' | 'exercise') => {
    const duration = type === 'set' ? timerSettings.setRestSeconds : timerSettings.exerciseRestSeconds;
    restTimerStartedAt.current = new Date();
    setRestTimerTotal(duration);
    setRestTimerRemaining(duration);
    setRestTimerType(type);
    setIsRestTimerActive(true);
  };

  const skipRestTimer = () => {
    setIsRestTimerActive(false);
    setRestTimerRemaining(0);
  };

  const handleAddExercise = () => {
    const trimmed = newExerciseName.trim();
    if (!trimmed) return;
    const newIndex = allExercises.length; // index of this newly-added exercise
    setExtraExercises((prev) => [...prev, trimmed]);
    setExerciseSets((prev) => ({
      ...prev,
      [newIndex]: { set1: '', set2: '', set3: '' },
    }));
    setExerciseTimestamps((prev) => ({ ...prev, [newIndex]: {} }));
    setExerciseSetCount((prev) => ({ ...prev, [newIndex]: 3 }));
    prevExerciseSets.current = {
      ...prevExerciseSets.current,
      [newIndex]: { set1: '', set2: '', set3: '' },
    };
    setExpandedExercise(newIndex);
    setNewExerciseName('');
    setShowAddExercise(false);
  };

  const addExtraSet = (exerciseIndex: number) => {
    setExerciseSetCount((prev) => {
      const current = prev[exerciseIndex] || 3;
      if (current >= 6) return prev;
      return { ...prev, [exerciseIndex]: current + 1 };
    });
  };

  const updateSet = (exerciseIndex: number, setKey: AnyExerciseKey, value: string) => {
    const isWeightField = setKey.endsWith('Weight');
    // For weight fields, allow comma as decimal separator and convert to dot
    if (isWeightField) value = value.replace(',', '.');
    if (value && !/^\d*\.?\d*$/.test(value)) return;

    const repKey = (isWeightField ? setKey.replace('Weight', '') : setKey) as SetKey;
    const prevValue = (prevExerciseSets.current[exerciseIndex] as unknown as Record<string, string | undefined> | undefined)?.[setKey] || '';

    setExerciseSets((prev) => {
      const updated = {
        ...prev,
        [exerciseIndex]: {
          ...prev[exerciseIndex],
          [setKey]: value,
        },
      };
      return updated;
    });

    // Record timestamp & sequence & rest timer only when a REP value is newly entered
    if (!isWeightField && !prevValue && value) {
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const tsKey = `${repKey}Time` as keyof ExerciseTimestamps;
      setExerciseTimestamps((prev) => ({
        ...prev,
        [exerciseIndex]: {
          ...prev[exerciseIndex],
          [tsKey]: timeStr,
        },
      }));

      // Assign sequence number on first set entry for this exercise (warmup or set1)
      if (repKey === 'warmup' || repKey === 'set1') {
        setExerciseSequence((prev) => {
          if (prev[exerciseIndex] !== undefined) return prev;
          const seq = nextSequence;
          setNextSequence((n) => n + 1);
          return { ...prev, [exerciseIndex]: seq };
        });
      }

      // Warmup does not trigger a rest timer. Last working set triggers
      // exercise rest; intermediate working sets trigger set rest.
      if (repKey !== 'warmup') {
        const setNum = parseInt(repKey.replace('set', ''), 10);
        const lastSet = exerciseSetCount[exerciseIndex] || 3;
        if (setNum >= lastSet) {
          startRestTimer('exercise');
        } else {
          startRestTimer('set');
        }
      }
    }

    // Update prev ref
    prevExerciseSets.current = {
      ...prevExerciseSets.current,
      [exerciseIndex]: {
        ...prevExerciseSets.current[exerciseIndex],
        [setKey]: value,
      },
    };
  };

  const isExerciseComplete = (index: number) => {
    const sets = exerciseSets[index];
    if (!sets) return false;
    return !!(sets.warmup || sets.set1 || sets.set2 || sets.set3 || sets.set4 || sets.set5 || sets.set6);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSetsForNotes = () => {
    if (!template || !startTime) return '';
    const endTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const startTimeStr = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    // Collect exercises that have data, sorted by sequence
    const entries: { exercise: string; index: number; seq: number }[] = [];
    allExercises.forEach((exercise, index) => {
      const sets = exerciseSets[index];
      if (sets && (sets.warmup || sets.set1 || sets.set2 || sets.set3 || sets.set4 || sets.set5 || sets.set6)) {
        entries.push({ exercise, index, seq: exerciseSequence[index] ?? 999 });
      }
    });
    entries.sort((a, b) => a.seq - b.seq);

    const lines: string[] = [`Start:${startTimeStr} End:${endTimeStr}`];
    entries.forEach((entry) => {
      const sets = exerciseSets[entry.index];
      const ts = exerciseTimestamps[entry.index];
      const setCount = exerciseSetCount[entry.index] || 3;
      const buildWarmup = () => {
        const reps = sets.warmup;
        if (!reps) return null;
        const weight = sets.warmupWeight;
        const time = ts?.warmupTime;
        return `W:${reps}${weight ? `@${weight}kg` : ''}${time ? `@${time}` : ''}`;
      };
      const buildSet = (n: number) => {
        const repKey = `set${n}` as SetKey;
        const wKey = `set${n}Weight` as WeightKey;
        const tKey = `set${n}Time` as keyof ExerciseTimestamps;
        const reps = (sets as unknown as Record<string, string | undefined>)[repKey];
        if (!reps) return null;
        const weight = (sets as unknown as Record<string, string | undefined>)[wKey];
        const time = ts?.[tKey];
        return `S${n}:${reps}${weight ? `@${weight}kg` : ''}${time ? `@${time}` : ''}`;
      };
      const parts: (string | null)[] = [buildWarmup()];
      for (let n = 1; n <= setCount; n++) parts.push(buildSet(n));
      const setsText = parts.filter(Boolean).join(' ');
      const note = exerciseNotes[entry.index]?.trim();
      const noteSuffix = note ? ` [note: ${note.replace(/[\[\]|]/g, '')}]` : '';
      lines.push(`${entry.seq}.${entry.exercise}: ${setsText}${noteSuffix}`);
    });
    return lines.join(' | ');
  };

  const handleComplete = async () => {
    if (!template || !startTime) return;
    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
    const notes = formatSetsForNotes();
    const formattedStartTime = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
    
    const success = await onFinish({
      exercise: template.name,
      duration: durationMinutes,
      date: new Date().toISOString().split('T')[0],
      notes: notes || undefined,
      start_time: formattedStartTime,
    });
    
    if (success) {
      logActivity({ action: 'finish_workout', category: 'gym', details: { template_name: template.name, duration: durationMinutes, notes } });
      clearActiveWorkout();
      onClose();
    } else {
      logActivity({ action: 'finish_workout', category: 'gym', status: 'error', error_message: 'Save failed, retaining data', details: { template_name: template.name } });
    }
    // If save failed, workout data stays in localStorage so user can retry
  };

  const handlePause = () => {
    onClose();
  };

  const handleCancel = () => {
    setIsCancelled(true);
    logActivity({ action: 'cancel_workout', category: 'gym', details: { template_name: template?.name } });
    clearActiveWorkout();
    onClose();
  };

  const handleSaveSettings = (setRest: number, exerciseRest: number) => {
    const newSettings = { setRestSeconds: setRest, exerciseRestSeconds: exerciseRest };
    setTimerSettings(newSettings);
    saveRestTimerSettings(newSettings);
    setShowSettings(false);
  };

  const completedCount = allExercises.filter((_, i) => isExerciseComplete(i)).length;

  if (!template) return null;

  const restTimerProgress = restTimerTotal > 0 ? ((restTimerTotal - restTimerRemaining) / restTimerTotal) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              {template.name}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Timer Settings Panel */}
        {showSettings && (
          <TimerSettingsPanel
            settings={timerSettings}
            onSave={handleSaveSettings}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Rest Timer Overlay */}
        {isRestTimerActive && restTimerRemaining > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {restTimerType === 'set' ? 'Set Rest' : 'Exercise Rest'}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={skipRestTimer} className="h-7 text-xs">
                Skip
              </Button>
            </div>
            <div className="text-3xl font-mono font-bold text-center text-primary">
              {formatTime(restTimerRemaining)}
            </div>
            <Progress value={restTimerProgress} className="h-2" />
          </div>
        )}

        <div className="flex items-center justify-center py-3">
          <div className="text-4xl font-mono font-bold text-primary">
            {formatTime(elapsedSeconds)}
          </div>
        </div>

        <div className="text-sm text-muted-foreground text-center mb-2">
          {completedCount}/{allExercises.length} exercises completed
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {allExercises.map((exercise, index) => {
            const isExtra = index >= template.exercises.length;
            const defaultWeight = extractWeightFromExerciseName(exercise);
            return (
            <Collapsible
              key={index}
              open={expandedExercise === index}
              onOpenChange={(isOpen) => {
                setExpandedExercise(isOpen ? index : null);
              }}
            >
              <div
                className={`rounded-lg border transition-colors ${
                  isExerciseComplete(index) ? 'bg-primary/10 border-primary/30' : 'bg-card'
                }`}
              >
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 text-left">
                    <div className="flex items-center gap-2">
                      {isExerciseComplete(index) && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <div>
                        <span className={`font-medium ${isExerciseComplete(index) ? 'text-primary' : ''}`}>
                          {exerciseSequence[index] !== undefined ? (
                            <span className="text-xs text-muted-foreground mr-1">{exerciseSequence[index]}.</span>
                          ) : previousSequences[exercise] !== undefined ? (
                            <span className="text-xs text-muted-foreground/60 mr-1 italic">prev #{previousSequences[exercise]}</span>
                          ) : null}
                          {exercise}
                          {isExtra && (
                            <span className="ml-2 text-[10px] text-muted-foreground uppercase tracking-wide">added</span>
                          )}
                        </span>
                      </div>
                    </div>
                    {expandedExercise === index ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 space-y-3">
                    {(() => {
                      const setCount = exerciseSetCount[index] || 3;
                      const setNums = Array.from({ length: setCount }, (_, i) => i + 1);
                      const gridStyle = { gridTemplateColumns: `80px repeat(${setCount}, minmax(0, 1fr))` };
                      const prevSet = previousReps[exercise];
                      const setsObj = exerciseSets[index] as unknown as Record<string, string | undefined> | undefined;
                      const tsObj = exerciseTimestamps[index] as unknown as Record<string, string | undefined> | undefined;
                      const prevSetObj = prevSet as unknown as Record<string, string | undefined> | undefined;
                      const hasAnyTimestamp = setNums.some((n) => tsObj?.[`set${n}Time`]);
                      return (
                        <>
                          {/* Warmup row (single input, optional) */}
                          <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '80px minmax(0, 1fr) minmax(0, 1fr)' }}>
                            <Label className="text-xs font-medium text-muted-foreground">Warmup</Label>
                            <Input
                              id={`warmup-reps-${index}`}
                              type="text"
                              inputMode="numeric"
                              placeholder={prevSet?.warmup || 'reps'}
                              value={setsObj?.warmup || ''}
                              onChange={(e) => updateSet(index, 'warmup', e.target.value)}
                              className={`h-9 text-center ${setsObj?.warmup ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
                              maxLength={3}
                            />
                            <Input
                              id={`warmup-weight-${index}`}
                              type="text"
                              inputMode="decimal"
                              placeholder={prevSet?.warmupWeight || defaultWeight || 'kg'}
                              value={setsObj?.warmupWeight || ''}
                              onChange={(e) => updateSet(index, 'warmupWeight', e.target.value)}
                              className={`h-9 text-center ${setsObj?.warmupWeight ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
                              maxLength={6}
                            />
                          </div>
                          {tsObj?.warmupTime && (
                            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '80px minmax(0, 1fr) minmax(0, 1fr)' }}>
                              <span className="text-[10px] text-muted-foreground">Logged at</span>
                              <p className="text-[10px] text-primary text-center">⏱ {tsObj.warmupTime}</p>
                              <span />
                            </div>
                          )}

                          {/* Set number headers */}
                          <div className="grid gap-2 items-center" style={gridStyle}>
                            <div />
                            {setNums.map((n) => (
                              <Label key={n} className="text-[11px] text-muted-foreground text-center">
                                Set {n}
                              </Label>
                            ))}
                          </div>

                          {/* Reps row */}
                          <div className="grid gap-2 items-center" style={gridStyle}>
                            <Label className="text-xs font-medium">Reps</Label>
                            {setNums.map((n) => {
                              const setKey = `set${n}` as SetKey;
                              const prevReps = prevSetObj?.[setKey] || '';
                              const hasValue = !!setsObj?.[setKey];
                              return (
                                <Input
                                  key={setKey}
                                  id={`${setKey}-${index}`}
                                  type="text"
                                  inputMode="numeric"
                                  placeholder={prevReps || '0'}
                                  value={setsObj?.[setKey] || ''}
                                  onChange={(e) => updateSet(index, setKey, e.target.value)}
                                  className={`h-9 text-center ${hasValue ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
                                  maxLength={3}
                                />
                              );
                            })}
                          </div>

                          {/* Weight row */}
                          <div className="grid gap-2 items-center" style={gridStyle}>
                            <Label className="text-xs font-medium">Weight (kg)</Label>
                            {setNums.map((n) => {
                              const weightKey = `set${n}Weight` as WeightKey;
                              const prevWeight = prevSetObj?.[weightKey] || defaultWeight || '';
                              const hasValue = !!setsObj?.[weightKey];
                              return (
                                <Input
                                  key={weightKey}
                                  id={`${weightKey}-${index}`}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder={prevWeight || 'kg'}
                                  value={setsObj?.[weightKey] || ''}
                                  onChange={(e) => updateSet(index, weightKey, e.target.value)}
                                  className={`h-9 text-center ${hasValue ? 'border-green-500 focus-visible:ring-green-500' : ''}`}
                                  maxLength={6}
                                />
                              );
                            })}
                          </div>

                          {/* Timestamps row */}
                          {hasAnyTimestamp && (
                            <div className="grid gap-2 items-center" style={gridStyle}>
                              <span className="text-[10px] text-muted-foreground">Logged at</span>
                              {setNums.map((n) => {
                                const tKey = `set${n}Time`;
                                const v = tsObj?.[tKey];
                                return (
                                  <p key={tKey} className="text-[10px] text-primary text-center">
                                    {v ? `⏱ ${v}` : '—'}
                                  </p>
                                );
                              })}
                            </div>
                          )}

                          {/* Add set button (up to 6 sets) */}
                          {setCount < 6 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full border-dashed h-8 text-xs"
                              onClick={() => addExtraSet(index)}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add set ({setCount + 1} of 6)
                            </Button>
                          )}
                        </>
                      );
                    })()}

                    {/* Per-exercise note */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Label htmlFor={`note-${index}`} className="text-xs font-medium flex items-center gap-1">
                          <StickyNote className="h-3 w-3" />
                          Notes
                        </Label>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            disabled={!previousNotes[exercise]}
                            onClick={() => {
                              const prev = previousNotes[exercise];
                              if (!prev) return;
                              setExerciseNotes((p) => {
                                if (p[index]) return p;
                                return { ...p, [index]: prev };
                              });
                            }}
                          >
                            Carry forward
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            disabled={!previousNotes[exercise]}
                            onClick={() => {
                              const prev = previousNotes[exercise];
                              if (!prev) return;
                              setExerciseNotes((p) => ({ ...p, [index]: prev }));
                            }}
                          >
                            Copy previous
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2 text-muted-foreground"
                            onClick={() => {
                              setExerciseNotes((p) => {
                                const next = { ...p };
                                delete next[index];
                                return next;
                              });
                              setPreviousNotes((p) => {
                                const next = { ...p };
                                delete next[exercise];
                                return next;
                              });
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        id={`note-${index}`}
                        placeholder={previousNotes[exercise] || 'Form cues, how it felt, adjustments...'}
                        value={exerciseNotes[index] || ''}
                        onChange={(e) =>
                          setExerciseNotes((prev) => ({ ...prev, [index]: e.target.value }))
                        }
                        rows={2}
                        maxLength={300}
                        className="text-sm min-h-[56px] resize-none"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
            );
          })}

          {/* Add exercise (session-only) */}
          {showAddExercise ? (
            <div className="rounded-lg border border-dashed p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">
                Add an exercise to this session (won't be saved to template)
              </Label>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="e.g., 20kg Dumbbell Curl"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExercise();
                    }
                  }}
                  className="h-9"
                  maxLength={500}
                />
                <Button size="sm" onClick={handleAddExercise} disabled={!newExerciseName.trim()}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
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
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => setShowAddExercise(true)}
            >
              <Plus className="h-4 w-4" />
              Add exercise (session only)
            </Button>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button variant="ghost" onClick={handleCancel} className="w-full sm:w-auto text-destructive hover:text-destructive">
            Cancel Workout
          </Button>
          <Button variant="outline" onClick={handlePause} className="w-full sm:w-auto">
            Pause & Resume Later
          </Button>
          <Button onClick={handleComplete} className="w-full sm:w-auto">
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

  return (
    <div className="rounded-lg border bg-muted/50 p-3 space-y-3">
      <p className="text-sm font-medium">Rest Timer Settings</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Between Sets (sec)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={setRest}
            onChange={(e) => setSetRest(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Between Exercises (sec)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={exerciseRest}
            onChange={(e) => setExerciseRest(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onSave(parseInt(setRest) || 60, parseInt(exerciseRest) || 90)}
        >
          Save
        </Button>
      </div>
    </div>
  );
};
