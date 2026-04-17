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
  set1: string;
  set2: string;
  set3: string;
  set1Weight?: string;
  set2Weight?: string;
  set3Weight?: string;
}

interface ExerciseTimestamps {
  set1Time?: string;
  set2Time?: string;
  set3Time?: string;
}

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

const parseNotesToPreviousReps = (notes: string | undefined): { reps: PreviousReps; notes: Record<string, string> } => {
  const result: PreviousReps = {};
  const noteMap: Record<string, string> = {};
  if (!notes) return { reps: result, notes: noteMap };

  const exerciseParts = notes.split(' | ');
  for (const part of exerciseParts) {
    // Strip leading sequence prefix like "1." if present
    const cleaned = part.replace(/^\d+\./, '');
    const colonIndex = cleaned.indexOf(':');
    if (colonIndex === -1) continue;
    
    const exerciseName = cleaned.substring(0, colonIndex).trim();
    let setsText = cleaned.substring(colonIndex + 1).trim();

    // Extract trailing note: "[note: ...]"
    const noteMatch = setsText.match(/\s*\[note:\s*([^\]]*)\]\s*$/);
    if (noteMatch) {
      noteMap[exerciseName] = noteMatch[1].trim();
      setsText = setsText.replace(noteMatch[0], '').trim();
    }

    const sets: ExerciseSets = { set1: '', set2: '', set3: '' };
    // Match S<n>:<reps> optionally followed by @<weight>kg
    const setMatches = setsText.match(/S(\d):(\d+)(?:@(\d+(?:\.\d+)?)kg)?/g);
    if (setMatches) {
      for (const match of setMatches) {
        const m = match.match(/S(\d):(\d+)(?:@(\d+(?:\.\d+)?)kg)?/);
        if (!m) continue;
        const [, setNum, reps, weight] = m;
        if (setNum === '1') { sets.set1 = reps; if (weight) sets.set1Weight = weight; }
        else if (setNum === '2') { sets.set2 = reps; if (weight) sets.set2Weight = weight; }
        else if (setNum === '3') { sets.set3 = reps; if (weight) sets.set3Weight = weight; }
      }
    }
    result[exerciseName] = sets;
  }
  return { reps: result, notes: noteMap };
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
  const [previousReps, setPreviousReps] = useState<PreviousReps>({});
  const [previousNotes, setPreviousNotes] = useState<Record<string, string>>({});
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
  }, [open, template, startTime, extraExercises, exerciseSets, exerciseTimestamps, exerciseSequence, exerciseNotes, nextSequence, expandedExercise, isRestTimerActive, restTimerRemaining, restTimerTotal, restTimerType]);

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
        prevExerciseSets.current = JSON.parse(JSON.stringify(savedState.exerciseSets));
        setExpandedExercise(savedState.expandedExercise);
        setIsRestored(true);

        // Restore rest timer if active
        if (savedState.restTimer) {
          const elapsed = Math.floor((Date.now() - new Date(savedState.restTimer.startedAt).getTime()) / 1000);
          const totalElapsed = savedState.restTimer.total - savedState.restTimer.remaining + elapsed;
          const remaining = Math.max(0, savedState.restTimer.total - totalElapsed);
          if (remaining > 0) {
            setRestTimerRemaining(remaining);
            setRestTimerTotal(savedState.restTimer.total);
            setRestTimerType(savedState.restTimer.type);
            restTimerStartedAt.current = new Date();
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
        template.exercises.forEach((_, index) => {
          initialSets[index] = { set1: '', set2: '', set3: '' };
          initialTimestamps[index] = {};
        });
        setExerciseSets(initialSets);
        setExerciseTimestamps(initialTimestamps);
        prevExerciseSets.current = JSON.parse(JSON.stringify(initialSets));
        logActivity({ action: 'start_workout', category: 'gym', details: { template_name: template.name, exercises: template.exercises } });
      }
      
      setPreviousReps({});
      setShowAddExercise(false);
      setNewExerciseName('');

      if (getLastSession) {
        getLastSession(template.name).then((lastSession) => {
          if (lastSession?.notes) {
            const parsed = parseNotesToPreviousReps(lastSession.notes);
            setPreviousReps(parsed);

            // Pre-fill empty sets from last session (only on a fresh start, not when restoring an in-progress workout)
            if (!savedState || savedState.templateId !== template.id) {
              setExerciseSets((prev) => {
                const next = { ...prev };
                template.exercises.forEach((exercise, index) => {
                  const last = parsed[exercise];
                  if (!last) return;
                  const cur = next[index] || { set1: '', set2: '', set3: '' };
                  next[index] = {
                    set1: cur.set1 || last.set1 || '',
                    set2: cur.set2 || last.set2 || '',
                    set3: cur.set3 || last.set3 || '',
                    set1Weight: cur.set1Weight || last.set1Weight || '',
                    set2Weight: cur.set2Weight || last.set2Weight || '',
                    set3Weight: cur.set3Weight || last.set3Weight || '',
                  };
                });
                prevExerciseSets.current = JSON.parse(JSON.stringify(next));
                return next;
              });
            }
          }
        });
      }
    }
  }, [open, template, getLastSession]);

  // Main workout timer
  useEffect(() => {
    if (!open || !startTime) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [open, startTime]);

  // Rest timer countdown
  useEffect(() => {
    if (!isRestTimerActive || restTimerRemaining <= 0) return;
    const interval = setInterval(() => {
      setRestTimerRemaining((prev) => {
        if (prev <= 1) {
          setIsRestTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRestTimerActive, restTimerRemaining]);

  const startRestTimer = (type: 'set' | 'exercise') => {
    const duration = type === 'set' ? timerSettings.setRestSeconds : timerSettings.exerciseRestSeconds;
    setRestTimerTotal(duration);
    setRestTimerRemaining(duration);
    setRestTimerType(type);
    restTimerStartedAt.current = new Date();
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
    prevExerciseSets.current = {
      ...prevExerciseSets.current,
      [newIndex]: { set1: '', set2: '', set3: '' },
    };
    setExpandedExercise(newIndex);
    setNewExerciseName('');
    setShowAddExercise(false);
  };

  const updateSet = (exerciseIndex: number, setKey: keyof ExerciseSets, value: string) => {
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    
    const isWeightField = setKey.endsWith('Weight');
    const repKey = (isWeightField ? setKey.replace('Weight', '') : setKey) as 'set1' | 'set2' | 'set3';
    const prevValue = prevExerciseSets.current[exerciseIndex]?.[setKey] || '';
    
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

      // Assign sequence number on first set entry for this exercise
      if (repKey === 'set1') {
        setExerciseSequence((prev) => {
          if (prev[exerciseIndex] !== undefined) return prev;
          const seq = nextSequence;
          setNextSequence((n) => n + 1);
          return { ...prev, [exerciseIndex]: seq };
        });
      }

      if (repKey === 'set3') {
        startRestTimer('exercise');
      } else {
        startRestTimer('set');
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
    return sets && (sets.set1 || sets.set2 || sets.set3);
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
      if (sets && (sets.set1 || sets.set2 || sets.set3)) {
        entries.push({ exercise, index, seq: exerciseSequence[index] ?? 999 });
      }
    });
    entries.sort((a, b) => a.seq - b.seq);

    const lines: string[] = [`Start:${startTimeStr} End:${endTimeStr}`];
    entries.forEach((entry) => {
      const sets = exerciseSets[entry.index];
      const ts = exerciseTimestamps[entry.index];
      const buildSet = (n: 1 | 2 | 3) => {
        const repKey = `set${n}` as 'set1' | 'set2' | 'set3';
        const wKey = `set${n}Weight` as 'set1Weight' | 'set2Weight' | 'set3Weight';
        const tKey = `set${n}Time` as keyof ExerciseTimestamps;
        const reps = sets[repKey];
        if (!reps) return null;
        const weight = sets[wKey];
        const time = ts?.[tKey];
        return `S${n}:${reps}${weight ? `@${weight}kg` : ''}${time ? `@${time}` : ''}`;
      };
      const setsText = [buildSet(1), buildSet(2), buildSet(3)].filter(Boolean).join(' ');
      lines.push(`${entry.seq}.${entry.exercise}: ${setsText}`);
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
                          {exerciseSequence[index] !== undefined && (
                            <span className="text-xs text-muted-foreground mr-1">{exerciseSequence[index]}.</span>
                          )}
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
                    {/* Set number headers */}
                    <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 items-center">
                      <div />
                      {[1, 2, 3].map((n) => (
                        <Label key={n} className="text-[11px] text-muted-foreground text-center">
                          Set {n}
                        </Label>
                      ))}
                    </div>

                    {/* Reps row */}
                    <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 items-center">
                      <Label className="text-xs font-medium">Reps</Label>
                      {(['set1', 'set2', 'set3'] as const).map((setKey) => {
                        const prevSet = previousReps[exercise];
                        const prevReps = prevSet?.[setKey] || '';
                        return (
                          <Input
                            key={setKey}
                            id={`${setKey}-${index}`}
                            type="text"
                            inputMode="numeric"
                            placeholder={prevReps || '0'}
                            value={exerciseSets[index]?.[setKey] || ''}
                            onChange={(e) => updateSet(index, setKey, e.target.value)}
                            className="h-9 text-center"
                            maxLength={3}
                          />
                        );
                      })}
                    </div>

                    {/* Weight row */}
                    <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 items-center">
                      <Label className="text-xs font-medium">Weight (kg)</Label>
                      {(['set1', 'set2', 'set3'] as const).map((setKey) => {
                        const prevSet = previousReps[exercise];
                        const weightKey = `${setKey}Weight` as 'set1Weight' | 'set2Weight' | 'set3Weight';
                        const prevWeight = prevSet?.[weightKey] || defaultWeight || '';
                        return (
                          <Input
                            key={weightKey}
                            id={`${weightKey}-${index}`}
                            type="text"
                            inputMode="decimal"
                            placeholder={prevWeight || 'kg'}
                            value={exerciseSets[index]?.[weightKey] || ''}
                            onChange={(e) => updateSet(index, weightKey, e.target.value)}
                            className="h-9 text-center"
                            maxLength={5}
                          />
                        );
                      })}
                    </div>

                    {/* Timestamps row */}
                    {(exerciseTimestamps[index]?.set1Time || exerciseTimestamps[index]?.set2Time || exerciseTimestamps[index]?.set3Time) && (
                      <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2 items-center">
                        <span className="text-[10px] text-muted-foreground">Logged at</span>
                        {(['set1Time', 'set2Time', 'set3Time'] as const).map((tKey) => (
                          <p key={tKey} className="text-[10px] text-primary text-center">
                            {exerciseTimestamps[index]?.[tKey] ? `⏱ ${exerciseTimestamps[index][tKey]}` : '—'}
                          </p>
                        ))}
                      </div>
                    )}
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
