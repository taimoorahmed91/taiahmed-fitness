import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useState, useMemo, useRef } from 'react';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState, ICON_TOUCH_CLASS } from '@/components/layout/Page';
import { IconButton } from '@/components/ui/icon-button';
import { Activity, AlertCircle, Trash2, Pencil, X, Flame, Search } from 'lucide-react';
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

/**
 * Intensity is one scale, so it uses one colour (the brand role) in five strengths,
 * plus a number, a word and a 5-segment meter. Nothing depends on telling hues apart.
 * Class names are written out in full so Tailwind can see them.
 */
const INTENSITY_BAR: Record<number, string> = {
  1: 'bg-primary/25',
  2: 'bg-primary/40',
  3: 'bg-primary/60',
  4: 'bg-primary/80',
  5: 'bg-primary',
};

/**
 * "+N cal" chip: accent-foreground on the accent surface (9.2:1 light, 8.5:1 dark), with a brand border.
 * The old text-primary on a primary tint measured 4.2:1. The "+" and "cal" stay in the text.
 */
const CALORIE_CHIP_CLASS = 'border-primary bg-accent text-accent-foreground';

const intensityColor = (n: number) => {
  switch (n) {
    case 1: return 'border-primary/20 bg-primary/5 text-foreground';
    case 2: return 'border-primary/30 bg-primary/10 text-foreground';
    case 3: return 'border-primary/40 bg-primary/15 text-foreground';
    case 4: return 'border-primary/50 bg-primary/20 text-foreground';
    case 5: return 'border-primary/60 bg-primary/30 text-foreground';
    default: return '';
  }
};

