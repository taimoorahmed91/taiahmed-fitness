import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Utensils } from 'lucide-react';
import { toast } from 'sonner';

interface MealFormProps {
  onSubmit: (meal: { food: string; calories: number; protein: number | null; carbs: number | null; time: string; date: string }) => void;
  prefillData?: { food: string; calories: number; protein?: number | null; carbs?: number | null } | null;
  onPrefillConsumed?: () => void;
}

const getCurrentTime = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

export const MealForm = ({ onSubmit, prefillData, onPrefillConsumed }: MealFormProps) => {
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [time, setTime] = useState(getCurrentTime);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Handle prefill when a meal is copied
  useEffect(() => {
    if (prefillData) {
      setFood(prefillData.food);
      setCalories(prefillData.calories.toString());
      setProtein(prefillData.protein != null ? prefillData.protein.toString() : '');
      setTime(getCurrentTime());
      setDate(new Date().toISOString().split('T')[0]);
      onPrefillConsumed?.();
      toast.info('Meal copied to form');
    }
  }, [prefillData, onPrefillConsumed]);

  const handleNumericChange = (value: string, setter: (v: string) => void) => {
    // Allow digits and decimal separators, convert comma to dot
    const sanitized = value.replace(',', '.');
    if (sanitized === '' || /^\d*\.?\d*$/.test(sanitized)) {
      setter(sanitized);
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
      protein: protein === '' ? null : parseFloat(protein),
      time,
      date,
    });
    setFood('');
    setCalories('');
    setProtein('');
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
                onChange={(e) => handleNumericChange(e.target.value, setCalories)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="protein">Protein (g)</Label>
              <Input
                id="protein"
                type="text"
                inputMode="decimal"
                placeholder="e.g., 32"
                value={protein}
                onChange={(e) => handleNumericChange(e.target.value, setProtein)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="time">Time Eaten</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
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
          </div>
          <Button type="submit" className="w-full">
            Log Meal
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
