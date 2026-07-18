import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Activity, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExtraActivities } from '@/hooks/useExtraActivities';

const INTENSITY_LABELS: Record<number, string> = {
  1: 'Very Light',
  2: 'Light',
  3: 'Moderate',
  4: 'Hard',
  5: 'Very Hard',
};

const intensityColor = (n: number) => {
  switch (n) {
    case 1: return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    case 2: return 'bg-lime-500/15 text-lime-500 border-lime-500/30';
    case 3: return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30';
    case 4: return 'bg-orange-500/15 text-orange-500 border-orange-500/30';
    case 5: return 'bg-red-500/15 text-red-500 border-red-500/30';
    default: return '';
  }
};

const ExtraActivities = () => {
  const { activities, addActivity, deleteActivity, loading } = useExtraActivities();
  const today = new Date().toISOString().split('T')[0];
  const currentTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const [date, setDate] = useState(today);
  const [time, setTime] = useState(currentTime());
  const [activity, setActivity] = useState('');
  const [intensity, setIntensity] = useState<string>('3');
  const [calories, setCalories] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity.trim()) return;
    await addActivity({
      date,
      time: time || null,
      activity: activity.trim(),
      intensity: parseInt(intensity, 10),
      calories: calories ? parseInt(calories, 10) : 0,
      duration_minutes: duration ? parseInt(duration, 10) : null,
      notes: notes.trim() || null,
    });
    setActivity('');
    setDuration('');
    setCalories('');
    setNotes('');
    setIntensity('3');
    setDate(today);
    setTime(currentTime());
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Activity className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Extra Activity</h1>
            <p className="text-muted-foreground">
              Log non-gym activities that still count — walks, hikes, sports, chores, etc.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Log Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Time</Label>
                    <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (min)</Label>
                    <Input id="duration" type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="calories">Calories burned</Label>
                    <Input id="calories" type="number" min="0" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Added to daily goal" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activity">Activity</Label>
                  <Input id="activity" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. 5km walk, soccer, cleaning..." required />
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
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details..." rows={3} />
                </div>

                <Button type="submit" className="w-full">Add Activity</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : activities.length === 0 ? (
                <p className="text-muted-foreground text-sm">No extra activities logged yet.</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {activities.map((a) => (
                    <div key={a.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{a.activity}</span>
                          <Badge variant="outline" className={intensityColor(a.intensity)}>
                            Intensity {a.intensity} · {INTENSITY_LABELS[a.intensity]}
                          </Badge>
                          {a.duration_minutes != null && (
                            <Badge variant="outline">{a.duration_minutes} min</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{a.date}</div>
                        {a.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{a.notes}</p>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => deleteActivity(a.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ExtraActivities;
