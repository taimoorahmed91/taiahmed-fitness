import { useState, useMemo } from 'react';
import { Navigation } from '@/components/Navigation';
import { Activity, Trash2, Pencil, X, Flame, Search } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExtraActivities } from '@/hooks/useExtraActivities';

const INTENSITY_LABELS: Record<number, string> = {
  1: 'Very Light',
  2: 'Light',
  3: 'Moderate',
  4: 'Hard',
  5: 'Very Hard',
};

const INTENSITY_BAR: Record<number, string> = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-yellow-500',
  4: 'bg-orange-500',
  5: 'bg-red-500',
};

const intensityColor = (n: number) => {
  switch (n) {
    case 1: return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    case 2: return 'bg-lime-500/15 text-lime-500 border-lime-500/30';
    case 3: return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30';
    case 4: return 'bg-orange-500/15 text-orange-500 border-orange-500/30';
    case 5: return 'bg-red-500/15 text-red-500 border-red-500/30';
    default: return '';
  }
};

const ExtraActivities = () => {
  const { activities, addActivity, updateActivity, deleteActivity, loading } = useExtraActivities();
  const today = new Date().toISOString().split('T')[0];
  const currentTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(currentTime());
  const [activity, setActivity] = useState('');
  const [intensity, setIntensity] = useState<string>('3');
  const [calories, setCalories] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setActivity('');
    setDuration('');
    setCalories('');
    setNotes('');
    setIntensity('3');
    setDate(today);
    setTime(currentTime());
  };

  const handleEdit = (a: typeof activities[number]) => {
    setEditingId(a.id);
    setDate(a.date);
    setTime(a.time || '');
    setActivity(a.activity);
    setIntensity(String(a.intensity));
    setCalories(a.calories ? String(a.calories) : '');
    setDuration(a.duration_minutes != null ? String(a.duration_minutes) : '');
    setNotes(a.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity.trim()) return;
    const payload = {
      date,
      time: time || null,
      activity: activity.trim(),
      intensity: parseInt(intensity, 10),
      calories: calories ? parseInt(calories, 10) : 0,
      duration_minutes: duration ? parseInt(duration, 10) : null,
      notes: notes.trim() || null,
    };
    if (editingId) {
      await updateActivity(editingId, payload);
    } else {
      await addActivity(payload);
    }
    resetForm();
  };

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const stats = useMemo(() => {
    const daysAgo = (n: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    const since7 = daysAgo(6);
    const since30 = daysAgo(29);
    const sum = (list: typeof activities, f: (a: typeof activities[number]) => number) => list.reduce((s, a) => s + f(a), 0);
    const todayList = activities.filter((a) => a.date === today);
    const week = activities.filter((a) => a.date >= since7 && a.date <= today);
    const month = activities.filter((a) => a.date >= since30 && a.date <= today);
    const intensity: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    month.forEach((a) => { intensity[a.intensity] = (intensity[a.intensity] || 0) + 1; });
    return {
      todayCal: sum(todayList, (a) => a.calories || 0),
      todayMin: sum(todayList, (a) => a.duration_minutes || 0),
      todayCount: todayList.length,
      weekCal: sum(week, (a) => a.calories || 0),
      weekMin: sum(week, (a) => a.duration_minutes || 0),
      weekCount: week.length,
      monthCount: month.length,
      intensity,
      allCal: sum(activities, (a) => a.calories || 0),
    };
  }, [activities, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((a) => {
      if (q && !a.activity.toLowerCase().includes(q) && !(a.notes || '').toLowerCase().includes(q)) return false;
      if (from && !to && a.date !== from) return false;
      if (from && to && (a.date < from || a.date > to)) return false;
      if (!from && to && a.date > to) return false;
      return true;
    });
  }, [activities, search, from, to]);

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, hasNextPage, hasPrevPage } =
    usePagination(filtered, { pageSize: 20 });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Activity className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Extra Activity</h1>
            <p className="text-muted-foreground">
              Log non-gym activities that still count — walks, hikes, sports, chores, etc.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{editingId ? 'Edit Activity' : 'Log Activity'}</span>
                {editingId && (
                  <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Time</Label>
                    <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (min)</Label>
                    <Input id="duration" type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="calories">Calories burned</Label>
                    <Input id="calories" type="number" min="0" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Added to daily goal" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activity">Activity</Label>
                  <Input id="activity" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. 5km walk, soccer, cleaning..." required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="intensity">Intensity (1–5)</Label>
                  <Select value={intensity} onValueChange={setIntensity}>
                    <SelectTrigger id="intensity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} — {INTENSITY_LABELS[n]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details..." rows={3} />
                </div>

                <Button type="submit" className="w-full">{editingId ? 'Save Changes' : 'Add Activity'}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-primary" /> Activity impact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                <p className="text-sm text-muted-foreground">Added to today's calorie budget</p>
                <p className="text-3xl font-bold text-primary">+{stats.todayCal} cal</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.todayCount} {stats.todayCount === 1 ? 'activity' : 'activities'} today · {stats.todayMin} min
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Last 7 days</p>
                  <p className="text-xl font-semibold">{stats.weekCal} cal</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active time</p>
                  <p className="text-xl font-semibold">{stats.weekMin} min</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sessions</p>
                  <p className="text-xl font-semibold">{stats.weekCount}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">Intensity mix (last 30 days)</p>
                {stats.monthCount === 0 ? (
                  <p className="text-xs text-muted-foreground">No activities in the last 30 days.</p>
                ) : (
                  <div className="space-y-1.5">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const c = stats.intensity[n];
                      const pct = Math.round((c / stats.monthCount) * 100);
                      return (
                        <div key={n} className="flex items-center gap-2 text-xs">
                          <span className="w-20 shrink-0 text-muted-foreground">{INTENSITY_LABELS[n]}</span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div className={`h-full ${INTENSITY_BAR[n]}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-12 text-right tabular-nums font-semibold">{c} · {pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-between border-t pt-3 text-sm text-muted-foreground">
                <span>All time: <span className="font-semibold text-foreground">{activities.length}</span> activities</span>
                <span><span className="font-semibold text-foreground">{stats.allCal.toLocaleString()}</span> cal burned</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle>History</CardTitle>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search activities or notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" aria-label="From date" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-44" aria-label="To date" />
              {(search || from || to) && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFrom(''); setTo(''); }} className="h-10">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Pick only "From" for a single day, or both for a range.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">
                {activities.length === 0 ? 'No extra activities logged yet.' : 'No activities match your filters.'}
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {paginatedItems.map((a) => (
                  <div key={a.id} className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${editingId === a.id ? 'border-primary' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{a.activity}</span>
                        <Badge variant="outline" className={intensityColor(a.intensity)}>
                          Intensity {a.intensity} · {INTENSITY_LABELS[a.intensity]}
                        </Badge>
                        {a.duration_minutes != null && (
                          <Badge variant="outline">{a.duration_minutes} min</Badge>
                        )}
                        {a.calories > 0 && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">+{a.calories} cal</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {a.date}{a.time ? ` · ${a.time}` : ''}
                      </div>
                      {a.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{a.notes}</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(a)} aria-label="Edit activity">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteActivity(a.id)} aria-label="Delete activity">
                        <Trash2 className="h-4 w-4" />
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
      </main>
    </div>
  );
};

export default ExtraActivities;
