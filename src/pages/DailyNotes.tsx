import { useMemo, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { FileText, Search, Tag, CalendarDays, AlertCircle } from 'lucide-react';
import { DailyNoteForm } from '@/components/DailyNoteForm';
import { DailyNotesList } from '@/components/DailyNotesList';
import { useDailyNotes } from '@/hooks/useDailyNotes';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const DailyNotes = () => {
  const { notes, addNote, deleteNote } = useDailyNotes();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const stats = useMemo(() => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 29);
    const sinceStr = since.toISOString().slice(0, 10);
    const recent = notes.filter((n) => n.date >= sinceStr);
    const counts = new Map<string, number>();
    notes.forEach((n) => (n.tags || []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    const topTags = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const sev = notes.filter((n) => n.severity != null).map((n) => n.severity as number);
    return {
      total: notes.length,
      recent: recent.length,
      topTags,
      avgSeverity: sev.length ? (sev.reduce((a, b) => a + b, 0) / sev.length).toFixed(1) : null,
    };
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter(
      (n) =>
        (!tag || (n.tags || []).includes(tag)) &&
        (!q || (n.notes || '').toLowerCase().includes(q) || (n.tags || []).some((t) => t.toLowerCase().includes(q)) || n.date.includes(q)),
    );
  }, [notes, search, tag]);

  const tiles = [
    { icon: FileText, label: 'Total notes', value: stats.total },
    { icon: CalendarDays, label: 'Last 30 days', value: stats.recent },
    { icon: Tag, label: 'Most common', value: stats.topTags[0]?.[0] ?? '—' },
    { icon: AlertCircle, label: 'Avg severity', value: stats.avgSeverity ?? '—' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Daily Notes</h1>
            <p className="text-muted-foreground">
              Log symptoms, feelings, and events to understand your health trends
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label}>
              <CardContent className="p-4">
                <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                  <t.icon className="h-3.5 w-3.5 text-primary" /> {t.label}
                </p>
                <p className="mt-1 truncate text-2xl font-bold">{t.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <DailyNoteForm onSubmit={addNote} />
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search notes, tags or dates..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {stats.topTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={tag === null ? 'default' : 'outline'} onClick={() => setTag(null)}>
                      All
                    </Button>
                    {stats.topTags.slice(0, 8).map(([t, c]) => (
                      <Button key={t} size="sm" variant={tag === t ? 'default' : 'outline'} onClick={() => setTag(tag === t ? null : t)}>
                        {t} <span className="ml-1 text-xs opacity-70">{c}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <DailyNotesList notes={filtered} onDelete={deleteNote} onEdit={addNote} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default DailyNotes;
