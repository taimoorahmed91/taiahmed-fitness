import { useMemo, useState } from 'react';
import { Trophy, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GymSession } from '@/types';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { personalRecords } from '@/lib/workoutStats';

interface Props {
  sessions: GymSession[];
  templates: WorkoutTemplate[];
}

const ALL = '__all__';

export const PersonalRecordsList = ({ sessions, templates }: Props) => {
  const [query, setQuery] = useState('');
  const [templateFilter, setTemplateFilter] = useState(ALL);
  const records = useMemo(() => personalRecords(sessions), [sessions]);

  const templateFor = (exercise: string) =>
    templates.filter((t) => t.exercises.some((e) => e.toLowerCase() === exercise.toLowerCase())).map((t) => t.name);

  const filtered = records.filter((r) => {
    if (query && !r.exercise.toLowerCase().includes(query.toLowerCase())) return false;
    if (templateFilter !== ALL) {
      const t = templates.find((x) => x.id === templateFilter);
      if (!t || !t.exercises.some((e) => e.toLowerCase() === r.exercise.toLowerCase())) return false;
    }
    return true;
  });

  const daysAgo = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d + 'T00:00:00Z').getTime()) / 86400000);
    return diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff} days ago`;
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Personal Records
          <Badge variant="secondary">{records.length}</Badge>
        </CardTitle>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search exercises..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {templates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[{ id: ALL, name: 'All' }, ...templates].map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplateFilter(t.id)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  templateFilter === t.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {records.length === 0 ? 'No records yet — finish a template workout with weights to set your first PR.' : 'No exercises match.'}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => {
              const tpls = templateFor(r.exercise);
              return (
                <div key={r.exercise} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-tight">{r.exercise}</p>
                    <Trophy className="h-4 w-4 text-primary shrink-0" />
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    {r.weight} kg <span className="text-sm font-normal text-muted-foreground">× {r.reps} reps</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Set on {r.date} ({daysAgo(r.date)}) · {r.sessions} session{r.sessions === 1 ? '' : 's'} logged
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(tpls.length ? tpls : [r.template]).map((n) => (
                      <Badge key={n} variant="outline" className="text-xs">{n}</Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
