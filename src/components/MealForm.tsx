import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Utensils } from 'lucide-react';
import { toast } from 'sonner';

interface MealFormProps {
  onSubmit: (meal: { food: string; calories: number; time: string; date: string }) => void;
}

export const MealForm = ({ onSubmit }: MealFormProps) => {
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleCaloriesChange = (value: string) => {
    // Allow digits and decimal separators, convert comma to dot
    const sanitized = value.replace(',', '.');
    if (sanitized === '' || /^\d*\.?\d*$/.test(sanitized)) {
      setCalories(sanitized);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!food || !calories || !time || !date) {
      toast.error('Please fill in all fields');
      return;
    }
    if (food.length > 500) {
      toast.error('Food description must be 500 characters or less');
      return;
    }
    onSubmit({
      food: food.trim(),
      calories: parseInt(calories),
      time,
      date,
    });
    setFood('');
    setCalories('');
    setTime('');
    toast.success('Meal logged successfully!');
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Utensils className="h-5 w-5 text-primary" />
          Log a Meal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="food">What did you eat?</Label>
            <Input
              id="food"
              placeholder="e.g., Grilled chicken salad"
              value={food}
              onChange={(e) => setFood(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="calories">Calories</Label>
              <Input
                id="calories"
                type="text"
                inputMode="decimal"
                placeholder="e.g., 450"
                value={calories}
                onChange={(e) => handleCaloriesChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time Eaten</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Log Meal
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
