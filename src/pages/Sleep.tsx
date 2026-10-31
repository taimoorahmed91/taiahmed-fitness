import { useState } from 'react';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { confirmedSuccess, SAVE_FAILED_MESSAGE } from '@/lib/confirmedMutation';
import { defaultFormDate } from '@/lib/dayLabels';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState } from '@/components/layout/Page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataFilter } from '@/components/DataFilter';
import { SortControl, SortOrder } from '@/components/SortControl';
import { Moon, Plus, AlertCircle } from 'lucide-react';
import { useSleep, SleepEntry } from '@/hooks/useSleep';
import { useDataFilter } from '@/hooks/useDataFilter';
import { MetricHistoryList } from '@/components/history/MetricHistoryList';
import { BandChip } from '@/components/history/BandChip';
import { SleepBar } from '@/components/history/SleepBar';
import { fmt, rangeOf, sleepBand, MIN_FOR_AVERAGE } from '@/lib/bodyHistory';
import { useSharedTableState } from '@/lib/sharedTable';
import { tableView } from '@/components/feedback/tableView';
import { DataLoadError } from '@/components/feedback/DataLoadError';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';
import { CardSkeleton } from '@/components/feedback/CardSkeleton';
import { StatTile, STAT_GRID_CLASS } from '@/components/MetricOverviewCard';

const getHours = (entry: SleepEntry) => entry.hours;

/** Hours-only band (see sleepBand): a word, a dot and a border, never colour alone. */
const bandFor = (entry: SleepEntry) => sleepBand(entry.hours);

/** Month heading number: the average night, only when the month has at least three nights. */
const monthStat = (items: SleepEntry[]) => {
  const r = rangeOf(items.map(getHours));
  return r && r.count >= MIN_FOR_AVERAGE ? { value: fmt(r.mean, 1), unit: 'h', label: 'avg per night' } : null;
};

