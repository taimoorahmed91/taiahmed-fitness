import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataFilter } from '@/components/DataFilter';
import { SortControl, SortOrder } from '@/components/SortControl';
import { Moon, Plus, Trash2, Edit2 } from 'lucide-react';
import { useSleep, SleepEntry } from '@/hooks/useSleep';
import { useDataFilter } from '@/hooks/useDataFilter';

const Sleep = () => {
  const { entries, loading, addEntry, updateEntry, deleteEntry } = useSleep();
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
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

  const sortedEntries = useMemo(() => {
    if (sortOrder === null) return filteredEntries;
    return [...filteredEntries].sort((a, b) => {
      return sortOrder === 'asc' ? a.hours - b.hours : b.hours - a.hours;
    });
  }, [filteredEntries, sortOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hours || !date) return;
    if (notes && notes.length > 2000) {
      return;
    }

    addEntry({
      hours: parseFloat(hours),
      date,
      notes: notes?.trim() || undefined,
    });

    setHours('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  };

  const handleEdit = (entry: SleepEntry) => {
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
      hours: editEntry.hours,
      date: editEntry.date,
      notes: editEntry.notes?.trim(),
    });

    setEditDialogOpen(false);
    setEditEntry(null);
  };

  // Calculate averages
  const last7Days = entries.slice(0, 7);
  const avgSleep = last7Days.length > 0 
    ? (last7Days.reduce((sum, e) => sum + e.hours, 0) / last7Days.length).toFixed(1)
    : null;

  const getSleepQuality = (hours: number) => {
    if (hours >= 7 && hours <= 9) return { label: 'Good', color: 'text-green-600' };
    if (hours >= 6 && hours < 7) return { label: 'Fair', color: 'text-yellow-600' };
    return { label: 'Poor', color: 'text-destructive' };
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Moon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Sleep Tracking</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Add Sleep Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Log Sleep
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hours">Hours Slept</Label>
                    <Input
                      id="hours"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      placeholder="7.5"
                      value={hours}
                      onChange={(e) => {
                        const value = e.target.value;
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
              <CardTitle>Sleep Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {entries.length > 0 ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Night</p>
                    <p className="text-3xl font-bold">{entries[0]?.hours} hours</p>
                    {entries[0] && (
                      <p className={`text-sm ${getSleepQuality(entries[0].hours).color}`}>
                        {getSleepQuality(entries[0].hours).label}
                      </p>
                    )}
                  </div>
                  {avgSleep && (
                    <div>
                      <p className="text-sm text-muted-foreground">7-Day Average</p>
                      <p className="text-xl font-semibold">{avgSleep} hours</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Total Entries</p>
                    <p className="text-xl font-semibold">{entries.length}</p>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No sleep entries yet</p>
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

        {/* Sleep History */}
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Sleep History</CardTitle>
            <SortControl label="Hours" sortOrder={sortOrder} onSortChange={setSortOrder} />
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filteredEntries.length === 0 ? (
              <p className="text-muted-foreground">
                {entries.length === 0 ? 'No sleep entries yet' : 'No entries match your filters'}
              </p>
            ) : (
              <div className="space-y-3">
                {sortedEntries.map((entry) => {
                  const quality = getSleepQuality(entry.hours);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{entry.hours} hours</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full bg-muted ${quality.color}`}>
                            {quality.label}
                          </span>
                        </div>
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Sleep Entry</DialogTitle>
            </DialogHeader>
            {editEntry && (
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-hours">Hours Slept</Label>
                    <Input
                      id="edit-hours"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={editEntry.hours}
                      onChange={(e) => {
                        const value = e.target.value;
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
                <Button type="submit" className="w-full">Save Changes</Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Sleep;
