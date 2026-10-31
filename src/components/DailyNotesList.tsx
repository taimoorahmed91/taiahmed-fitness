import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

/**
 * The words "Severity: n/5" always sit on the neutral secondary surface in secondary-foreground text
 * (>= 10:1 in both themes). The level is shown by the border and the dot (non-text contrast >= 3:1),
 * never by tinting the text. Class names are written out in full so Tailwind can see them.
 */
const getSeverityColor = (severity: number | null) => {
  if (!severity) return '';
  if (severity <= 2) return 'border-chart-min bg-secondary text-secondary-foreground';
  if (severity <= 3) return 'border-chart-warn bg-secondary text-secondary-foreground';
  return 'border-destructive bg-secondary text-secondary-foreground';
};
const getSeverityDot = (severity: number) => (severity <= 2 ? 'bg-chart-min' : severity <= 3 ? 'bg-chart-warn' : 'bg-destructive');

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
          <FileText aria-hidden="true" className="h-5 w-5 text-primary" />
          Your Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle aria-hidden="true" className="mx-auto mb-2 h-8 w-8 opacity-50" />
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
                          <Badge variant="secondary" className={`gap-1.5 ${getSeverityColor(note.severity)}`}>
                            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${getSeverityDot(note.severity)}`} />
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
                      <IconButton label={`Edit note for ${note.date}`} tooltip onClick={() => openEdit(note)}>
                        <Pencil />
                      </IconButton>
                      <ConfirmDeleteButton
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onConfirm={() => onDelete(note.id)} confirmationTitle="Delete note?" confirmationDescription={`Are you sure you want to delete the note and tags for ${note.date}? This cannot be undone.`}
                        aria-label={`Delete note for ${note.date}`}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </ConfirmDeleteButton>
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
        <DialogContent layout="mobile-full">
          <DialogHeader>
            <DialogTitle>
              Edit Note {editing && `— ${format(new Date(editing.date), 'PPP')}`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Change the tags, severity or text of this note. Nothing is saved until you press Save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <span id="edit-note-tags-label" className="block text-sm font-medium leading-none">Symptoms / Tags</span>
              <div role="group" aria-labelledby="edit-note-tags-label" className="flex flex-wrap gap-2">
                {SYMPTOM_TAGS.map((tag) => (
                  <ToggleChip key={tag} pressed={editTags.includes(tag)} onPressedChange={() => toggleEditTag(tag)}>
                    {tag}
                  </ToggleChip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span id="edit-note-severity-label" className="block text-sm font-medium leading-none">Severity (optional)</span>
              <div role="group" aria-labelledby="edit-note-severity-label" className="flex gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <Button
                    key={level}
                    type="button"
                    variant={editSeverity === level ? 'default' : 'outline'}
                    size="touch"
                    className="flex-1 px-0"
                    aria-pressed={editSeverity === level}
                    aria-label={`Severity ${level} of 5`}
                    onClick={() => setEditSeverity(editSeverity === level ? null : level)}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-note-text">Additional Notes (optional)</Label>
              <Textarea
                id="edit-note-text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                maxLength={10000}
                rows={6}
                aria-describedby="edit-note-text-hint"
              />
              <p id="edit-note-text-hint" className="text-xs text-muted-foreground">Up to 10,000 characters.</p>
            </div>
          </div>

          <DialogFooter>
            {editTags.length === 0 && !editNotes.trim() && (
              <p id="edit-note-save-hint" className="text-sm text-muted-foreground sm:mr-auto sm:self-center">
                Pick at least one tag or write a note to save.
              </p>
            )}
            <Button type="button" variant="outline" size="touch" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              type="button"
              size="touch"
              onClick={saveEdit}
              aria-disabled={editTags.length === 0 && !editNotes.trim() ? true : undefined}
              aria-describedby={editTags.length === 0 && !editNotes.trim() ? 'edit-note-save-hint' : undefined}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
