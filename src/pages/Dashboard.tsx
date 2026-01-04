import { StatsCards } from '@/components/StatsCards';
import { CalorieChart } from '@/components/CalorieChart';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Meal } from '@/types';
import { Clock, Flame } from 'lucide-react';

const Dashboard = () => {
  const { meals, getTodayCalories, getWeeklyData } = useMeals();
  const { getThisWeekSessions } = useGymSessions();

  const todayMeals = meals.filter(
    (meal) => meal.date === new Date().toISOString().split('T')[0]
  );

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Track your nutrition and fitness progress</p>
      </div>

      <StatsCards
        todayCalories={getTodayCalories()}
        weeklyWorkouts={getThisWeekSessions().length}
        totalMeals={meals.length}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <CalorieChart data={getWeeklyData()} />
        
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flame className="h-5 w-5 text-primary" />
              Today's Meals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayMeals.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No meals logged today. Start tracking!
              </p>
            ) : (
              <div className="space-y-3">
                {todayMeals.map((meal: Meal) => (
                  <div
                    key={meal.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background border"
                  >
                    <div>
                      <p className="font-medium">{meal.food}</p>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {meal.time}
                      </span>
                    </div>
                    <span className="font-semibold text-primary">{meal.calories} cal</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
