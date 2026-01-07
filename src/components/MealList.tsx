import { useState } from 'react';
import { Meal } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Clock, Calendar, Pencil, Search, X } from 'lucide-react';

interface MealListProps {
  meals: Meal[];
  onDelete: (id: string) => void;
  onEdit: (meal: Meal) => void;
}

export const MealList = ({ meals, onDelete, onEdit }: MealListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'date' | 'time' | 'calories'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [calorieFilter, setCalorieFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');

  const sortedMeals = [...meals].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.time.localeCompare(a.time);
  });

  const filteredMeals = sortedMeals.filter((meal) => {
    // Text search
    if (searchTerm && !meal.food.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Date filter
    if (dateFilter && meal.date !== dateFilter) {
      return false;
    }

    // Calorie filter
    if (calorieFilter !== 'all') {
      if (calorieFilter === 'low' && meal.calories > 300) return false;
      if (calorieFilter === 'medium' && (meal.calories <= 300 || meal.calories > 600)) return false;
      if (calorieFilter === 'high' && meal.calories <= 600) return false;
    }

    return true;
  });

  const today = new Date().toISOString().split('T')[0];
  const todayMeals = filteredMeals.filter((m) => m.date === today);
  const previousMeals = filteredMeals.filter((m) => m.date !== today);

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setCalorieFilter('all');
    setFilterType('all');
  };

  const hasActiveFilters = searchTerm || dateFilter || calorieFilter !== 'all';

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Recent Meals</CardTitle>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
        
        {/* Search and Filter Controls */}
        <div className="space-y-3 mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by food name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex-1"
              placeholder="Filter by date"
            />
            <Select value={calorieFilter} onValueChange={(v: 'all' | 'low' | 'medium' | 'high') => setCalorieFilter(v)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Calories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All calories</SelectItem>
                <SelectItem value="low">Low (&lt;300)</SelectItem>
                <SelectItem value="medium">Medium (300-600)</SelectItem>
                <SelectItem value="high">High (&gt;600)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[350px] pr-4">
          {filteredMeals.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {meals.length === 0 ? 'No meals logged yet' : 'No meals match your filters'}
            </p>
          ) : (
            <div className="space-y-4">
              {todayMeals.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Today</h4>
                  <div className="space-y-2">
                    {todayMeals.map((meal) => (
                      <MealItem key={meal.id} meal={meal} onDelete={onDelete} onEdit={onEdit} />
                    ))}
                  </div>
                </div>
              )}
              {previousMeals.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Previous</h4>
                  <div className="space-y-2">
                    {previousMeals.slice(0, 20).map((meal) => (
                      <MealItem key={meal.id} meal={meal} onDelete={onDelete} onEdit={onEdit} showDate />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const MealItem = ({
  meal,
  onDelete,
  onEdit,
  showDate,
}: {
  meal: Meal;
  onDelete: (id: string) => void;
  onEdit: (meal: Meal) => void;
  showDate?: boolean;
}) => (
  <div className="flex items-start justify-between p-3 rounded-lg bg-card border gap-3">
    <div className="flex-1 min-w-0">
      <p className="font-medium break-words whitespace-pre-wrap">{meal.food}</p>
      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {meal.time}
        </span>
        {showDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(meal.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <span className="font-semibold text-primary text-sm">{meal.calories} cal</span>
      <Button variant="ghost" size="icon" onClick={() => onEdit(meal)} className="h-8 w-8">
        <Pencil className="h-4 w-4 text-muted-foreground" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(meal.id)} className="h-8 w-8">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  </div>
);
