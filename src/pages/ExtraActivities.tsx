import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useState, useMemo, useRef, type ReactNode } from 'react';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState } from '@/components/layout/Page';
import { Activity, AlertCircle, Pencil, X, Flame, Search, StickyNote } from 'lucide-react';
import { HistoryList } from '@/components/history/HistoryGroup';
import { HistoryRow } from '@/components/history/HistoryRow';
import { ActionTray, HistoryAction, HistoryDeleteAction, HistoryInlineActions } from '@/components/history/ActionTray';
import { HISTORY_LG, useMinWidth } from '@/components/history/useMinWidth';
import { formatDay } from '@/lib/historyDates';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExtraActivities, type ExtraActivity } from '@/hooks/useExtraActivities';

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

/** Five small segments; filled ones show the level without relying on colour. Decorative: the text beside it carries the meaning. */
const IntensityMeter = ({ level }: { level: number }) => (
  <span aria-hidden="true" className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={`h-2.5 w-1 rounded-sm ${n <= level ? 'bg-primary' : 'bg-progress-track'}`} />
    ))}
  </span>
);

/** Desktop columns: Date, Activity, Time, Intensity, Duration, Calories. */
const DESKTOP_COLUMNS = 'grid w-full grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_10rem_4.5rem_5.5rem] items-start gap-x-3';
const DESKTOP_ACTIONS_WIDTH = 'w-20';

const DesktopColumnHeader = () => (
  <div aria-hidden="true" className="flex border-b py-1.5 text-xs font-medium text-muted-foreground">
    <span className={cn(DESKTOP_COLUMNS, 'min-w-0 flex-1 px-4')}>
      <span>Date</span>
      <span>Activity</span>
      <span>Time</span>
      <span>Intensity</span>
      <span className="text-right">Duration</span>
      <span className="text-right">Calories</span>
    </span>
    {/* Same width as the chevron and the inline actions in each row. */}
    <span className="w-6 shrink-0" />
    <span className={cn('shrink-0', DESKTOP_ACTIONS_WIDTH)} />
  </div>
);

const NotAvailable = () => (
  <>
    <span aria-hidden="true">—</span>
    <span className="sr-only">not available</span>
  </>
);

/** Intensity as shown in a summary: the meter, "3/5" and the word. The sr-only sentence is the accessible version. */
const IntensitySummary = ({ level }: { level: number }) => (
  <>
    <span className="sr-only">Intensity {level} of 5, {INTENSITY_LABELS[level]}</span>
    <span aria-hidden="true" className="inline-flex items-center gap-1.5">
      <IntensityMeter level={level} />
      <span>{level}/5</span>
    </span>
  </>
);

interface ExtraActivityRowProps {
  activity: ExtraActivity;
  desktop: boolean;
  today: string;
  expanded: boolean;
  editing: boolean;
  onExpandedChange: (open: boolean) => void;
  onEdit: (activity: ExtraActivity) => void;
  onDelete: (id: string) => void;
}

/**
 * One activity, built like a Gym history row: the summary (name, date and time, key facts) is always visible and is the
 * single disclosure button. Notes open in an animated panel; a row with no notes has nothing more to show, so on a wide
 * screen it does not expand at all. On phones every row opens, because the Edit and Delete tray lives in the panel.
 */