/** Five small segments; filled ones show the level without relying on colour. Decorative: the text beside it carries the meaning. */
const IntensityMeter = ({ level }: { level: number }) => (
  <span aria-hidden="true" className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={`h-2.5 w-1 rounded-sm ${n <= level ? 'bg-primary' : 'bg-progress-track'}`} />
    ))}
  </span>
);

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} className="flex items-start gap-1.5 text-sm text-destructive">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  ) : null;

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
  const [errors, setErrors] = useState<{ date?: string; activity?: string }>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const resetForm = () => {
    setEditingId(null);
    setActivity('');
    setDuration('');
    setCalories('');
    setNotes('');
    setIntensity('3');
    setDate(today);
    setTime(currentTime());
    setErrors({});
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
    if (savingRef.current) return;
    const nextErrors: { date?: string; activity?: string } = {};
    if (!date) nextErrors.date = 'Choose a date.';
    if (!activity.trim()) nextErrors.activity = 'Enter what you did, for example "5 km walk".';
    if (nextErrors.date || nextErrors.activity) {
      setErrors(nextErrors);
      document.getElementById(nextErrors.date ? 'date' : 'activity')?.focus();
      return;
    }
    setErrors({});
    const payload = {
      date,
      time: time || null,
      activity: activity.trim(),
      intensity: parseInt(intensity, 10),
      calories: calories ? parseInt(calories, 10) : 0,
      duration_minutes: duration ? parseInt(duration, 10) : null,
      notes: notes.trim() || null,
    };
    savingRef.current = true;
    setSaving(true);
    try {
      if (editingId) {
        await updateActivity(editingId, payload);
      } else {
        await addActivity(payload);
      }
      resetForm();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
    <PageContainer>
      <PageHeader
        icon={Activity}
        title="Extra Activity"
        description="Log non-gym activities that still count — walks, hikes, sports, chores, etc."
      />

      <PageSection title="Log and impact" hideTitle>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-lg">
                <span>{editingId ? 'Edit Activity' : 'Log Activity'}</span>
                {editingId && (
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    <X aria-hidden="true" /> Cancel
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  <span aria-hidden="true" className="text-destructive">*</span> Required. Duration, calories and notes are optional.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date<span aria-hidden="true" className="text-destructive"> *</span></Label>
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: undefined })); }}
                      aria-required="true"
                      aria-invalid={errors.date ? true : undefined}
                      aria-describedby={errors.date ? 'date-error' : undefined}
                      className={errors.date ? 'border-destructive' : undefined}
                    />
                    <FieldError id="date-error" message={errors.date} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Time</Label>
                    <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (min) <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="duration" type="number" inputMode="numeric" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="calories">Calories burned <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="calories" type="number" inputMode="numeric" min="0" value={calories} onChange={(e) => setCalories(e.target.value)} aria-describedby="calories-hint" />
                    <p id="calories-hint" className="text-xs text-muted-foreground">Added to your daily calorie budget.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activity">Activity<span aria-hidden="true" className="text-destructive"> *</span></Label>
                  <Input
                    id="activity"
                    value={activity}
                    onChange={(e) => { setActivity(e.target.value); setErrors((p) => ({ ...p, activity: undefined })); }}
                    placeholder="e.g. 5km walk, soccer, cleaning..."
                    aria-required="true"
                    aria-invalid={errors.activity ? true : undefined}
                    aria-describedby={errors.activity ? 'activity-error' : undefined}
                    className={errors.activity ? 'border-destructive' : undefined}
                  />
                  <FieldError id="activity-error" message={errors.activity} />
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
                  <Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details..." rows={3} />
                </div>

                <Button type="submit" className="w-full" loading={saving} loadingText="Saving…">{editingId ? 'Save Changes' : 'Add Activity'}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Flame className="h-5 w-5 text-primary" aria-hidden="true" /> Activity impact
              </CardTitle>
            </CardHeader>
            {loading ? (
              <CardContent>
                <PageLoading label="Loading activity impact" rows={2} />
              </CardContent>
            ) : (
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
                            <span className="w-20 shrink-0 text-muted-foreground">{n} · {INTENSITY_LABELS[n]}</span>
                            <div aria-hidden="true" className="h-2.5 flex-1 overflow-hidden rounded-full bg-progress-track">
                              <div className={`h-full ${INTENSITY_BAR[n]}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-16 text-right tabular-nums font-semibold">{c} · {pct}%</span>
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
            )}
          </Card>
        </div>
      </PageSection>

      <PageSection title="Activity history" hideTitle>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">History</CardTitle>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input placeholder="Search activities or notes..." aria-label="Search activities or notes" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" aria-label="From date" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-44" aria-label="To date" />
              {(search || from || to) && (
                <Button type="button" variant="ghost" onClick={() => { setSearch(''); setFrom(''); setTo(''); }}>
                  <X aria-hidden="true" /> Clear filters
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Pick only "From" for a single day, or both for a range.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <PageLoading label="Loading activities" rows={3} />
            ) : filtered.length === 0 ? (
              <PageEmptyState
                icon={Activity}
                title={activities.length === 0 ? 'No extra activities logged yet' : 'No activities match your filters'}
                description={activities.length === 0 ? 'Log your first activity above.' : 'Try a different search or date range.'}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {paginatedItems.map((a) => (
                  <div key={a.id} className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${editingId === a.id ? 'border-primary' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{a.activity}</span>
                        <Badge variant="outline" className={intensityColor(a.intensity)}>
                          <IntensityMeter level={a.intensity} />
                          <span className="ml-1.5">Intensity {a.intensity} of 5 · {INTENSITY_LABELS[a.intensity]}</span>
                        </Badge>
                        {a.duration_minutes != null && (
                          <Badge variant="outline">{a.duration_minutes} min</Badge>
                        )}
                        {a.calories > 0 && (
                          <Badge variant="outline" className={CALORIE_CHIP_CLASS}>+{a.calories} cal</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {a.date}{a.time ? ` · ${a.time}` : ''}
                      </div>
                      {a.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{a.notes}</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <IconButton label={`Edit activity ${a.activity}`} tooltip onClick={() => handleEdit(a)}>
                        <Pencil />
                      </IconButton>
                      <ConfirmDeleteButton size="icon" variant="ghost" className={ICON_TOUCH_CLASS} onConfirm={() => deleteActivity(a.id)} confirmationTitle="Delete activity?" confirmationDescription={`Are you sure you want to delete “${a.activity}” from ${a.date}, including its notes? This cannot be undone.`} aria-label={`Delete activity ${a.activity}`}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </ConfirmDeleteButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                onPageChange={goToPage}
                hasNextPage={hasNextPage}
                hasPrevPage={hasPrevPage}
              />
            )}
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
};

export default ExtraActivities;
