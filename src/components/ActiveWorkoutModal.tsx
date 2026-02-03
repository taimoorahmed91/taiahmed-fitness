import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Timer, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { GymSession } from '@/types';

const ACTIVE_WORKOUT_KEY = 'fittrack-active-workout';

interface ExerciseSets {
  set1: string;
  set2: string;
  set3: string;
}

interface PreviousReps {
  [exerciseName: string]: ExerciseSets;
}

interface ActiveWorkoutState {
  templateId: string;
  templateName: string;
  exercises: string[];
  startTime: string; // ISO string
  exerciseSets: Record<number, ExerciseSets>;
  expandedExercise: number | null;
}

interface ActiveWorkoutModalProps {
  template: WorkoutTemplate | null;
  open: boolean;
  onClose: () => void;
  onFinish: (data: { exercise: string; duration: number; date: string; notes?: string; start_time?: string }) => void;
  getLastSession?: (templateName: string) => Promise<GymSession | null>;
}

// Parse notes like "Knee Pushup: S1:12 S2:10 S3:8 | Squats: S1:15 S2:12 S3:10"
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

const saveActiveWorkout = (state: ActiveWorkoutState) => {
  localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(state));
};

const loadActiveWorkout = (): ActiveWorkoutState | null => {
  try {
    const saved = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
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
      };
      saveActiveWorkout(state);
    }
  }, [open, template, startTime, exerciseSets, expandedExercise]);

  // Persist state on changes
  useEffect(() => {
    if (isRestored || (open && startTime)) {
      persistState();
    }
  }, [persistState, isRestored, open, startTime]);

  useEffect(() => {
    if (open && template) {
      // Check for saved workout state
      const savedState = loadActiveWorkout();
      
      if (savedState && savedState.templateId === template.id) {
        // Restore saved state
        setStartTime(new Date(savedState.startTime));
        setExerciseSets(savedState.exerciseSets);
        setExpandedExercise(savedState.expandedExercise);
        setIsRestored(true);
      } else {
        // Start fresh workout
        setStartTime(new Date());
        setElapsedSeconds(0);
        setExpandedExercise(0);
        setIsRestored(false);
        
        // Initialize empty sets for all exercises
        const initialSets: Record<number, ExerciseSets> = {};
        template.exercises.forEach((_, index) => {
          initialSets[index] = { set1: '', set2: '', set3: '' };
        });
        setExerciseSets(initialSets);
      }
      
      setPreviousReps({});

      // Fetch previous workout data
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

  useEffect(() => {
    if (!open || !startTime) return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [open, startTime]);

  const updateSet = (exerciseIndex: number, setKey: keyof ExerciseSets, value: string) => {
    // Only allow numbers
    if (value && !/^\d*$/.test(value)) return;
    
    setExerciseSets((prev) => ({
      ...prev,
      [exerciseIndex]: {
        ...prev[exerciseIndex],
        [setKey]: value,
      },
    }));
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
    
    // Format start time as HH:MM
    const formattedStartTime = `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;

    // Clear saved state - workout is complete
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
    // Just close the modal - state is already saved in localStorage
    // User can resume later, no entry is created
    onClose();
  };

  const handleCancel = () => {
    // Cancel completely - clear saved state and don't create entry
    clearActiveWorkout();
    onClose();
  };

  const completedCount = template ? template.exercises.filter((_, i) => isExerciseComplete(i)).length : 0;
  const allCompleted = template && completedCount === template.exercises.length;

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            {template.name}
          </DialogTitle>
        </DialogHeader>

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
