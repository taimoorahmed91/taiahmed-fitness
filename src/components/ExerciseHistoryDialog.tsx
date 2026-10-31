import { useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { exerciseHistory } from '@/lib/workoutStats';
import { GymSession } from '@/types';

interface Props {
  exercise: string | null;
  sessions: GymSession[];
  aliases: Record<string, string>;
  onClose: () => void;
}

export const ExerciseHistoryDialog = ({ exercise, sessions, aliases, onClose }: Props) => {
  const history = useMemo(() => (exercise ? exerciseHistory(sessions, exercise, aliases) : []), [exercise, sessions, aliases]);
  const first = history[0];
  const last = history[history.length - 1];
  const best = history.reduce((m, h) => Math.max(m, h.topWeight), 0);
  const bestVolume = history.reduce((m, h) => Math.max(m, h.volume), 0);
  const delta = first && last ? Math.round((last.topWeight - first.topWeight) * 10) / 10 : 0;

  return (
    <Dialog open={!!exercise} onOpenChange={(o) => !o && onClose()}>
      <DialogContent layout="scroll" closeLabel="Close exercise history" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-words">{exercise}</DialogTitle>
          <DialogDescription className="sr-only">
            Top weight and volume for this exercise in each saved workout, oldest to newest.
          </DialogDescription>
        </DialogHeader>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No weighted sets logged yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="min-w-0 rounded-lg border p-2"><p className="text-xs text-muted-foreground">Heaviest</p><p className="break-words font-bold text-primary">{best} kg</p></div>
              <div className="min-w-0 rounded-lg border p-2"><p className="text-xs text-muted-foreground">Best volume</p><p className="break-words font-bold">{Math.round(bestVolume).toLocaleString()} kg</p></div>
              <div className="min-w-0 rounded-lg border p-2"><p className="text-xs text-muted-foreground">First → latest</p><p className="break-words font-bold">{delta > 0 ? '+' : ''}{delta} kg</p></div>
            </div>
            {history.length > 1 && (
              <div className="h-56" role="img" aria-label={`Chart of top weight and volume over ${history.length} workouts. The list below has the same numbers.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={history} margin={{ left: 0, right: 0, top: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(d) => d.slice(5)} />
                    <YAxis yAxisId="w" width={44} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" domain={['auto', 'auto']} />
                    <YAxis yAxisId="v" orientation="right" width={44} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Line yAxisId="w" type="monotone" dataKey="topWeight" name="Top weight (kg)" stroke="hsl(var(--chart-actual))" strokeWidth={2.5} dot />
                    <Line yAxisId="v" type="monotone" dataKey="volume" name="Volume (kg)" stroke="hsl(var(--chart-min))" strokeDasharray="5 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="space-y-2">
              {[...history].reverse().map((h, i) => (
                <div key={`${h.date}-${i}`} className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{h.date}</span>
                    <Badge variant="outline" className="max-w-full whitespace-normal break-words text-xs">{h.template}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {h.sets.map((s, j) => `S${j + 1}: ${s.reps} @ ${s.weight}kg`).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
