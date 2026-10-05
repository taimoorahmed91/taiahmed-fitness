import { useMemo, useState } from 'react';
import { WorkoutTemplate } from '@/hooks/useWorkoutTemplates';
import { GymSession } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, Play, ClipboardList, Pencil, Plus, Search, Trophy, History, Clock, Repeat } from 'lucide-react';
import { WorkoutTemplateForm } from '@/components/WorkoutTemplateForm';

interface WorkoutTemplateListProps {
  templates: WorkoutTemplate[];
  sessions: GymSession[];
  onCreate: (template: { name: string; exercises: string[] }) => void | Promise<void>;
  onDelete: (id: string) => void;
  onStart: (template: WorkoutTemplate) => void;
  onEdit: (template: WorkoutTemplate) => void;
}

type Stats = { count: number; avg: number; last: string | null };

const daysAgo = (date: string) => {
  const today = new Date().toISOString().split('T')[0];
  const diff = Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
};

export const WorkoutTemplateList = ({ templates, sessions, onCreate, onDelete, onStart, onEdit }: WorkoutTemplateListProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WorkoutTemplate | null>(null);

  const stats = useMemo(() => {
    const map = new Map<string, Stats>();
    for (const t of templates) {
      const key = t.name.trim().toLowerCase();
      const runs = sessions.filter((s) => s.exercise?.trim().toLowerCase() === key);
      const total = runs.reduce((sum, s) => sum + (s.duration || 0), 0);
      const last = runs.reduce<string | null>((acc, s) => (!acc || s.date > acc ? s.date : acc), null);
      map.set(t.id, { count: runs.length, avg: runs.length ? Math.round(total / runs.length) : 0, last });
    }
    return map;
  }, [templates, sessions]);

  const favorite = useMemo(() => {
    let best: { t: WorkoutTemplate; s: Stats } | null = null;
    for (const t of templates) {
      const s = stats.get(t.id)!;
      if (s.count > 0 && (!best || s.count > best.s.count)) best = { t, s };
    }
    return best;
  }, [templates, stats]);

  const recent = useMemo(() => {
    let best: { t: WorkoutTemplate; s: Stats } | null = null;
    for (const t of templates) {
      const s = stats.get(t.id)!;
      if (s.last && (!best || s.last > best.s.last!)) best = { t, s };
    }
    return best;
  }, [templates, stats]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? templates.filter((t) => t.name.toLowerCase().includes(q) || t.exercises.some((e) => e.toLowerCase().includes(q)))
      : templates;
    return [...list].sort((a, b) => (stats.get(b.id)?.last || '').localeCompare(stats.get(a.id)?.last || ''));
  }, [templates, query, stats]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 py-4">
          <ClipboardList className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{templates.length}</p><p className="text-xs text-muted-foreground">Saved templates</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4">
          <Trophy className="h-8 w-8 text-chart-min" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{favorite ? favorite.t.name : '—'}</p>
            <p className="text-xs text-muted-foreground">{favorite ? `Most used · ${favorite.s.count}×` : 'No runs logged yet'}</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4">
          <History className="h-8 w-8 text-chart-max" />
          <div className="min-w-0">
            <p className="font-semibold truncate">{recent ? recent.t.name : '—'}</p>
            <p className="text-xs text-muted-foreground">{recent ? `Last run ${daysAgo(recent.s.last!)}` : 'Nothing recent'}</p>
          </div>
        </CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates or exercises..." className="pl-9" />
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Create Template</Button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center space-y-3">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">{templates.length === 0 ? 'No templates yet. Create your first routine.' : 'No templates match your search.'}</p>
          {templates.length === 0 && <Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Create Template</Button>}
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const s = stats.get(t.id)!;
            const isOpen = expanded.has(t.id);
            const shown = isOpen ? t.exercises : t.exercises.slice(0, 4);
            return (
              <Card key={t.id} className="flex flex-col shadow-md">
                <CardContent className="flex flex-col flex-1 gap-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-lg leading-tight">{t.name}</p>
                    <Badge variant="secondary">{t.exercises.length} ex</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Repeat className="h-3 w-3" />{s.count}× done</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.count ? `avg ${s.avg} min` : 'no avg yet'}</span>
                    <span className="flex items-center gap-1"><History className="h-3 w-3" />{s.last ? daysAgo(s.last) : 'never run'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {shown.map((ex, i) => (
                      <span key={i} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">{ex}</span>
                    ))}
                    {t.exercises.length > 4 && (
                      <button type="button" onClick={() => toggle(t.id)} className="text-xs text-primary px-1 hover:underline">
                        {isOpen ? 'Show less' : `+${t.exercises.length - 4} more`}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-auto pt-2">
                    <Button className="flex-1" onClick={() => onStart(t)}><Play className="h-4 w-4 mr-1" />Start Workout</Button>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(t)} aria-label="Edit template">
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setPendingDelete(t)} aria-label="Delete template">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>Name your routine and list its exercises.</DialogDescription>
          </DialogHeader>
          <WorkoutTemplateForm onSubmit={onCreate} onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Your logged workouts stay; only the template is removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingDelete) onDelete(pendingDelete.id); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
