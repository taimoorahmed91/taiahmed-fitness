import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Timer, CheckCircle2 } from 'lucide-react';

interface ActiveWorkoutModalProps {
  template: WorkoutTemplate | null;
  open: boolean;
  onClose: () => void;
  onFinish: (data: { exercise: string; duration: number; date: string }) => void;
}

export const ActiveWorkoutModal = ({ template, open, onClose, onFinish }: ActiveWorkoutModalProps) => {
  const [checkedExercises, setCheckedExercises] = useState<Set<number>>(new Set());
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (open && template) {
      setStartTime(new Date());
      setCheckedExercises(new Set());
      setElapsedSeconds(0);
    }
  }, [open, template]);

  useEffect(() => {
    if (!open || !startTime) return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [open, startTime]);

  const toggleExercise = (index: number) => {
    const updated = new Set(checkedExercises);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setCheckedExercises(updated);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFinish = () => {
    if (!template || !startTime) return;

    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
    const completedExercises = template.exercises.filter((_, i) => checkedExercises.has(i));
    
    const exerciseText = completedExercises.length > 0 
      ? `${template.name}: ${completedExercises.join(', ')}`
      : template.name;

    onFinish({
      exercise: exerciseText,
      duration: durationMinutes,
      date: new Date().toISOString().split('T')[0],
    });

    onClose();
  };

  const allCompleted = template && checkedExercises.size === template.exercises.length;

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            {template.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center py-4">
          <div className="text-4xl font-mono font-bold text-primary">
            {formatTime(elapsedSeconds)}
          </div>
        </div>

        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {template.exercises.map((exercise, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                checkedExercises.has(index) ? 'bg-primary/10 border-primary/30' : 'bg-card'
              }`}
            >
              <Checkbox
                id={`exercise-${index}`}
                checked={checkedExercises.has(index)}
                onCheckedChange={() => toggleExercise(index)}
              />
              <Label
                htmlFor={`exercise-${index}`}
                className={`flex-1 cursor-pointer ${
                  checkedExercises.has(index) ? 'line-through text-muted-foreground' : ''
                }`}
              >
                {exercise}
              </Label>
              {checkedExercises.has(index) && (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
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
