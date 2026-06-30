import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dumbbell, PlayCircle } from 'lucide-react';

interface GymFormProps {
  onStart: (name: string) => void;
}

export const GymForm = ({ onStart }: GymFormProps) => {
  const [name, setName] = useState('');

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 500);
    onStart(trimmed || 'Workout');
    setName('');
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
        <form onSubmit={handleStart} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-workout-name">Workout Name (optional)</Label>
            <Input
              id="manual-workout-name"
              placeholder='e.g., "Chest & Triceps" — leave blank for "Workout"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Starts a live session — duration, start time, sets, reps, weight and notes are
              captured in the workout pop-up, just like a template start.
            </p>
          </div>
          <Button type="submit" className="w-full gap-2">
            <PlayCircle className="h-4 w-4" />
            Start Workout
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
