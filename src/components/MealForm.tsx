import { useState, useEffect, useMemo } from 'react';
import type { Meal } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Utensils, Star } from 'lucide-react';

import { useMealFavorites } from '@/hooks/useMealFavorites';
import { toast } from 'sonner';

interface MealFormProps {
  onSubmit: (meal: { food: string; calories: number; protein: number | null; carbs: number | null; time: string; date: string }) => void;
  prefillData?: { food: string; calories: number; protein?: number | null; carbs?: number | null } | null;
  onPrefillConsumed?: () => void;
  meals?: Meal[];
}

const getCurrentTime = () => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

export const MealForm = ({ onSubmit, prefillData, onPrefillConsumed, meals = [] }: MealFormProps) => {
  const { favorites, toggleFavorite } = useMealFavorites();
  // Latest logged version of each meal; favorites first, then most frequent (logged 2+ times).
  const quickMeals = useMemo(() => {
    const byName = new Map<string, { meal: Meal; count: number }>();
    [...meals].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).forEach((m) => {
      const key = m.food.trim().toLowerCase();
      const hit = byName.get(key);
      if (hit) hit.count += 1; else byName.set(key, { meal: m, count: 1 });
    });
    const list = Array.from(byName.entries()).map(([key, v]) => ({ key, ...v, fav: favorites.includes(key) }));
    const favs = list.filter((x) => x.fav);
    const frequent = list.filter((x) => !x.fav && x.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6);
    return [...favs, ...frequent];
  }, [meals, favorites]);
  const quickFill = (m: Meal) => {
    setFood(m.food);
    setCalories(String(m.calories));
    setProtein(m.protein != null ? String(m.protein) : '');
    setCarbs(m.carbs != null ? String(m.carbs) : '');
    setTime(getCurrentTime());
    setDate(new Date().toISOString().split('T')[0]);
  };
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [time, setTime] = useState(getCurrentTime);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Handle prefill when a meal is copied
  useEffect(() => {
    if (prefillData) {
      setFood(prefillData.food);
      setCalories(prefillData.calories.toString());
      setProtein(prefillData.protein != null ? prefillData.protein.toString() : '');
      setCarbs(prefillData.carbs != null ? prefillData.carbs.toString() : '');
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
      carbs: carbs === '' ? null : parseFloat(carbs),
      time,
      date,
    });
    setFood('');
    setCalories('');
    setProtein('');
    setCarbs('');
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
        {quickMeals.length > 0 && (
          <div className="mb-4 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Quick add</Label>
            <div className="flex flex-wrap gap-2">
              {quickMeals.map(({ key, meal, fav }) => (
                <div key={key} className={`flex items-center rounded-full border text-sm ${fav ? 'border-primary/50 bg-primary/10' : 'bg-muted/30'}`}>
                  <button type="button" onClick={() => quickFill(meal)} className="max-w-[12rem] truncate py-1 pl-3 pr-1" title={`${meal.food} · ${meal.calories} cal`}>
                    {meal.food} <span className="text-muted-foreground">· {meal.calories}</span>
                  </button>
                  <button type="button" onClick={() => toggleFavorite(meal.food)} className="py-1 pl-1 pr-2" aria-label={fav ? `Unstar ${meal.food}` : `Star ${meal.food}`}>
                    <Star className={`h-3.5 w-3.5 ${fav ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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
              <Label htmlFor="carbs">Carbs (g)</Label>
              <Input
                id="carbs"
                type="text"
                inputMode="decimal"
                placeholder="e.g., 120"
                value={carbs}
                onChange={(e) => handleNumericChange(e.target.value, setCarbs)}
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
