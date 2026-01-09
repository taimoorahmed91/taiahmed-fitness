import { useState } from 'react';
import { MealForm } from '@/components/MealForm';
import { MealList } from '@/components/MealList';
import { DataFilter } from '@/components/DataFilter';
import { useMeals } from '@/hooks/useMeals';
import { useDataFilter } from '@/hooks/useDataFilter';
import { Meal } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Meals = () => {
  const { meals, addMeal, deleteMeal, updateMeal } = useMeals();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editForm, setEditForm] = useState({ food: '', calories: '', time: '', date: '' });

  const {
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
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

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Meal Tracking</h1>
        <p className="text-muted-foreground mt-1">Log your meals and track your calories</p>
      </div>

      <DataFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        searchPlaceholder="Search meals..."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <MealForm onSubmit={addMeal} />
        <MealList meals={filteredMeals} onDelete={deleteMeal} onEdit={handleEditClick} />
      </div>

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
