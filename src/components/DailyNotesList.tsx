import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Trash2, AlertCircle } from 'lucide-react';
import { DailyNote } from '@/hooks/useDailyNotes';

interface DailyNotesListProps {
  notes: DailyNote[];
  onDelete: (id: string) => void;
}

const getSeverityColor = (severity: number | null) => {
  if (!severity) return '';
  if (severity <= 2) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
  if (severity <= 3) return 'bg-orange-500/20 text-orange-700 dark:text-orange-400';
  return 'bg-red-500/20 text-red-700 dark:text-red-400';
};

export const DailyNotesList = ({ notes, onDelete }: DailyNotesListProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Your Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notes yet</p>
            <p className="text-sm">Add your first daily note above</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">
                          {format(new Date(note.date), 'EEE, MMM d, yyyy')}
                        </span>
                        {note.severity && (
                          <Badge variant="secondary" className={getSeverityColor(note.severity)}>
                            Severity: {note.severity}/5
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {note.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      {note.notes && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{note.notes}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => onDelete(note.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
