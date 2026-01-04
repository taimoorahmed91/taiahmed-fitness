import { Meal } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Clock, Calendar } from 'lucide-react';

interface MealListProps {
  meals: Meal[];
  onDelete: (id: string) => void;
}

export const MealList = ({ meals, onDelete }: MealListProps) => {
  const sortedMeals = [...meals].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.time.localeCompare(a.time);
  });

  const today = new Date().toISOString().split('T')[0];
  const todayMeals = sortedMeals.filter((m) => m.date === today);
  const previousMeals = sortedMeals.filter((m) => m.date !== today);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Recent Meals</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {sortedMeals.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No meals logged yet</p>
          ) : (
            <div className="space-y-4">
              {todayMeals.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Today</h4>
                  <div className="space-y-2">
                    {todayMeals.map((meal) => (
                      <MealItem key={meal.id} meal={meal} onDelete={onDelete} />
                    ))}
                  </div>
                </div>
              )}
              {previousMeals.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Previous</h4>
                  <div className="space-y-2">
                    {previousMeals.slice(0, 10).map((meal) => (
                      <MealItem key={meal.id} meal={meal} onDelete={onDelete} showDate />
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
  showDate,
}: {
  meal: Meal;
  onDelete: (id: string) => void;
  showDate?: boolean;
}) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-card border">
    <div className="flex-1 min-w-0">
      <p className="font-medium truncate">{meal.food}</p>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
    <div className="flex items-center gap-3">
      <span className="font-semibold text-primary">{meal.calories} cal</span>
      <Button variant="ghost" size="icon" onClick={() => onDelete(meal.id)} className="h-8 w-8">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  </div>
);