const ExtraActivityRow = ({ activity: a, desktop, today, expanded, editing, onExpandedChange, onEdit, onDelete }: ExtraActivityRowProps) => {
  const notes = a.notes?.trim() ?? '';
  const hasNotes = notes.length > 0;
  const preview = notes.split('\n').find((line) => line.trim())?.trim() ?? null;
  const rowClass = cn(editing && 'outline outline-2 -outline-offset-2 outline-primary');

  const actionList = (variant: 'tray' | 'inline') => [
    <HistoryAction
      key="edit"
      variant={variant}
      label={`Edit activity ${a.activity}`}
      text="Edit"
      icon={<Pencil aria-hidden="true" />}
      onClick={() => onEdit(a)}
    />,
    <HistoryDeleteAction
      key="delete"
      variant={variant}
      label={`Delete activity ${a.activity}`}
      confirmationTitle="Delete activity?"
      confirmationDescription={`Are you sure you want to delete “${a.activity}” from ${a.date}, including its notes? This cannot be undone.`}
      onConfirm={() => onDelete(a.id)}
    />,
  ];

  const notesDetail = (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <StickyNote aria-hidden="true" className="h-3.5 w-3.5" />
        Notes
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">{a.notes}</p>
    </div>
  );

  if (desktop) {
    return (
      <HistoryRow
        variant="workout"
        className={rowClass}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        reserveChevron
        panelLabel={`Details for ${a.activity}`}
        panel={hasNotes ? notesDetail : undefined}
        summary={
          <span className={DESKTOP_COLUMNS}>
            <span className="text-sm text-muted-foreground">
              <time dateTime={a.date}>{formatDay(a.date, today)}</time>
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold">{a.activity}</span>
              {preview && !expanded && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{preview}</span>}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">{a.time || <NotAvailable />}</span>
            <span className="text-sm tabular-nums"><IntensitySummary level={a.intensity} /> <span aria-hidden="true" className="text-muted-foreground">{INTENSITY_LABELS[a.intensity]}</span></span>
            <span className="text-right text-sm font-medium tabular-nums">{a.duration_minutes != null ? `${a.duration_minutes} min` : <NotAvailable />}</span>
            <span className="text-right text-sm font-semibold tabular-nums">{a.calories > 0 ? `+${a.calories} cal` : <NotAvailable />}</span>
          </span>
        }
        actions={
          <HistoryInlineActions label={`Actions for ${a.activity}`} className={DESKTOP_ACTIONS_WIDTH}>
            {actionList('inline')}
          </HistoryInlineActions>
        }
      />
    );
  }

  // The headline numbers, as a strip of small value-over-label cells (same as the Gym rows).
  const facts: { key: string; value: ReactNode; label: string }[] = [
    { key: 'intensity', value: <IntensitySummary level={a.intensity} />, label: INTENSITY_LABELS[a.intensity] },
  ];
  if (a.duration_minutes != null) facts.push({ key: 'min', value: `${a.duration_minutes} min`, label: 'duration' });
  if (a.calories > 0) facts.push({ key: 'cal', value: `+${a.calories}`, label: 'cal' });

  return (
    <HistoryRow
      variant="workout"
      className={rowClass}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      panelLabel={`Details for ${a.activity}`}
      summary={
        <span className="block w-full min-w-0">
          <span className="block break-words text-base font-semibold leading-snug">{a.activity}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            <time dateTime={a.date}>{formatDay(a.date, today)}</time>
            {a.time && (
              <>
                {' '}
                <span aria-hidden="true">·</span> <span className="tabular-nums">{a.time}</span>
              </>
            )}
          </span>
          <span className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 tabular-nums min-[480px]:flex min-[480px]:flex-wrap min-[480px]:gap-x-5 min-[480px]:gap-y-2">
            {facts.map((fact) => (
              <span key={fact.key} className="block border-l-2 border-chart-2/50 pl-2 leading-tight">
                <span className="block text-sm font-semibold">{fact.value}</span>{' '}
                <span className="block text-xs text-muted-foreground">{fact.label}</span>
              </span>
            ))}
          </span>
          {preview && !expanded && (
            <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <StickyNote aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{preview}</span>
            </span>
          )}
        </span>
      }
      panel={
        <div className="space-y-4">
          {hasNotes && notesDetail}
          <ActionTray label={`Actions for ${a.activity}`}>{actionList('tray')}</ActionTray>
        </div>
      }
    />
  );
};

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

  const isDesktop = useMinWidth(HISTORY_LG, true);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string, open: boolean) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

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
          <CardContent className="px-0">
            {loading ? (
              <div className="px-4 sm:px-6"><PageLoading label="Loading activities" rows={3} /></div>
            ) : filtered.length === 0 ? (
              <div className="px-4 sm:px-6">
                <PageEmptyState
                  icon={Activity}
                  title={activities.length === 0 ? 'No extra activities logged yet' : 'No activities match your filters'}
                  description={activities.length === 0 ? 'Log your first activity above.' : 'Try a different search or date range.'}
                />
              </div>
            ) : (
              <>
                {isDesktop && <DesktopColumnHeader />}
                <HistoryList variant="workout" className="border-b">
                  {paginatedItems.map((a) => (
                    <ExtraActivityRow
                      key={a.id}
                      activity={a}
                      desktop={isDesktop}
                      today={today}
                      expanded={expandedIds.has(a.id)}
                      editing={editingId === a.id}
                      onExpandedChange={(open) => toggleExpanded(a.id, open)}
                      onEdit={handleEdit}
                      onDelete={deleteActivity}
                    />
                  ))}
                </HistoryList>
              </>
            )}
            {!loading && (
              <div className="px-4 pb-1 sm:px-6">
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  onPageChange={goToPage}
                  hasNextPage={hasNextPage}
                  hasPrevPage={hasPrevPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
};

export default ExtraActivities;
