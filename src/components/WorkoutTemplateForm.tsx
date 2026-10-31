import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { InlineUndo } from '@/components/ui/inline-undo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { useUndoableList } from '@/hooks/useUndoableList';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface WorkoutTemplateFormProps {
  onSubmit: (template: { name: string; exercises: string[] }) => void | Promise<void>;
  onDone?: () => void;
}

export const WorkoutTemplateForm = ({ onSubmit, onDone }: WorkoutTemplateFormProps) => {
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<string[]>(['']);
  const { removed, remove, undo, dismiss } = useUndoableList(exercises, setExercises);

  // Nothing is saved yet, so removal is immediate and can be undone (no confirmation dialog).
  const handleRemoveExercise = (index: number) => {
    if (exercises.length === 1) {
      toast.error('At least one exercise is required');
      return;
    }
    remove(index);
  };

  const handleExerciseChange = (index: number, value: string) => {
    const updated = [...exercises];
    updated[index] = value;
    setExercises(updated);
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    const validExercises = exercises.filter((ex) => ex.trim());
    if (validExercises.length === 0) {
      toast.error('Please add at least one exercise');
      return;
    }
    await onSubmit({ name: name.trim(), exercises: validExercises });
    setName('');
    setExercises(['']);
    dismiss();
    onDone?.();
  };
  const { run: runSubmit, pending } = useSingleFlight(submit);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The caller reports save errors; on failure the form keeps everything the user typed.
    void runSubmit().catch(() => undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="template-name">Template Name</Label>
        <Input
          id="template-name"
          placeholder="e.g., Push Day, Leg Day"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
      </div>
      <div className="space-y-2">
        <Label>Exercises</Label>
        <div className="space-y-2">
          {exercises.map((exercise, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder={`Exercise ${index + 1}`}
                aria-label={`Exercise ${index + 1}`}
                value={exercise}
                onChange={(e) => handleExerciseChange(index, e.target.value)}
                maxLength={200}
              />
              <IconButton label={`Remove exercise ${index + 1}${exercise ? `: ${exercise}` : ''}`} className="shrink-0" onClick={() => handleRemoveExercise(index)}>
                <X />
              </IconButton>
            </div>
          ))}
        </div>
        <InlineUndo message={removed ? `Removed “${removed.value || `Exercise ${removed.index + 1}`}”` : null} onUndo={undo} />
        <Button type="button" variant="outline" size="sm" onClick={() => setExercises([...exercises, ''])} className="w-full mt-2">
          <Plus className="h-4 w-4 mr-1" />
          Add Exercise
        </Button>
      </div>
      <Button type="submit" className="w-full" loading={pending} loadingText="Saving…">Save Template</Button>
    </form>
  );
};
