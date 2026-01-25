import { useState, useMemo } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataFilter } from '@/components/DataFilter';
import { SortControl, SortOrder } from '@/components/SortControl';
import { Scale, Plus, Trash2, Edit2 } from 'lucide-react';
import { useWeight, WeightEntry } from '@/hooks/useWeight';
import { useDataFilter } from '@/hooks/useDataFilter';

const Weight = () => {
  const { entries, loading, addEntry, updateEntry, deleteEntry } = useWeight();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
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

  const sortedEntries = useMemo(() => {
    if (sortOrder === null) return filteredEntries;
    return [...filteredEntries].sort((a, b) => {
      return sortOrder === 'asc' ? a.weight - b.weight : b.weight - a.weight;
    });
  }, [filteredEntries, sortOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weight || !date) return;
    if (notes && notes.length > 2000) {
      return;
    }

    addEntry({
      weight: parseFloat(weight),
      date,
      notes: notes?.trim() || undefined,
    });

    setWeight('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  };

  const handleEdit = (entry: WeightEntry) => {
    setEditEntry(entry);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;
    if (editEntry.notes && editEntry.notes.length > 2000) {
      return;
    }

    updateEntry(editEntry.id, {
      weight: editEntry.weight,
      date: editEntry.date,
      notes: editEntry.notes?.trim(),
    });

    setEditDialogOpen(false);
    setEditEntry(null);
  };

  const latestWeight = entries[0]?.weight;
  const previousWeight = entries[1]?.weight;
  const weightChange = latestWeight && previousWeight ? latestWeight - previousWeight : null;

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
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Scale className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Weight Tracking</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Add Weight Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Log Weight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input
                      id="weight"
                      type="text"
                      placeholder="70.5"
                      value={weight}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*[.,]?\d*$/.test(value)) {
                          setWeight(value.replace(',', '.'));
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
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Entry
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle>Current Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestWeight ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Latest Weight</p>
                    <p className="text-3xl font-bold">{latestWeight} kg</p>
                  </div>
                  {weightChange !== null && (
                    <div>
                      <p className="text-sm text-muted-foreground">Change from Previous</p>
                      <p className={`text-xl font-semibold ${weightChange > 0 ? 'text-destructive' : weightChange < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} kg
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Total Entries</p>
                    <p className="text-xl font-semibold">{entries.length}</p>
                  </div>

                  {/* Period Changes */}
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-3">Weight Change Over Time</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">7 Days</p>
                        {periodChanges.day7 !== null ? (
                          <p className={`text-sm font-semibold ${periodChanges.day7 > 0 ? 'text-destructive' : periodChanges.day7 < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {periodChanges.day7 > 0 ? '+' : ''}{periodChanges.day7.toFixed(1)} kg
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">15 Days</p>
                        {periodChanges.day15 !== null ? (
                          <p className={`text-sm font-semibold ${periodChanges.day15 > 0 ? 'text-destructive' : periodChanges.day15 < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {periodChanges.day15 > 0 ? '+' : ''}{periodChanges.day15.toFixed(1)} kg
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">30 Days</p>
                        {periodChanges.day30 !== null ? (
                          <p className={`text-sm font-semibold ${periodChanges.day30 > 0 ? 'text-destructive' : periodChanges.day30 < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {periodChanges.day30 > 0 ? '+' : ''}{periodChanges.day30.toFixed(1)} kg
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No weight entries yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="mt-6">
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
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Weight History</CardTitle>
            <SortControl label="Weight" sortOrder={sortOrder} onSortChange={setSortOrder} />
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filteredEntries.length === 0 ? (
              <p className="text-muted-foreground">
                {entries.length === 0 ? 'No weight entries yet' : 'No entries match your filters'}
              </p>
            ) : (
              <div className="space-y-3">
                {sortedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex-1">
                      <p className="font-semibold">{entry.weight} kg</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(entry.date), 'PPP')}
                      </p>
                      {entry.notes && (
                        <p className="text-sm text-muted-foreground mt-1 break-words">{entry.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(entry)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Weight Entry</DialogTitle>
            </DialogHeader>
            {editEntry && (
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-weight">Weight (kg)</Label>
                    <Input
                      id="edit-weight"
                      type="text"
                      placeholder="70.5"
                      value={editEntry.weight}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*[.,]?\d*$/.test(value)) {
                          setEditEntry({ ...editEntry, weight: parseFloat(value.replace(',', '.')) || 0 });
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
                <Button type="submit" className="w-full">Save Changes</Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Weight;
