import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dumbbell } from 'lucide-react';
import { toast } from 'sonner';

interface GymFormProps {
  onSubmit: (session: { exercise: string; duration: number; date: string; notes?: string }) => void;
}

export const GymForm = ({ onSubmit }: GymFormProps) => {
  const [exercise, setExercise] = useState('');
  const [duration, setDuration] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exercise || !duration || !date) {
      toast.error('Please fill in required fields');
      return;
    }
    onSubmit({
      exercise,
      duration: parseInt(duration),
      date,
      notes: notes || undefined,
    });
    setExercise('');
    setDuration('');
    setNotes('');
    toast.success('Workout logged!');
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Dumbbell className="h-5 w-5 text-primary" />
          Log Workout
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exercise">Exercise Type</Label>
            <Input
              id="exercise"
              placeholder="e.g., Chest & Triceps"
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                placeholder="e.g., 60"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gym-date">Date</Label>
              <Input
                id="gym-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any details about your workout..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <Button type="submit" className="w-full">
            Log Workout
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
