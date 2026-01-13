import { useState } from 'react';
import { GymForm } from '@/components/GymForm';
import { GymList } from '@/components/GymList';
import { DataFilter } from '@/components/DataFilter';
import { useGymSessions } from '@/hooks/useGymSessions';
import { useDataFilter } from '@/hooks/useDataFilter';
import { GymSession } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const Gym = () => {
  const { sessions, addSession, deleteSession, updateSession } = useGymSessions();
  const [editingSession, setEditingSession] = useState<GymSession | null>(null);
  const [editForm, setEditForm] = useState({ exercise: '', duration: '', date: '', notes: '' });

  const {
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    dateRange,
    setDateRange,
    filteredData: filteredSessions,
  } = useDataFilter({
    data: sessions,
    searchFields: ['exercise', 'notes'] as (keyof GymSession)[],
    dateField: 'date' as keyof GymSession,
  });

  const handleEditClick = (session: GymSession) => {
    setEditingSession(session);
    setEditForm({
      exercise: session.exercise,
      duration: session.duration.toString(),
      date: session.date,
      notes: session.notes || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSession) return;
    
    await updateSession(editingSession.id, {
      exercise: editForm.exercise,
      duration: parseInt(editForm.duration) || 0,
      date: editForm.date,
      notes: editForm.notes || undefined,
    });
    
    setEditingSession(null);
  };

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gym Schedule</h1>
        <p className="text-muted-foreground mt-1">Log your workouts and track your progress</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <GymForm onSubmit={addSession} />
        <div className="space-y-4">
          <DataFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            searchPlaceholder="Search workouts..."
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            showDateRange
          />
          <GymList sessions={filteredSessions} onDelete={deleteSession} onEdit={handleEditClick} />
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-exercise">Exercise</Label>
              <Input
                id="edit-exercise"
                value={editForm.exercise}
                onChange={(e) => setEditForm({ ...editForm, exercise: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-duration">Duration (minutes)</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  value={editForm.duration}
                  onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes (optional)</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingSession(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Gym;
