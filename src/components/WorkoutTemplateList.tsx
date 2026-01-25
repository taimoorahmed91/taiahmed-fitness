import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Play, ClipboardList, Pencil } from 'lucide-react';

interface WorkoutTemplateListProps {
  templates: WorkoutTemplate[];
  onDelete: (id: string) => void;
  onStart: (template: WorkoutTemplate) => void;
  onEdit: (template: WorkoutTemplate) => void;
}

export const WorkoutTemplateList = ({ templates, onDelete, onStart, onEdit }: WorkoutTemplateListProps) => {
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5 text-primary" />
          My Templates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          {templates.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No templates yet</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-start justify-between p-3 rounded-lg bg-card border gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.exercises.length} exercise{template.exercises.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.exercises.slice(0, 3).map((ex, i) => (
                        <span
                          key={i}
                          className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded"
                        >
                          {ex}
                        </span>
                      ))}
                      {template.exercises.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{template.exercises.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onStart(template)}
                      className="h-8"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(template)}
                      className="h-8 w-8"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(template.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
