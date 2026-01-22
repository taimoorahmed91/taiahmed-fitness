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
import { Ruler, Plus, Trash2, Edit2 } from 'lucide-react';
import { useWaist, WaistEntry } from '@/hooks/useWaist';
import { useDataFilter } from '@/hooks/useDataFilter';

const Waist = () => {
  const { entries, loading, addEntry, updateEntry, deleteEntry } = useWaist();
  const [waist, setWaist] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [editEntry, setEditEntry] = useState<WaistEntry | null>(null);
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
    searchFields: ['notes'] as (keyof WaistEntry)[],
    dateField: 'date' as keyof WaistEntry,
  });

  const sortedEntries = useMemo(() => {
    if (sortOrder === null) return filteredEntries;
    return [...filteredEntries].sort((a, b) => {
      return sortOrder === 'asc' ? a.waist - b.waist : b.waist - a.waist;
    });
  }, [filteredEntries, sortOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waist || !date) return;
    if (notes && notes.length > 2000) {
      return;
    }

    addEntry({
      waist: parseFloat(waist),
      date,
      notes: notes?.trim() || undefined,
    });

    setWaist('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  };

  const handleEdit = (entry: WaistEntry) => {
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
      waist: editEntry.waist,
      date: editEntry.date,
      notes: editEntry.notes?.trim(),
    });

    setEditDialogOpen(false);
    setEditEntry(null);
  };

  const latestWaist = entries[0]?.waist;
  const previousWaist = entries[1]?.waist;
  const waistChange = latestWaist && previousWaist ? latestWaist - previousWaist : null;

  // Calculate waist differences for 7, 15, and 30 days ago
  const periodChanges = useMemo(() => {
    if (!latestWaist || entries.length < 2) return { day7: null, day15: null, day30: null };

    const today = new Date();
    
    // Find the oldest entry within the given period (days ago from today)
    const findOldestInPeriod = (daysAgo: number) => {
      const cutoffDate = subDays(today, daysAgo);
      let oldest: { waist: number; date: Date } | null = null;

      for (const entry of entries) {
        const entryDate = parseISO(entry.date);
        // Entry must be within the period (between cutoffDate and today)
        if (entryDate >= cutoffDate && entryDate <= today) {
          if (!oldest || entryDate < oldest.date) {
            oldest = { waist: entry.waist, date: entryDate };
          }
        }
      }
      return oldest?.waist ?? null;
    };

    const waist7 = findOldestInPeriod(7);
    const waist15 = findOldestInPeriod(15);
    const waist30 = findOldestInPeriod(30);

    return {
      day7: waist7 !== null ? latestWaist - waist7 : null,
      day15: waist15 !== null ? latestWaist - waist15 : null,
      day30: waist30 !== null ? latestWaist - waist30 : null,
    };
  }, [entries, latestWaist]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Ruler className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Waist Tracking</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Add Waist Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Log Waist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="waist">Waist (cm)</Label>
                    <Input
                      id="waist"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      placeholder="80.5"
                      value={waist}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setWaist(value);
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
                    placeholder="Any notes about this measurement..."
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
              {latestWaist ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Latest Waist</p>
                    <p className="text-3xl font-bold">{latestWaist} cm</p>
                  </div>
                  {waistChange !== null && (
                    <div>
                      <p className="text-sm text-muted-foreground">Change from Previous</p>
                      <p className={`text-xl font-semibold ${waistChange > 0 ? 'text-destructive' : waistChange < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {waistChange > 0 ? '+' : ''}{waistChange.toFixed(1)} cm
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Total Entries</p>
                    <p className="text-xl font-semibold">{entries.length}</p>
                  </div>

                  {/* Period Changes */}
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-3">Waist Change Over Time</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">7 Days</p>
                        {periodChanges.day7 !== null ? (
                          <p className={`text-sm font-semibold ${periodChanges.day7 > 0 ? 'text-destructive' : periodChanges.day7 < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {periodChanges.day7 > 0 ? '+' : ''}{periodChanges.day7.toFixed(1)} cm
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">15 Days</p>
                        {periodChanges.day15 !== null ? (
                          <p className={`text-sm font-semibold ${periodChanges.day15 > 0 ? 'text-destructive' : periodChanges.day15 < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {periodChanges.day15 > 0 ? '+' : ''}{periodChanges.day15.toFixed(1)} cm
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">30 Days</p>
                        {periodChanges.day30 !== null ? (
                          <p className={`text-sm font-semibold ${periodChanges.day30 > 0 ? 'text-destructive' : periodChanges.day30 < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {periodChanges.day30 > 0 ? '+' : ''}{periodChanges.day30.toFixed(1)} cm
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No waist entries yet</p>
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

        {/* Waist History */}
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Waist History</CardTitle>
            <SortControl label="Waist" sortOrder={sortOrder} onSortChange={setSortOrder} />
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filteredEntries.length === 0 ? (
              <p className="text-muted-foreground">
                {entries.length === 0 ? 'No waist entries yet' : 'No entries match your filters'}
              </p>
            ) : (
              <div className="space-y-3">
                {sortedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex-1">
                      <p className="font-semibold">{entry.waist} cm</p>
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
              <DialogTitle>Edit Waist Entry</DialogTitle>
            </DialogHeader>
            {editEntry && (
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-waist">Waist (cm)</Label>
                    <Input
                      id="edit-waist"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={editEntry.waist}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setEditEntry({ ...editEntry, waist: parseFloat(value) || 0 });
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

export default Waist;
