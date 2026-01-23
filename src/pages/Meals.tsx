import { useState, useMemo } from 'react';
import { MealForm } from '@/components/MealForm';
import { MealList } from '@/components/MealList';
import { DataFilter } from '@/components/DataFilter';
import { useMeals } from '@/hooks/useMeals';
import { useDataFilter } from '@/hooks/useDataFilter';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Meal } from '@/types';
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
  const { meals, addMeal, deleteMeal, updateMeal, getTodayCalories } = useMeals();
  const { settings } = useUserSettings();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editForm, setEditForm] = useState({ food: '', calories: '', time: '', date: '' });

  const {
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    dateRange,
    setDateRange,
    filteredData: filteredMeals,
  } = useDataFilter({
    data: meals,
    searchFields: ['food'] as (keyof Meal)[],
    dateField: 'date' as keyof Meal,
  });

  const handleEditClick = (meal: Meal) => {
    setEditingMeal(meal);
    setEditForm({
      food: meal.food,
      calories: meal.calories.toString(),
      time: meal.time,
      date: meal.date,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMeal) return;
    
    await updateMeal(editingMeal.id, {
      food: editForm.food,
      calories: parseInt(editForm.calories) || 0,
      time: editForm.time,
      date: editForm.date,
    });
    
    setEditingMeal(null);
  };

  // Calculate stats
  const todayCalories = getTodayCalories();
  const calorieGoal = settings.daily_calorie_goal;
  const caloriesRemaining = Math.max(0, calorieGoal - todayCalories);
  
  const todayMeals = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return meals.filter(m => m.date === today).length;
  }, [meals]);

  const weeklyCalories = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];
    return meals
      .filter(m => m.date >= weekStartStr)
      .reduce((sum, m) => sum + m.calories, 0);
  }, [meals]);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Utensils className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Meal Tracking</h1>
          <p className="text-muted-foreground mt-1">Log your meals and track your calories</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <MealForm onSubmit={addMeal} />
        
        {/* Stats Card */}
        <Card>
          <CardHeader>
            <CardTitle>Current Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Today's Calories</p>
              <p className="text-3xl font-bold">{todayCalories} cal</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining Today</p>
              <p className={`text-xl font-semibold ${caloriesRemaining === 0 ? 'text-destructive' : 'text-green-600'}`}>
                {caloriesRemaining} cal
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Today's Meals</p>
                <p className="text-xl font-semibold">{todayMeals}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Meals</p>
                <p className="text-xl font-semibold">{meals.length}</p>
              </div>
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">This Week's Calories</p>
              <p className="text-xl font-semibold">{weeklyCalories.toLocaleString()} cal</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and List */}
      <DataFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        searchPlaceholder="Search meals..."
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateRange
      />
      
      <MealList meals={filteredMeals} onDelete={deleteMeal} onEdit={handleEditClick} />

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
            <div className="space-y-2">
              <Label htmlFor="edit-calories">Calories</Label>
              <Input
                id="edit-calories"
                type="number"
                value={editForm.calories}
                onChange={(e) => setEditForm({ ...editForm, calories: e.target.value })}
              />
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
