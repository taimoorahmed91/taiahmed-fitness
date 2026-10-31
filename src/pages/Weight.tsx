import { useState, useMemo } from 'react';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { confirmedSuccess, SAVE_FAILED_MESSAGE } from '@/lib/confirmedMutation';
import { subDays, parseISO } from 'date-fns';
import { PageContainer, PageHeader, PageSection, PageLoading, PageEmptyState } from '@/components/layout/Page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataFilter } from '@/components/DataFilter';
import { SortControl, SortOrder } from '@/components/SortControl';
import { Scale, Plus, AlertCircle } from 'lucide-react';
import { useWeight, WeightEntry } from '@/hooks/useWeight';
import { useDataFilter } from '@/hooks/useDataFilter';
import { MetricHistoryList } from '@/components/history/MetricHistoryList';
import { fmt, rangeOf } from '@/lib/bodyHistory';
import { defaultFormDate } from '@/lib/dayLabels';
import { useSharedTableState } from '@/lib/sharedTable';
import { tableView } from '@/components/feedback/tableView';
import { DataLoadError } from '@/components/feedback/DataLoadError';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';
import { CardSkeleton } from '@/components/feedback/CardSkeleton';
import { MetricOverviewCard, GoalPanel } from '@/components/MetricOverviewCard';
import { usePersonalData } from '@/hooks/usePersonalData';

const getWeight = (entry: WeightEntry) => entry.weight;

/** Month heading fact: the lowest and highest reading, only when the month has at least two. Plain numbers, no verdict. */
const monthFacts = (items: WeightEntry[]) => {
  const r = rangeOf(items.map(getWeight));
  return r && r.count >= 2 ? [`Range ${fmt(r.min, 2)}–${fmt(r.max, 2)} kg`] : [];
};

