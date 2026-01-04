import { MealForm } from '@/components/MealForm';
import { MealList } from '@/components/MealList';
import { useMeals } from '@/hooks/useMeals';

const Meals = () => {
  const { meals, addMeal, deleteMeal } = useMeals();

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Meal Tracking</h1>
        <p className="text-muted-foreground mt-1">Log your meals and track your calories</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <MealForm onSubmit={addMeal} />
        <MealList meals={meals} onDelete={deleteMeal} />
      </div>
    </div>
  );
};

export default Meals;
