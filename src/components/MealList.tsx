import { useState, useMemo } from 'react';
import { Meal } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Clock, Calendar, Pencil, Search, X, Copy } from 'lucide-react';
import { SortControl } from '@/components/SortControl';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { MealNutrientFilter } from '@/components/MealNutrientFilter';
import { emptyNutrientFilter, matchesNutrientFilter } from '@/lib/mealNutrientFilter';

interface MealListProps {
  meals: Meal[];
  onDelete: (id: string) => void;
  onEdit: (meal: Meal) => void;
  onCopy?: (meal: Meal) => void;
  caloriesRemainingToday?: number;
}

export const MealList = ({ meals, onDelete, onEdit, onCopy, caloriesRemainingToday }: MealListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [calorieFilter, setCalorieFilter] = useState(emptyNutrientFilter);
  const [proteinFilter, setProteinFilter] = useState(emptyNutrientFilter);
  const [carbFilter, setCarbFilter] = useState(emptyNutrientFilter);
  const [excludeBeforeNoon, setExcludeBeforeNoon] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  const sortedMeals = useMemo(() => {
    let sorted = [...meals];
    
    if (sortOrder) {
      sorted.sort((a, b) => sortOrder === 'asc' ? a.calories - b.calories : b.calories - a.calories);
    } else {
      sorted.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.time.localeCompare(a.time);
      });
    }
    
    return sorted;
  }, [meals, sortOrder]);

  const filteredMeals = sortedMeals.filter((meal) => {
    if (searchTerm && !meal.food.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (dateFilter && meal.date !== dateFilter) {
      return false;
    }
    if (!matchesNutrientFilter(meal.calories, calorieFilter)) return false;
    if (!matchesNutrientFilter(meal.protein, proteinFilter)) return false;
    if (!matchesNutrientFilter(meal.carbs, carbFilter)) return false;
    if (excludeBeforeNoon && meal.time < '12:00') return false;
    return true;
  });

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    hasNextPage,
    hasPrevPage,
  } = usePagination(filteredMeals, { pageSize: 20 });

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setCalorieFilter(emptyNutrientFilter());
    setProteinFilter(emptyNutrientFilter());
    setCarbFilter(emptyNutrientFilter());
    setExcludeBeforeNoon(false);
  };

  const hasActiveFilters = searchTerm || dateFilter || excludeBeforeNoon ||
    [calorieFilter, proteinFilter, carbFilter].some(f => f.min !== '' || (f.mode === 'range' && f.max !== ''));

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Recent Meals</CardTitle>
          <div className="flex items-center gap-2">
            <SortControl label="Calories" sortOrder={sortOrder} onSortChange={setSortOrder} />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                <X className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            )}
          </div>
        </div>
        
        <div className="space-y-3 mt-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by food name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="sm:w-44"
              aria-label="Filter by date"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MealNutrientFilter label="Calories" unit="cal" value={calorieFilter} onChange={setCalorieFilter} />
            <MealNutrientFilter label="Protein" unit="g" value={proteinFilter} onChange={setProteinFilter} />
            <MealNutrientFilter label="Carbs" unit="g" value={carbFilter} onChange={setCarbFilter} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {caloriesRemainingToday !== undefined && (() => {
              const limit = String(Math.max(0, Math.floor(caloriesRemainingToday)));
              const active = calorieFilter.mode === 'range' && calorieFilter.min === '0' && calorieFilter.max === limit;
              return (
                <Button
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setCalorieFilter(active ? emptyNutrientFilter() : { mode: 'range', min: '0', max: limit });
                  }}
                  className="h-8 text-xs"
                >
                  Fits today's budget (≤ {limit} cal)
                </Button>
              );
            })()}
            <Button
              variant={excludeBeforeNoon ? 'default' : 'outline'}
              size="sm"
              onClick={() => setExcludeBeforeNoon((v) => !v)}
              className="h-8 text-xs"
            >
              Exclude meals before noon
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredMeals.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {meals.length === 0 ? 'No meals logged yet' : 'No meals match your filters'}
          </p>
        ) : (
          <div className="space-y-2">
            {paginatedItems.map((meal) => (
              <MealItem key={meal.id} meal={meal} onDelete={onDelete} onEdit={onEdit} onCopy={onCopy} showDate />
            ))}
          </div>
        )}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={goToPage}
          hasNextPage={hasNextPage}
          hasPrevPage={hasPrevPage}
        />
      </CardContent>
    </Card>
  );
};

const MealItem = ({
  meal,
  onDelete,
  onEdit,
  onCopy,
  showDate,
}: {
  meal: Meal;
  onDelete: (id: string) => void;
  onEdit: (meal: Meal) => void;
  onCopy?: (meal: Meal) => void;
  showDate?: boolean;
}) => (
  <div className="p-3 rounded-lg bg-card border">
    <p className="font-medium break-words whitespace-pre-wrap">{meal.food}</p>
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1">
      <span className="font-semibold text-primary text-sm">{meal.calories} cal</span>
      {meal.protein != null && (
        <span className="text-xs text-muted-foreground">{meal.protein} g protein</span>
      )}
      {meal.carbs != null && (
        <span className="text-xs text-muted-foreground">{meal.carbs} g carbs</span>
      )}
    </div>
    <div className="flex items-center justify-between gap-3 mt-1">
      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap min-w-0">
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
      <div className="flex items-center gap-1 shrink-0 -mr-1 -mb-1">
        {onCopy && (
          <Button variant="ghost" size="icon" onClick={() => onCopy(meal)} className="h-8 w-8" title="Copy to form">
            <Copy className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => onEdit(meal)} className="h-8 w-8">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(meal.id)} className="h-8 w-8">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  </div>
);
