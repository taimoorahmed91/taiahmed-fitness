import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Timer, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ExerciseSets {
  set1: string;
  set2: string;
  set3: string;
}

interface ActiveWorkoutModalProps {
  template: WorkoutTemplate | null;
  open: boolean;
  onClose: () => void;
  onFinish: (data: { exercise: string; duration: number; date: string; notes?: string }) => void;
}

export const ActiveWorkoutModal = ({ template, open, onClose, onFinish }: ActiveWorkoutModalProps) => {
  const [exerciseSets, setExerciseSets] = useState<Record<number, ExerciseSets>>({});
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (open && template) {
      setStartTime(new Date());
      setElapsedSeconds(0);
      setExpandedExercise(0); // Open first exercise by default
      
      // Initialize empty sets for all exercises
      const initialSets: Record<number, ExerciseSets> = {};
      template.exercises.forEach((_, index) => {
        initialSets[index] = { set1: '', set2: '', set3: '' };
      });
      setExerciseSets(initialSets);
    }
  }, [open, template]);

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

  const handleFinish = () => {
    if (!template || !startTime) return;

    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

    const notes = formatSetsForNotes();

    onFinish({
      exercise: template.name,
      duration: durationMinutes,
      date: new Date().toISOString().split('T')[0],
      notes: notes || undefined,
    });

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
                      <div className="space-y-1">
                        <Label htmlFor={`set1-${index}`} className="text-xs">Set 1</Label>
                        <Input
                          id={`set1-${index}`}
                          type="text"
                          inputMode="numeric"
                          placeholder="Reps"
                          value={exerciseSets[index]?.set1 || ''}
                          onChange={(e) => updateSet(index, 'set1', e.target.value)}
                          className="h-9"
                          maxLength={3}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`set2-${index}`} className="text-xs">Set 2</Label>
                        <Input
                          id={`set2-${index}`}
                          type="text"
                          inputMode="numeric"
                          placeholder="Reps"
                          value={exerciseSets[index]?.set2 || ''}
                          onChange={(e) => updateSet(index, 'set2', e.target.value)}
                          className="h-9"
                          maxLength={3}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`set3-${index}`} className="text-xs">Set 3</Label>
                        <Input
                          id={`set3-${index}`}
                          type="text"
                          inputMode="numeric"
                          placeholder="Reps"
                          value={exerciseSets[index]?.set3 || ''}
                          onChange={(e) => updateSet(index, 'set3', e.target.value)}
                          className="h-9"
                          maxLength={3}
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleFinish} className="w-full sm:w-auto">
            {allCompleted ? 'Finish Workout' : 'Finish (Partial)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
