import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { InlineUndo } from '@/components/ui/inline-undo';
import { useUndoableList } from '@/hooks/useUndoableList';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Plus, X, Pencil, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { confirmedSuccess, SAVE_FAILED_MESSAGE } from '@/lib/confirmedMutation';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface EditTemplateModalProps {
  template: WorkoutTemplate | null;
  open: boolean;
  onClose: () => void;
  /** Must resolve `true` only when the change was confirmed. `false`, anything else, or a rejection keeps this dialog open. */
  onSave: (id: string, updates: { name: string; exercises: string[] }) => Promise<boolean> | boolean;
}

export const EditTemplateModal = ({ template, open, onClose, onSave }: EditTemplateModalProps) => {
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<string[]>(['']);
  const { removed, remove, undo, dismiss } = useUndoableList(exercises, setExercises);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (template && open) {
      setName(template.name);
      setExercises(template.exercises.length > 0 ? [...template.exercises] : ['']);
      dismiss();
      setSaveFailed(false);
    }
  }, [template, open, dismiss]);

  const handleAddExercise = () => {
    setExercises([...exercises, '']);
  };

  const handleRemoveExercise = (index: number) => {
    if (exercises.length === 1) {
      toast.error('At least one exercise is required');
      return;
    }
    // Edits only take effect on Save, so removal is immediate and can be undone.
    remove(index);
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

  const handleSave = async () => {
    if (!template || savingRef.current) return;
    
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    const validExercises = exercises.filter((ex) => ex.trim());
    if (validExercises.length === 0) {
      toast.error('Please add at least one exercise');
      return;
    }
    
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    let saved = false;
    try {
      saved = await confirmedSuccess(() => onSave(template.id, { name: name.trim(), exercises: validExercises }), { requireTrue: true });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // Close only after the change was confirmed; on failure the draft stays and the error is shown.
    if (saved) onClose();
    else setSaveFailed(true);
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !saving && onClose()}>
      <DialogContent layout="mobile-full" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Template
          </DialogTitle>
          <DialogDescription className="sr-only">
            Change the template name and its exercises. Nothing is saved until you press Save Changes.
          </DialogDescription>
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
                    className="space-y-2"
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
                              aria-label={`Reorder exercise ${index + 1}`}
                              className="flex items-center justify-center px-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-w-11"
                            >
                              <GripVertical aria-hidden="true" className="h-4 w-4" />
                            </div>
                            <Input
                              placeholder={`Exercise ${index + 1}`}
                              aria-label={`Exercise ${index + 1}`}
                              value={exercise}
                              onChange={(e) => handleExerciseChange(index, e.target.value)}
                              maxLength={200}
                              className="flex-1"
                            />
                            <IconButton
                              label={`Remove exercise ${index + 1}${exercise ? `: ${exercise}` : ''}`}
                              className="shrink-0"
                              onClick={() => handleRemoveExercise(index)}
                            >
                              <X />
                            </IconButton>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <InlineUndo message={removed ? `Removed “${removed.value || `Exercise ${removed.index + 1}`}”` : null} onUndo={undo} />
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

        {saveFailed && <p role="alert" className="text-sm text-destructive">{SAVE_FAILED_MESSAGE}</p>}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} loadingText="Saving…" className="w-full sm:w-auto">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
