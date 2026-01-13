import { useState } from 'react';
import { format } from 'date-fns';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataFilter } from '@/components/DataFilter';
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
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="70.5"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
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
          <CardHeader>
            <CardTitle>Weight History</CardTitle>
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
                {filteredEntries.map((entry) => (
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
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={editEntry.weight}
                      onChange={(e) => setEditEntry({ ...editEntry, weight: parseFloat(e.target.value) })}
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
