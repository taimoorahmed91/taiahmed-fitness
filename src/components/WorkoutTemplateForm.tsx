import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface WorkoutTemplateFormProps {
  onSubmit: (template: { name: string; exercises: string[] }) => void | Promise<void>;
  onDone?: () => void;
}

export const WorkoutTemplateForm = ({ onSubmit, onDone }: WorkoutTemplateFormProps) => {
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<string[]>(['']);

  const handleRemoveExercise = (index: number) => {
    if (exercises.length === 1) {
      toast.error('At least one exercise is required');
      return;
    }
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const handleExerciseChange = (index: number, value: string) => {
    const updated = [...exercises];
    updated[index] = value;
    setExercises(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    onDone?.();
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
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {exercises.map((exercise, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder={`Exercise ${index + 1}`}
                value={exercise}
                onChange={(e) => handleExerciseChange(index, e.target.value)}
                maxLength={200}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveExercise(index)} className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExercises([...exercises, ''])} className="w-full mt-2">
          <Plus className="h-4 w-4 mr-1" />
          Add Exercise
        </Button>
      </div>
      <Button type="submit" className="w-full">Save Template</Button>
    </form>
  );
};
