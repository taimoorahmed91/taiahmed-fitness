import { useState, useMemo } from 'react';
import { StatsCards } from '@/components/StatsCards';
import { CalorieChart } from '@/components/CalorieChart';
import { WorkoutDurationChart } from '@/components/WorkoutDurationChart';
import { MealTimeChart } from '@/components/MealTimeChart';
import { CalorieGoalProgress } from '@/components/CalorieGoalProgress';
import { SearchFilter } from '@/components/SearchFilter';
import { useMeals } from '@/hooks/useMeals';
import { useGymSessions } from '@/hooks/useGymSessions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Meal } from '@/types';
import { Clock, Flame } from 'lucide-react';

const DAILY_CALORIE_GOAL = 2000;

const Dashboard = () => {
  const { meals, getTodayCalories, getWeeklyData, getMealsByTimeOfDay } = useMeals();
  const { getThisWeekSessions, getWeeklyWorkoutData } = useGymSessions();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('today');

  const filteredMeals = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return meals.filter((meal) => {
      const matchesSearch = meal.food.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesTime = true;
      if (timeFilter === 'today') {
        matchesTime = meal.date === today;
      } else if (timeFilter === 'week') {
        matchesTime = new Date(meal.date) >= weekStart;
      } else if (timeFilter === 'month') {
        matchesTime = new Date(meal.date) >= monthStart;
      }
      
      return matchesSearch && matchesTime;
    });
  }, [meals, searchQuery, timeFilter]);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Track your nutrition and fitness progress</p>
      </div>

      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
      />

      <StatsCards
        todayCalories={getTodayCalories()}
        weeklyWorkouts={getThisWeekSessions().length}
        totalMeals={meals.length}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <CalorieGoalProgress current={getTodayCalories()} goal={DAILY_CALORIE_GOAL} />
        <MealTimeChart data={getMealsByTimeOfDay()} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <CalorieChart data={getWeeklyData()} />
        <WorkoutDurationChart data={getWeeklyWorkoutData()} />
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="h-5 w-5 text-primary" />
            Meals ({filteredMeals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMeals.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchQuery ? 'No meals match your search.' : 'No meals logged. Start tracking!'}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredMeals.map((meal: Meal) => (
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
  );
};

export default Dashboard;
