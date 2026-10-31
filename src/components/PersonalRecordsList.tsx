import { useMemo, useState } from 'react';
import { Trophy, Search, Merge, X, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GymSession } from '@/types';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { personalRecords } from '@/lib/workoutStats';
import { ExerciseHistoryDialog } from '@/components/ExerciseHistoryDialog';
import { dayDiff, defaultToday, formatDay } from '@/lib/historyDates';

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
  const [opened, setOpened] = useState<string | null>(null);
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

  // Calendar days between the set date and today (both UTC days), so the wording never shifts with the viewer's time zone.
  const daysAgo = (d: string) => {
    const diff = dayDiff(defaultToday(), d);
    if (diff === null) return null;
    return diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff} days ago`;
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        {/* Title and actions sit in one wrapping row: on a phone the button drops under the title instead of overflowing. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Trophy aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 break-words">Personal Records</span>
            <Badge variant="secondary">{records.length}</Badge>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {merging ? (
              <>
                <Button size="sm" disabled={picked.length < 2} onClick={confirmMerge}><Merge aria-hidden="true" />Merge {picked.length || ''}</Button>
                <IconButton label="Cancel merging" size="sm" onClick={() => { setMerging(false); setPicked([]); }}><X /></IconButton>
              </>
            ) : (
              records.length > 1 && <Button size="sm" variant="outline" onClick={() => setMerging(true)}><Merge aria-hidden="true" />Merge names</Button>
            )}
          </div>
        </div>
        {merging && (
          <p className="text-sm text-muted-foreground">
            Tap the exercises that are the same movement. The first one you tap keeps its name{picked[0] ? <> — <b className="text-foreground">{picked[0]}</b></> : ''}.
          </p>
        )}
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search exercises..." aria-label="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {templates.length > 0 && (
          <div role="group" aria-label="Filter by template" className="flex flex-wrap gap-2">
            {[{ id: ALL, name: 'All' }, ...templates].map((t) => (
              <ToggleChip key={t.id} pressed={templateFilter === t.id} onPressedChange={() => setTemplateFilter(t.id)}>
                {t.name}
              </ToggleChip>
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
                  className={`relative rounded-lg border p-4 space-y-2 cursor-pointer hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring transition-colors ${picked.includes(r.exercise) ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* The whole card is clickable: this button is stretched over it so keyboard and screen readers get a real control. */}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => (merging ? togglePick(r.exercise) : setOpened(r.exercise))}
                      aria-pressed={merging ? picked.includes(r.exercise) : undefined}
                      aria-haspopup={merging ? undefined : 'dialog'}
                      className="h-auto min-w-0 justify-start whitespace-normal rounded-sm p-0 text-left text-base font-semibold leading-tight after:absolute after:inset-0 after:content-[''] focus-visible:ring-0 focus-visible:ring-offset-0 [@media(hover:hover)]:hover:bg-transparent active:bg-transparent motion-safe:active:scale-100"
                    >
                      {r.exercise}
                    </Button>
                    {merging && picked.includes(r.exercise)
                      ? <Badge className="shrink-0">{picked.indexOf(r.exercise) === 0 ? 'Keep name' : 'Merge'}</Badge>
                      : <Trophy aria-hidden="true" className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  {namesFor(r.exercise).length > 1 && (
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground [@media(pointer:coarse)]:gap-2">
                      Also:
                      {namesFor(r.exercise).slice(1).map((a) => (
                        <Button key={a} type="button" variant="outline" size="sm" aria-label={`Separate ${a} from ${r.exercise}`} onClick={() => unmerge(a)}
                          className="relative z-10 h-7 gap-1 rounded-full px-2 text-xs font-normal [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3">
                          {a}<Undo2 aria-hidden="true" className="!size-3" />
                        </Button>
                      ))}
                    </div>
                  )}
                  <p className="text-2xl font-bold text-primary">
                    {r.weight} kg <span className="text-sm font-normal text-muted-foreground">× {r.reps} reps</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Set on {formatDay(r.date)}{daysAgo(r.date) && ` (${daysAgo(r.date)})`} · {r.sessions} session{r.sessions === 1 ? '' : 's'} logged
                  </p>
                  {!merging && <p className="text-xs text-primary">View history →</p>}
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
      <ExerciseHistoryDialog exercise={opened} sessions={sessions} aliases={aliases} onClose={() => setOpened(null)} />
    </Card>
  );
};
