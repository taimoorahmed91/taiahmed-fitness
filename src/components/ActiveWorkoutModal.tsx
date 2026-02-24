import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Timer, CheckCircle2, ChevronDown, ChevronUp, Clock, Settings2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { GymSession } from '@/types';
import { Progress } from '@/components/ui/progress';

const ACTIVE_WORKOUT_KEY = 'fittrack-active-workout';
const REST_TIMER_SETTINGS_KEY = 'fittrack-rest-timer-settings';

interface ExerciseSets {
  set1: string;
  set2: string;
  set3: string;
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
  startTime: string;
  exerciseSets: Record<number, ExerciseSets>;
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
  onFinish: (data: { exercise: string; duration: number; date: string; notes?: string; start_time?: string }) => void;
  getLastSession?: (templateName: string) => Promise<GymSession | null>;
}

const parseNotesToPreviousReps = (notes: string | undefined): PreviousReps => {
  const result: PreviousReps = {};
  if (!notes) return result;

  const exerciseParts = notes.split(' | ');
  for (const part of exerciseParts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) continue;
    
    const exerciseName = part.substring(0, colonIndex).trim();
    const setsText = part.substring(colonIndex + 1).trim();
    
    const sets: ExerciseSets = { set1: '', set2: '', set3: '' };
    const setMatches = setsText.match(/S(\d):(\d+)/g);
    if (setMatches) {
      for (const match of setMatches) {
        const [, setNum, reps] = match.match(/S(\d):(\d+)/) || [];
        if (setNum === '1') sets.set1 = reps;
        else if (setNum === '2') sets.set2 = reps;
        else if (setNum === '3') sets.set3 = reps;
      }
    }
    result[exerciseName] = sets;
  }
  return result;
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
  const [exerciseSets, setExerciseSets] = useState<Record<number, ExerciseSets>>({});
  const [previousReps, setPreviousReps] = useState<PreviousReps>({});
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRestored, setIsRestored] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

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

  // Save state to localStorage whenever it changes
  const persistState = useCallback(() => {
    if (open && template && startTime) {
      const state: ActiveWorkoutState = {
        templateId: template.id,
        templateName: template.name,
        exercises: template.exercises,
        startTime: startTime.toISOString(),
        exerciseSets,
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
  }, [open, template, startTime, exerciseSets, expandedExercise, isRestTimerActive, restTimerRemaining, restTimerTotal, restTimerType]);

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
        setExerciseSets(savedState.exerciseSets);
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
        
        const initialSets: Record<number, ExerciseSets> = {};
        template.exercises.forEach((_, index) => {
          initialSets[index] = { set1: '', set2: '', set3: '' };
        });
        setExerciseSets(initialSets);
        prevExerciseSets.current = JSON.parse(JSON.stringify(initialSets));
      }
      
      setPreviousReps({});

      if (getLastSession) {
        getLastSession(template.name).then((lastSession) => {
          if (lastSession?.notes) {
            const parsed = parseNotesToPreviousReps(lastSession.notes);
            setPreviousReps(parsed);
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

  const updateSet = (exerciseIndex: number, setKey: keyof ExerciseSets, value: string) => {
    if (value && !/^\d*$/.test(value)) return;
    
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

    // Trigger rest timer only when a value is newly entered (was empty, now has value)
    if (!prevValue && value) {
      if (setKey === 'set3') {
        // Last set completed → exercise rest timer
        startRestTimer('exercise');
      } else {
        // Set 1 or 2 completed → set rest timer
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
    if (!template) return '';
    const lines: string[] = [];
    template.exercises.forEach((exercise, index) => {
      const sets = exerciseSets[index];
      if (sets && (sets.set1 || sets.set2 || sets.set3)) {
        const setsText = [
          sets.set1 ? `S1:${sets.set1}` : null,
          sets.set2 ? `S2:${sets.set2}` : null,
          sets.set3 ? `S3:${sets.set3}` : null,
        ].filter(Boolean).join(' ');
        lines.push(`${exercise}: ${setsText}`);
      }
    });
    return lines.join(' | ');
  };

  const handleComplete = () => {
    if (!template || !startTime) return;
    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
    const notes = formatSetsForNotes();
    const formattedStartTime = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
    clearActiveWorkout();
    onFinish({
      exercise: template.name,
      duration: durationMinutes,
      date: new Date().toISOString().split('T')[0],
      notes: notes || undefined,
      start_time: formattedStartTime,
    });
    onClose();
  };

  const handlePause = () => {
    onClose();
  };

  const handleCancel = () => {
    setIsCancelled(true);
    clearActiveWorkout();
    onClose();
  };

  const handleSaveSettings = (setRest: number, exerciseRest: number) => {
    const newSettings = { setRestSeconds: setRest, exerciseRestSeconds: exerciseRest };
    setTimerSettings(newSettings);
    saveRestTimerSettings(newSettings);
    setShowSettings(false);
  };

  const completedCount = template ? template.exercises.filter((_, i) => isExerciseComplete(i)).length : 0;

  if (!template) return null;

  const restTimerProgress = restTimerTotal > 0 ? ((restTimerTotal - restTimerRemaining) / restTimerTotal) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
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
          {completedCount}/{template.exercises.length} exercises completed
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {template.exercises.map((exercise, index) => (
            <Collapsible
              key={index}
              open={expandedExercise === index}
              onOpenChange={(isOpen) => setExpandedExercise(isOpen ? index : null)}
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
                      <span className={`font-medium ${isExerciseComplete(index) ? 'text-primary' : ''}`}>
                        {exercise}
                      </span>
                    </div>
                    {expandedExercise === index ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1">
                    <Label className="text-xs text-muted-foreground mb-2 block">
                      Enter reps for each set
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['set1', 'set2', 'set3'] as const).map((setKey, setIndex) => {
                        const prevReps = previousReps[exercise]?.[setKey] || '0';
                        return (
                          <div key={setKey} className="space-y-1">
                            <Label htmlFor={`${setKey}-${index}`} className="text-xs">
                              Set {setIndex + 1}
                            </Label>
                            <Input
                              id={`${setKey}-${index}`}
                              type="text"
                              inputMode="numeric"
                              placeholder={prevReps}
                              value={exerciseSets[index]?.[setKey] || ''}
                              onChange={(e) => updateSet(index, setKey, e.target.value)}
                              className="h-9"
                              maxLength={3}
                            />
                            <p className="text-[10px] text-muted-foreground text-center">
                              Last: {prevReps}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
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
