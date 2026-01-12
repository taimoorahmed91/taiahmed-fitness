import { Card, CardContent } from '@/components/ui/card';
import { Flame, Dumbbell, Utensils } from 'lucide-react';

interface StatsCardsProps {
  todayCalories: number;
  weeklyWorkouts: number;
  totalMeals: number;
  calorieGoal?: number;
}

export const StatsCards = ({
  todayCalories,
  weeklyWorkouts,
  totalMeals,
  calorieGoal = 2000,
}: StatsCardsProps) => {
  const progress = Math.min((todayCalories / calorieGoal) * 100, 100);

  const stats = [
    {
      label: "Today's Calories",
      value: todayCalories,
      icon: Flame,
      subtitle: `${calorieGoal - todayCalories > 0 ? calorieGoal - todayCalories : 0} remaining`,
      progress,
    },
    {
      label: 'Weekly Workouts',
      value: weeklyWorkouts,
      icon: Dumbbell,
      subtitle: 'This week',
    },
    {
      label: 'Total Meals Logged',
      value: totalMeals,
      icon: Utensils,
      subtitle: 'All time',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
            </div>
            {stat.progress !== undefined && (
              <div className="mt-3">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${stat.progress}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
