import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Plus, X, Pencil, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface EditTemplateModalProps {
  template: WorkoutTemplate | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: { name: string; exercises: string[] }) => void;
}

export const EditTemplateModal = ({ template, open, onClose, onSave }: EditTemplateModalProps) => {
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<string[]>(['']);

  useEffect(() => {
    if (template && open) {
      setName(template.name);
      setExercises(template.exercises.length > 0 ? [...template.exercises] : ['']);
    }
  }, [template, open]);

  const handleAddExercise = () => {
    setExercises([...exercises, '']);
  };

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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const items = Array.from(exercises);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setExercises(items);
  };

  const handleSave = () => {
    if (!template) return;
    
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    const validExercises = exercises.filter((ex) => ex.trim());
    if (validExercises.length === 0) {
      toast.error('Please add at least one exercise');
      return;
    }
    
    onSave(template.id, { name: name.trim(), exercises: validExercises });
    onClose();
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-template-name">Template Name</Label>
            <Input
              id="edit-template-name"
              placeholder="e.g., Push Day, Leg Day"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Exercises (drag to reorder)</Label>
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="exercises">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-2 max-h-[200px] overflow-y-auto"
                  >
                    {exercises.map((exercise, index) => (
                      <Draggable key={index} draggableId={`exercise-${index}`} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex gap-2 ${snapshot.isDragging ? 'opacity-70' : ''}`}
                          >
                            <div
                              {...provided.dragHandleProps}
                              className="flex items-center justify-center px-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                            >
                              <GripVertical className="h-4 w-4" />
                            </div>
                            <Input
                              placeholder={`Exercise ${index + 1}`}
                              value={exercise}
                              onChange={(e) => handleExerciseChange(index, e.target.value)}
                              maxLength={200}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveExercise(index)}
                              className="shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddExercise}
              className="w-full mt-2"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Exercise
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSave} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
