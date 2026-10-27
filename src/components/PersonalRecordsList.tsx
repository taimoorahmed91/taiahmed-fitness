import { useMemo, useState } from 'react';
import { Trophy, Search, Merge, X, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
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
const ALIAS_KEY = 'fittrack-exercise-aliases';

const loadAliases = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}'); } catch { return {}; }
};

export const PersonalRecordsList = ({ sessions, templates }: Props) => {
  const [query, setQuery] = useState('');
  const [templateFilter, setTemplateFilter] = useState(ALL);
  const [aliases, setAliases] = useState<Record<string, string>>(loadAliases);
  const [merging, setMerging] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const records = useMemo(() => personalRecords(sessions, aliases), [sessions, aliases]);

  const persist = (next: Record<string, string>) => {
    setAliases(next);
    try { localStorage.setItem(ALIAS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const namesFor = (exercise: string) => [exercise, ...Object.keys(aliases).filter((a) => aliases[a] === exercise)];
  const has = (list: string[], names: string[]) => list.some((e) => names.some((n) => n.toLowerCase() === e.toLowerCase()));
  const templateFor = (exercise: string) => templates.filter((t) => has(t.exercises, namesFor(exercise))).map((t) => t.name);

  const togglePick = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  const confirmMerge = () => {
    const [keep, ...rest] = picked;
    const next = { ...aliases };
    rest.forEach((r) => {
      Object.keys(next).forEach((a) => { if (next[a] === r) next[a] = keep; });
      next[r] = keep;
    });
    delete next[keep];
    persist(next);
    toast.success(`Merged into "${keep}"`);
    setPicked([]); setMerging(false);
  };
  const unmerge = (alias: string) => { const next = { ...aliases }; delete next[alias]; persist(next); };

  const filtered = records.filter((r) => {
    if (query && !r.exercise.toLowerCase().includes(query.toLowerCase())) return false;
    if (templateFilter !== ALL) {
      const t = templates.find((x) => x.id === templateFilter);
      if (!t || !has(t.exercises, namesFor(r.exercise))) return false;
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
          <div className="ml-auto flex gap-2">
            {merging ? (
              <>
                <Button size="sm" disabled={picked.length < 2} onClick={confirmMerge}><Merge className="h-4 w-4 mr-1" />Merge {picked.length || ''}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setMerging(false); setPicked([]); }}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              records.length > 1 && <Button size="sm" variant="outline" onClick={() => setMerging(true)}><Merge className="h-4 w-4 mr-1" />Merge names</Button>
            )}
          </div>
        </CardTitle>
        {merging && (
          <p className="text-sm text-muted-foreground">
            Tap the exercises that are the same movement. The first one you tap keeps its name{picked[0] ? <> — <b className="text-foreground">{picked[0]}</b></> : ''}.
          </p>
        )}
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
                <div
                  key={r.exercise}
                  onClick={merging ? () => togglePick(r.exercise) : undefined}
                  className={`rounded-lg border p-4 space-y-2 ${merging ? 'cursor-pointer' : ''} ${picked.includes(r.exercise) ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-tight">{r.exercise}</p>
                    {merging && picked.includes(r.exercise)
                      ? <Badge className="shrink-0">{picked.indexOf(r.exercise) === 0 ? 'Keep name' : 'Merge'}</Badge>
                      : <Trophy className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  {namesFor(r.exercise).length > 1 && (
                    <div className="flex flex-wrap gap-1 text-xs text-muted-foreground items-center">
                      Also:
                      {namesFor(r.exercise).slice(1).map((a) => (
                        <button key={a} title="Separate this name again" onClick={(e) => { e.stopPropagation(); unmerge(a); }}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 hover:text-foreground">
                          {a}<Undo2 className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
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
