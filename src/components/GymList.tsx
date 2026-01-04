import { GymSession } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Timer, Calendar } from 'lucide-react';

interface GymListProps {
  sessions: GymSession[];
  onDelete: (id: string) => void;
}

export const GymList = ({ sessions, onDelete }: GymListProps) => {
  const sortedSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Workout History</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {sortedSessions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No workouts logged yet</p>
          ) : (
            <div className="space-y-2">
              {sortedSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-start justify-between p-3 rounded-lg bg-card border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{session.exercise}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {session.duration} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(session.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    {session.notes && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{session.notes}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(session.id)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
