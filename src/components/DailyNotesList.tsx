import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Trash2, AlertCircle, Pencil } from 'lucide-react';
import { DailyNote, SYMPTOM_TAGS } from '@/hooks/useDailyNotes';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';

interface DailyNotesListProps {
  notes: DailyNote[];
  onDelete: (id: string) => void;
  onEdit: (note: { date: string; tags: string[]; severity?: number | null; notes?: string }) => void;
}

const getSeverityColor = (severity: number | null) => {
  if (!severity) return '';
  if (severity <= 2) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
  if (severity <= 3) return 'bg-orange-500/20 text-orange-700 dark:text-orange-400';
  return 'bg-red-500/20 text-red-700 dark:text-red-400';
};

export const DailyNotesList = ({ notes, onDelete, onEdit }: DailyNotesListProps) => {
  const pagination = usePagination(notes, { pageSize: 20 });
  const [editing, setEditing] = useState<DailyNote | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editSeverity, setEditSeverity] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const openEdit = (note: DailyNote) => {
    setEditing(note);
    setEditTags(note.tags || []);
    setEditSeverity(note.severity);
    setEditNotes(note.notes || '');
  };

  const toggleEditTag = (tag: string) => {
    setEditTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editTags.length === 0 && !editNotes.trim()) return;
    onEdit({
      date: editing.date,
      tags: editTags,
      severity: editSeverity,
      notes: editNotes.trim() || undefined,
    });
    setEditing(null);
  };

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
          <>
            <div className="space-y-3">
              {pagination.paginatedItems.map((note) => (
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
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{note.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(note)}
                        aria-label="Edit note"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(note.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <PaginationControls
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              onPageChange={pagination.goToPage}
              hasNextPage={pagination.hasNextPage}
              hasPrevPage={pagination.hasPrevPage}
            />
          </>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Note {editing && `— ${format(new Date(editing.date), 'PPP')}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Symptoms / Tags</Label>
              <div className="flex flex-wrap gap-2">
                {SYMPTOM_TAGS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={editTags.includes(tag) ? 'default' : 'outline'}
                    className="cursor-pointer transition-colors"
                    onClick={() => toggleEditTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Severity (optional)</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <Button
                    key={level}
                    type="button"
                    variant={editSeverity === level ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditSeverity(editSeverity === level ? null : level)}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Additional Notes (optional)</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                maxLength={10000}
                rows={6}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editTags.length === 0 && !editNotes.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
