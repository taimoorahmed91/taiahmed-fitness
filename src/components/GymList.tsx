import { GymSession } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Timer, Calendar, Pencil, Clock, ClipboardPlus, StickyNote } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';

interface ParsedNoteEntry {
  type: 'meta' | 'exercise' | 'raw';
  // meta
  text?: string;
  // exercise
  seq?: string;
  name?: string;
  sets?: string[];
  note?: string;
}

const parseNotes = (notes: string): ParsedNoteEntry[] => {
  return notes.split(' | ').map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return { type: 'raw' as const, text: '' };

    // meta line e.g. "Start:09:30 End:10:15"
    if (/^(Start:|End:)/i.test(trimmed) && !trimmed.includes(': S')) {
      return { type: 'meta', text: trimmed };
    }

    // try to extract trailing [note: ...]
    let working = trimmed;
    let noteText: string | undefined;
    const noteMatch = working.match(/\s*\[note:\s*([^\]]*)\]\s*$/i);
    if (noteMatch) {
      noteText = noteMatch[1].trim();
      working = working.slice(0, noteMatch.index).trim();
    }

    // expected: "1.Exercise Name: S1:12@40kg@09:32 S2:..."
    const colonIdx = working.indexOf(':');
    if (colonIdx === -1) {
      return { type: 'raw', text: trimmed };
    }
    const header = working.slice(0, colonIdx).trim();
    const rest = working.slice(colonIdx + 1).trim();

    let seq: string | undefined;
    let name = header;
    const seqMatch = header.match(/^(\d+)\.(.*)$/);
    if (seqMatch) {
      seq = seqMatch[1];
      name = seqMatch[2].trim();
    }

    // split sets by " S" boundary while keeping S prefix
    const sets = rest
      ? rest.split(/\s+(?=S\d+:)/).map((s) => s.trim()).filter(Boolean)
      : [];

    return { type: 'exercise', seq, name, sets, note: noteText };
  });
};

interface GymListProps {
  sessions: GymSession[];
  onDelete: (id: string) => void;
  onEdit: (session: GymSession) => void;
  onCreateTemplate?: (session: GymSession) => void;
}

export const GymList = ({ sessions, onDelete, onEdit, onCreateTemplate }: GymListProps) => {
  const sortedSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    hasNextPage,
    hasPrevPage,
  } = usePagination(sortedSessions, { pageSize: 20 });

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Workout History</CardTitle>
      </CardHeader>
      <CardContent>
        {sortedSessions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No workouts logged yet</p>
        ) : (
          <div className="space-y-2">
            {paginatedItems.map((session) => (
              <div
                key={session.id}
                className="flex items-start justify-between p-3 rounded-lg bg-card border gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words whitespace-pre-wrap">{session.exercise}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {session.duration} min
                    </span>
                    {session.start_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.start_time}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(session.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  {session.notes && (
                    <p className="text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap">{session.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onCreateTemplate && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onCreateTemplate(session)}
                          className="h-8 w-8"
                        >
                          <ClipboardPlus className="h-4 w-4 text-primary" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Create template from this workout</TooltipContent>
                    </Tooltip>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(session)}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(session.id)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={goToPage}
          hasNextPage={hasNextPage}
          hasPrevPage={hasPrevPage}
        />
      </CardContent>
    </Card>
  );
};