const Weight = () => {
  const { entries, addEntry, updateEntry, deleteEntry, refetch } = useWeight();
  // Where the weight query really is. An empty list only means "no entries" once it has loaded.
  const tableState = useSharedTableState('weight');
  const view = tableView(tableState);
  const { data: personalData } = usePersonalData();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(() => defaultFormDate());
  const [notes, setNotes] = useState('');
  const [editEntry, setEditEntry] = useState<WeightEntry | null>(null);
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
    searchFields: ['notes'] as (keyof WeightEntry)[],
    dateField: 'date' as keyof WeightEntry,
  });

  // The hooks resolve `true` only when the database confirmed the change. Anything else (false or a rejection)
  // keeps the draft on screen with an error, so nothing the person typed is lost.
  const [addError, setAddError] = useState<string | null>(null);
  const { run: saveNew, pending: adding } = useSingleFlight((draft: Omit<WeightEntry, 'id'>) =>
    confirmedSuccess(() => addEntry(draft), { requireTrue: true }),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weight || !date) return;
    if (notes && notes.length > 2000) {
      return;
    }

    setAddError(null);
    const saved = await saveNew({
      weight: parseFloat(weight),
      date,
      notes: notes?.trim() || undefined,
    });
    if (!saved) {
      setAddError(SAVE_FAILED_MESSAGE);
      return;
    }

    setWeight('');
    setDate(defaultFormDate());
    setNotes('');
  };

  const handleEdit = (entry: WeightEntry) => {
    setEditEntry(entry);
    setEditError(null);
    setEditDialogOpen(true);
  };

  const [editError, setEditError] = useState<string | null>(null);
  const { run: saveEdit, pending: savingEdit } = useSingleFlight((id: string, draft: Omit<WeightEntry, 'id'>) =>
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
      weight: editEntry.weight,
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

  const latestWeight = entries[0]?.weight;
  const previousWeight = entries[1]?.weight;
  const weightChange = latestWeight && previousWeight ? latestWeight - previousWeight : null;
  const targetWeight = personalData.target_weight_kg;
  const startWeight = entries[entries.length - 1]?.weight ?? latestWeight ?? 0;

  // Calculate weight differences for 7, 15, and 30 days ago
  const periodChanges = useMemo(() => {
    if (!latestWeight || entries.length < 2) return { day7: null, day15: null, day30: null };

    const today = new Date();
    
    // Find the oldest entry within the given period (days ago from today)
    const findOldestInPeriod = (daysAgo: number) => {
      const cutoffDate = subDays(today, daysAgo);
      let oldest: { weight: number; date: Date } | null = null;

      for (const entry of entries) {
        const entryDate = parseISO(entry.date);
        // Entry must be within the period (between cutoffDate and today)
        if (entryDate >= cutoffDate && entryDate <= today) {
          if (!oldest || entryDate < oldest.date) {
            oldest = { weight: entry.weight, date: entryDate };
          }
        }
      }
      return oldest?.weight ?? null;
    };

    const weight7 = findOldestInPeriod(7);
    const weight15 = findOldestInPeriod(15);
    const weight30 = findOldestInPeriod(30);

    return {
      day7: weight7 !== null ? latestWeight - weight7 : null,
      day15: weight15 !== null ? latestWeight - weight15 : null,
      day30: weight30 !== null ? latestWeight - weight30 : null,
    };
  }, [entries, latestWeight]);

  return (
    <PageContainer>
      <PageHeader icon={Scale} title="Weight Tracking" description="Log your weigh-ins and follow your progress" />

      {/* A refresh failed but the rows below are the last good ones: say so and keep them on screen. */}
      {view === 'ready' && tableState.refreshFailed && (
        <StaleDataNotice subject="your weight entries" onRetry={refetch} />
      )}

      <PageSection title="Log and overview" hideTitle>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Add Weight Form */}
          <Card titleSize="chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Log Weight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} onChange={() => setAddError(null)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input
                      id="weight"
                      type="text"
                      inputMode="decimal"
                      placeholder="70.5"
                      value={weight}
                      onChange={(e) => {
                        const value = e.target.value.replace(',', '.');
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setWeight(value);
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
                    placeholder="Any notes about this weigh-in..."
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

          {/* Stats Card: skeleton while loading, an error (never zeros) if the first load failed. */}
          {view === 'loading' ? (
            <CardSkeleton className="h-full" bodyClassName="h-[22rem]" />
          ) : view === 'error' ? (
            <DataLoadError
              className="h-full"
              title="We couldn't load your weight entries"
              description="Your weight entries are safe. The overview will show once they load."
              onRetry={refetch}
              minHeightClassName="min-h-[22rem]"
            />
          ) : (
            <MetricOverviewCard
              title="Weight Overview"
              latestLabel="Latest Weight"
              latest={latestWeight}
              unit="kg"
              totalEntries={entries.length}
              emptyText="No weight entries yet"
              deltas={[
                { label: 'vs Previous', value: weightChange },
                { label: '7 Days', value: periodChanges.day7 },
                { label: '15 Days', value: periodChanges.day15 },
                { label: '30 Days', value: periodChanges.day30 },
              ]}
              extra={
                targetWeight && latestWeight ? (
                  <GoalPanel
                    label={`Target ${targetWeight} kg`}
                    detail={
                      Math.abs(latestWeight - targetWeight) < 0.05
                        ? 'Goal reached'
                        : `${Math.abs(latestWeight - targetWeight).toFixed(1)} kg to go`
                    }
                    progress={startWeight !== targetWeight ? ((startWeight - latestWeight) / (startWeight - targetWeight)) * 100 : 100}
                  />
                ) : (
                  <GoalPanel label="No target weight set" detail="Set one on the Personal page" />
                )
              }
            />
          )}
        </div>
      </PageSection>

      <PageSection title="Weight history" hideTitle>
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

        {/* Weight History */}
        <Card titleSize="chart">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle>Weight History</CardTitle>
            <SortControl label="Weight" sortOrder={sortOrder} onSortChange={setSortOrder} />
          </CardHeader>
          <CardContent className={view === 'ready' && filteredEntries.length > 0 ? 'px-0' : undefined}>
            {view === 'loading' ? (
              <PageLoading label="Loading weight entries" />
            ) : view === 'error' ? (
              <p className="flex min-h-[13.5rem] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Your weight history will show here once your entries load.
              </p>
            ) : filteredEntries.length === 0 ? (
              <PageEmptyState
                icon={Scale}
                title={entries.length === 0 ? 'No weight entries yet' : 'No entries match your filters'}
                description={entries.length === 0 ? 'Log your first weigh-in above.' : 'Try a different search or time range.'}
              />
            ) : (
              <MetricHistoryList
                entries={filteredEntries}
                allEntries={entries}
                sortOrder={sortOrder}
                sortName="weight"
                getValue={getWeight}
                valueLabel="Weight"
                unit="kg"
                spokenUnit="kilograms"
                entryNoun="weight entry"
                countNoun={{ one: 'entry', many: 'entries' }}
                showChange
                monthFacts={monthFacts}
                deleteTitle="Delete weight entry?"
                deleteDescription={(entry) => `Are you sure you want to delete ${entry.weight} kg recorded on ${entry.date}, including its notes? This cannot be undone.`}
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
            <DialogTitle>Edit Weight Entry</DialogTitle>
          </DialogHeader>
          {editEntry && (
            <form onSubmit={handleEditSubmit} onChange={() => setEditError(null)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <div className="space-y-2">
                  <Label htmlFor="edit-weight">Weight (kg)</Label>
                  <Input
                    id="edit-weight"
                    type="text"
                    inputMode="decimal"
                    placeholder="70.5"
                    value={editEntry.weight}
                    onChange={(e) => {
                      const value = e.target.value.replace(',', '.');
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        setEditEntry({ ...editEntry, weight: parseFloat(value) || 0 });
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

export default Weight;
