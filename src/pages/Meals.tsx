import { useState, useMemo } from 'react';
import { MealForm } from '@/components/MealForm';
import { MealList } from '@/components/MealList';
import { useMeals } from '@/hooks/useMeals';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useGymSessions } from '@/hooks/useGymSessions';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useExtraActivities } from '@/hooks/useExtraActivities';
import { useWeight } from '@/hooks/useWeight';
import { Meal } from '@/types';
import { resolveCalorieRange, macroRange } from '@/lib/targets';
import { MealsTodayCard } from '@/components/MealsTodayCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Utensils } from 'lucide-react';

const Meals = () => {
  const { meals, addMeal, deleteMeal, updateMeal, getTodayCalories, getTodayProtein, getTodayCarbs } = useMeals();
  const { settings } = useUserSettings();
  const { sessions: gymSessions } = useGymSessions();
  const { data: personalData } = usePersonalData();
  const { activities: extraActivities } = useExtraActivities();
  const { entries: weightEntries } = useWeight();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editForm, setEditForm] = useState({ food: '', calories: '', protein: '', carbs: '', time: '', date: '' });
  const [prefillData, setPrefillData] = useState<{ food: string; calories: number; protein?: number | null; carbs?: number | null } | null>(null);

  const handleCopyMeal = (meal: Meal) => {
    setPrefillData({ food: meal.food, calories: meal.calories, protein: meal.protein, carbs: meal.carbs });
  };

  const handlePrefillConsumed = () => {
    setPrefillData(null);
  };


  const handleEditClick = (meal: Meal) => {
    setEditingMeal(meal);
    setEditForm({
      food: meal.food,
      calories: meal.calories.toString(),
      protein: meal.protein != null ? meal.protein.toString() : '',
      carbs: meal.carbs != null ? meal.carbs.toString() : '',
      time: meal.time,
      date: meal.date,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMeal) return;

    await updateMeal(editingMeal.id, {
      food: editForm.food,
      calories: parseInt(editForm.calories) || 0,
      protein: editForm.protein === '' ? null : parseFloat(editForm.protein.replace(',', '.')),
      carbs: editForm.carbs === '' ? null : parseFloat(editForm.carbs.replace(',', '.')),
      time: editForm.time,
      date: editForm.date,
    });

    setEditingMeal(null);
  };

  // Calculate stats with dynamic gym/rest day target
  const todayCalories = getTodayCalories();
  const todayStr = new Date().toISOString().split('T')[0];
  const workedOutToday = gymSessions.some((s) => s.date === todayStr);
  const calorieRange = useMemo(() => {
    const extras = extraActivities
      .filter((a) => a.date === todayStr)
      .reduce((sum, a) => sum + (a.calories || 0), 0);
    return resolveCalorieRange(personalData, settings.daily_calorie_goal, workedOutToday, extras);
  }, [workedOutToday, todayStr, personalData, settings.daily_calorie_goal, extraActivities]);
  const caloriesRemaining = Math.max(0, calorieRange.max - todayCalories);

  const currentWeight = weightEntries[0]?.weight ?? null;
  const proteinR = macroRange(personalData.protein_multiplier, personalData.protein_multiplier_max, currentWeight);
  const carbR = macroRange(personalData.carb_multiplier, personalData.carb_multiplier_max, currentWeight);

  const todayMeals = meals.filter((m) => m.date === todayStr).length;

  const weeklyCalories = useMemo(() => {
    const start = new Date(`${todayStr}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 6);
    const since = start.toISOString().slice(0, 10);
    return meals.filter((m) => m.date >= since && m.date <= todayStr).reduce((sum, m) => sum + m.calories, 0);
  }, [meals, todayStr]);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Utensils className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Meal Tracking</h1>
          <p className="text-muted-foreground mt-1">Log your meals and track your calories</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <MealForm onSubmit={addMeal} prefillData={prefillData} onPrefillConsumed={handlePrefillConsumed} />
        <MealsTodayCard
          calories={todayCalories}
          protein={getTodayProtein()}
          carbs={getTodayCarbs()}
          calorieRange={calorieRange}
          proteinRange={proteinR}
          carbRange={carbR}
          mealsToday={todayMeals}
          weekCalories={weeklyCalories}
          dayType={calorieRange.auto ? (workedOutToday ? 'Gym day' : 'Rest day') : null}
        />
      </div>

      <MealList meals={meals} onDelete={deleteMeal} onEdit={handleEditClick} onCopy={handleCopyMeal} caloriesRemainingToday={caloriesRemaining} />

      {/* Edit Modal */}
      <Dialog open={!!editingMeal} onOpenChange={(open) => !open && setEditingMeal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Meal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-food">Food</Label>
              <Input
                id="edit-food"
                value={editForm.food}
                onChange={(e) => setEditForm({ ...editForm, food: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-calories">Calories</Label>
                <Input
                  id="edit-calories"
                  type="number"
                  value={editForm.calories}
                  onChange={(e) => setEditForm({ ...editForm, calories: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-protein">Protein (g)</Label>
                <Input
                  id="edit-protein"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g., 32"
                  value={editForm.protein}
                  onChange={(e) => setEditForm({ ...editForm, protein: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-carbs">Carbs (g)</Label>
                <Input
                  id="edit-carbs"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g., 120"
                  value={editForm.carbs}
                  onChange={(e) => setEditForm({ ...editForm, carbs: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-time">Time</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editForm.time}
                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
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
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingMeal(null)}>
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

export default Meals;