const Sleep = () => {
  const { entries, addEntry, updateEntry, deleteEntry, refetch } = useSleep();
  // Where the sleep query really is. An empty list only means "no entries" once it has loaded.
  const tableState = useSharedTableState('sleep');
  const view = tableView(tableState);
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(() => defaultFormDate());
  const [notes, setNotes] = useState('');
  const [editEntry, setEditEntry] = useState<SleepEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);

  const {
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    dateRange,
    setDateRange,
    filteredData: filteredEntries,
  } = useDataFilter({
    data: entries,
    searchFields: ['notes'] as (keyof SleepEntry)[],
    dateField: 'date' as keyof SleepEntry,
  });

  // The hooks resolve `true` only when the database confirmed the change. Anything else (false or a rejection)
  // keeps the draft on screen with an error, so nothing the person typed is lost.
  const [addError, setAddError] = useState<string | null>(null);
  const { run: saveNew, pending: adding } = useSingleFlight((draft: Omit<SleepEntry, 'id'>) =>
    confirmedSuccess(() => addEntry(draft), { requireTrue: true }),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hours || !date) return;
    if (notes && notes.length > 2000) {
      return;
    }

    setAddError(null);
    const saved = await saveNew({
      hours: parseFloat(hours),
      date,
      notes: notes?.trim() || undefined,
    });
    if (!saved) {
      setAddError(SAVE_FAILED_MESSAGE);
      return;
    }

    setHours('');
    setDate(defaultFormDate());
    setNotes('');
  };

  const handleEdit = (entry: SleepEntry) => {
    setEditEntry(entry);
    setEditError(null);
    setEditDialogOpen(true);
  };

  const [editError, setEditError] = useState<string | null>(null);
  const { run: saveEdit, pending: savingEdit } = useSingleFlight((id: string, draft: Omit<SleepEntry, 'id'>) =>
    confirmedSuccess(() => updateEntry(id, draft), { requireTrue: true }),
  );

  const handleEditDialogChange = (open: boolean) => {
    // Cannot be dismissed while the save is running; otherwise the result would land on a closed dialog.
    if (!open && savingEdit) return;
    setEditDialogOpen(open);
    if (!open) setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;
    if (editEntry.notes && editEntry.notes.length > 2000) {
      return;
    }

    setEditError(null);
    const saved = await saveEdit(editEntry.id, {
      hours: editEntry.hours,
      date: editEntry.date,
      notes: editEntry.notes?.trim(),
    });
    if (!saved) {
      // Keep the dialog open with everything the person typed.
      setEditError(SAVE_FAILED_MESSAGE);
      return;
    }

    setEditDialogOpen(false);
    setEditEntry(null);
  };

  // Calculate averages
  const last7Days = entries.slice(0, 7);
  const avgSleep = last7Days.length > 0 
    ? (last7Days.reduce((sum, e) => sum + e.hours, 0) / last7Days.length).toFixed(1)
    : null;

  return (
    <PageContainer>
      <PageHeader icon={Moon} title="Sleep Tracking" description="Log your nights and follow your progress" />

      {/* A refresh failed but the rows below are the last good ones: say so and keep them on screen. */}
      {view === 'ready' && tableState.refreshFailed && (
        <StaleDataNotice subject="your sleep entries" onRetry={refetch} />
      )}

      <PageSection title="Log and overview" hideTitle>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Add Sleep Form */}
          <Card titleSize="chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Log Sleep
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} onChange={() => setAddError(null)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="space-y-2">
                    <Label htmlFor="hours">Hours Slept</Label>
                    <Input
                      id="hours"
                      type="text"
                      inputMode="decimal"
                      placeholder="7.5"
                      value={hours}
                      onChange={(e) => {
                        const value = e.target.value.replace(',', '.');
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          const numValue = parseFloat(value);
                          if (value === '' || (numValue >= 0 && numValue <= 24)) {
                            setHours(value);
                          }
                        }
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any notes about your sleep..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={2000}
                  />
                </div>
                {addError && (
                  <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{addError}</span>
                  </p>
                )}
                <Button type="submit" className="w-full" loading={adding} loadingText="Adding…">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Entry
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Stats Card: skeleton while loading, an error (never "no entries") if the first load failed. */}
          {view === 'loading' ? (
            <CardSkeleton className="h-full" bodyClassName="h-[22rem]" />
          ) : view === 'error' ? (
            <DataLoadError
              className="h-full"
              title="We couldn't load your sleep entries"
              description="Your sleep entries are safe. The overview will show once they load."
              onRetry={refetch}
              minHeightClassName="min-h-[22rem]"
            />
          ) : (
            <Card className="h-full" titleSize="chart">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Moon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                  Sleep Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {entries.length > 0 ? (() => {
                  const last30 = entries.slice(0, 30);
                  const avg30 = (last30.reduce((s, e) => s + e.hours, 0) / last30.length).toFixed(1);
                  const best = Math.max(...last30.map((e) => e.hours));
                  const worst = Math.min(...last30.map((e) => e.hours));
                  const optimal = last30.filter((e) => e.hours >= 7 && e.hours <= 9).length;
                  const q = sleepBand(entries[0].hours);
                  return (
                    <>
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Last Night</p>
                          <p className="text-4xl font-bold tabular-nums tracking-tight">
                            {entries[0]?.hours} <span className="text-lg font-medium text-muted-foreground">hours</span>
                          </p>
                          <SleepBar hours={entries[0].hours} className="mt-2 max-w-44" />
                          <BandChip label={q.label} tone={q.tone} className="mt-2" />
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total Entries</p>
                          <p className="text-xl font-semibold">{entries.length}</p>
                        </div>
                      </div>
                      <div className={STAT_GRID_CLASS}>
                        {[
                          { label: '7-Day Avg', value: avgSleep ? `${avgSleep} h` : '—' },
                          { label: '30-Entry Avg', value: `${avg30} h` },
                          { label: 'Best Night', value: `${best} h` },
                          { label: 'Shortest', value: `${worst} h` },
                        ].map((t) => (
                          <StatTile key={t.label} label={t.label}>
                            <span className="whitespace-nowrap">{t.value}</span>
                          </StatTile>
                        ))}
                      </div>
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                        <span className="font-medium">{optimal} of {last30.length}</span>
                        <span className="text-muted-foreground"> recent nights in the 7–9 h optimal range</span>
                      </div>
                    </>
                  );
                })() : (
                  <p className="text-muted-foreground">No sleep entries yet</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageSection>

      <PageSection title="Sleep history" hideTitle>
        {/* Search and Filter */}
        <div>
          <DataFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            searchPlaceholder="Search by notes..."
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            showDateRange
          />
        </div>

        {/* Sleep History */}
        <Card titleSize="chart">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle>Sleep History</CardTitle>
            <SortControl label="Hours" sortOrder={sortOrder} onSortChange={setSortOrder} />
          </CardHeader>
          <CardContent className={view === 'ready' && filteredEntries.length > 0 ? 'px-0' : undefined}>
            {view === 'loading' ? (
              <PageLoading label="Loading sleep entries" />
            ) : view === 'error' ? (
              <p className="flex min-h-[13.5rem] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Your sleep history will show here once your entries load.
              </p>
            ) : filteredEntries.length === 0 ? (
              <PageEmptyState
                icon={Moon}
                title={entries.length === 0 ? 'No sleep entries yet' : 'No entries match your filters'}
                description={entries.length === 0 ? 'Log your first night above.' : 'Try a different search or time range.'}
              />
            ) : (
              <MetricHistoryList
                entries={filteredEntries}
                allEntries={entries}
                sortOrder={sortOrder}
                sortName="hours"
                getValue={getHours}
                valueLabel="Hours"
                unit="h"
                spokenUnit="hours"
                entryNoun="sleep entry"
                countNoun={{ one: 'night', many: 'nights' }}
                band={bandFor}
                variant="sleep"
                monthStat={monthStat}
                deleteTitle="Delete sleep entry?"
                deleteDescription={(entry) => `Are you sure you want to delete ${entry.hours} hours recorded on ${entry.date}, including its notes? This cannot be undone.`}
                onEdit={handleEdit}
                onDelete={deleteEntry}
              />
            )}
          </CardContent>
        </Card>
      </PageSection>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={handleEditDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sleep Entry</DialogTitle>
          </DialogHeader>
          {editEntry && (
            <form onSubmit={handleEditSubmit} onChange={() => setEditError(null)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <div className="space-y-2">
                  <Label htmlFor="edit-hours">Hours Slept</Label>
                  <Input
                    id="edit-hours"
                    type="text"
                    inputMode="decimal"
                    value={editEntry.hours}
                    onChange={(e) => {
                      const value = e.target.value.replace(',', '.');
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        const numValue = parseFloat(value);
                        if (value === '' || (numValue >= 0 && numValue <= 24)) {
                          setEditEntry({ ...editEntry, hours: numValue || 0 });
                        }
                      }
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editEntry.date}
                    onChange={(e) => setEditEntry({ ...editEntry, date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editEntry.notes || ''}
                  onChange={(e) => setEditEntry({ ...editEntry, notes: e.target.value })}
                  maxLength={2000}
                />
              </div>
              {editError && (
                <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{editError}</span>
                </p>
              )}
              <Button type="submit" className="w-full" loading={savingEdit} loadingText="Saving…">Save Changes</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default Sleep;
