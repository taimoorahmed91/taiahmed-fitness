import { useState, useMemo, useRef } from 'react';
import { MealForm, MealField, MealDateTimeNote, MealRemainingSummary } from '@/components/MealForm';
import { PageContainer, PageHeader, PageSection } from '@/components/layout/Page';
import { MealList } from '@/components/MealList';
import { useMeals } from '@/hooks/useMeals';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useGymSessions } from '@/hooks/useGymSessions';
import { usePersonalData } from '@/hooks/usePersonalData';
import { useExtraActivities } from '@/hooks/useExtraActivities';
import { useWeight } from '@/hooks/useWeight';
import { useSharedTableState } from '@/lib/sharedTable';
import { CardSkeleton } from '@/components/feedback/CardSkeleton';
import { DataLoadError } from '@/components/feedback/DataLoadError';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';
import { LoadingAnnouncement } from '@/components/feedback/LoadingAnnouncement';
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
import { AlertCircle, Loader2, Utensils } from 'lucide-react';
import { getMealDate } from '@/lib/mealDateTime';
import {
  MEAL_FOOD_MAX_LENGTH,
  sanitizeNumericInput,
  validateMealForm,
  type MealFormErrors,
  type MealFormField,
  type MealFormValues,
} from '@/lib/mealForm';

const Meals = () => {
  const { meals, lastFetchedAt, refetch: refetchMeals, addMeal, deleteMeal, updateMeal, getTodayCalories, getTodayProtein, getTodayCarbs } = useMeals();
  const { settings, loading: settingsLoading } = useUserSettings();
  const { sessions: gymSessions, loading: gymLoading } = useGymSessions();
  const { data: personalData } = usePersonalData();
  const { activities: extraActivities, loading: extrasLoading } = useExtraActivities();
  const { entries: weightEntries, loading: weightLoading } = useWeight();
  // Where the meals query really is. An empty list only means "no meals" once it has loaded.
  const mealsState = useSharedTableState('meals');
  const mealsReady = mealsState.phase === 'ready';
  const mealsFailed = mealsState.phase === 'error';
  // The summary also needs the target inputs (gym days, extras, weight, settings), so wait for them too.
  const summaryPending = !mealsFailed && (!mealsReady || settingsLoading || gymLoading || extrasLoading || weightLoading);
  const listPending = !mealsFailed && !mealsReady;
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editForm, setEditForm] = useState<MealFormValues>({ food: '', calories: '', protein: '', carbs: '', time: '', date: '' });
  const [editErrors, setEditErrors] = useState<MealFormErrors>({});
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const savingEditRef = useRef(false);
  const editFieldRefs = useRef<Partial<Record<MealFormField, HTMLInputElement | null>>>({});
  const bindEditRef = (field: MealFormField) => (el: HTMLInputElement | null) => { editFieldRefs.current[field] = el; };

  const setEditField = (field: MealFormField, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    setEditErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setEditSubmitError(null);
  };
  const setEditNumericField = (field: 'calories' | 'protein' | 'carbs', raw: string) => {
    const cleaned = sanitizeNumericInput(raw);
    if (cleaned !== null) setEditField(field, cleaned);
  };
  const closeEdit = () => {
    if (savingEditRef.current) return;
    setEditingMeal(null);
    setEditErrors({});
    setEditSubmitError(null);
  };
  const [prefillData, setPrefillData] = useState<{ food: string; calories: number; protein?: number | null; carbs?: number | null } | null>(null);

  const handleCopyMeal = (meal: Meal) => {
    setPrefillData({ food: meal.food, calories: meal.calories, protein: meal.protein, carbs: meal.carbs });
  };

  const handlePrefillConsumed = () => {
    setPrefillData(null);
  };


  const handleEditClick = (meal: Meal) => {
    setEditingMeal(meal);
    setEditErrors({});
    setEditSubmitError(null);
    setEditForm({
      food: meal.food,
      calories: meal.calories.toString(),
      protein: meal.protein != null ? meal.protein.toString() : '',
      carbs: meal.carbs != null ? meal.carbs.toString() : '',
      time: meal.time,
      date: meal.date,
    });
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editingMeal || savingEditRef.current) return;

    const result = validateMealForm(editForm);
    if (result.ok === false) {
      setEditErrors(result.errors);
      setEditSubmitError(null);
      editFieldRefs.current[result.firstInvalid]?.focus();
      return;
    }

    setEditErrors({});
    setEditSubmitError(null);
    savingEditRef.current = true;
    setSavingEdit(true);
    let saved = false;
    try {
      // Only an explicit `true` (database confirmed the row) counts as saved.
      saved = (await updateMeal(editingMeal.id, result.value)) === true;
    } catch (error) {
      console.error('Error saving meal edit:', error);
    } finally {
      savingEditRef.current = false;
      setSavingEdit(false);
    }

    if (saved) {
      setEditingMeal(null);
    } else {
      // Keep the dialog open with everything the user typed.
      setEditSubmitError('Your changes were not saved. Nothing was lost, so you can try again.');
    }
  };

  // Calculate stats with dynamic gym/rest day target
  const todayCalories = getTodayCalories();
  const todayStr = getMealDate();
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
    const since = getMealDate(start);
    return meals.filter((m) => m.date >= since && m.date <= todayStr).reduce((sum, m) => sum + m.calories, 0);
  }, [meals, todayStr]);

  return (
    <PageContainer>
      <PageHeader icon={Utensils} title="Meal Tracking" description="Log your meals and track your calories" />

      <LoadingAnnouncement loading={summaryPending || listPending} label="Loading meals" />

      {/* A refresh failed but the rows below are the last good ones: say so and keep them on screen. */}
      {mealsReady && mealsState.refreshFailed && (
        <StaleDataNotice subject="your meals" fetchedAt={lastFetchedAt} onRetry={refetchMeals} />
      )}

      <PageSection title="Log a meal and today's totals" hideTitle>
        <div aria-busy={summaryPending} className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Phones only: a compact "left today" line above the form. From lg up the full targets card sits beside the form, so this is hidden there to avoid two summaries.
              Only once the totals are known: before that it would claim nothing was eaten. */}
          {!summaryPending && !mealsFailed && (
            <MealRemainingSummary eaten={todayCalories} max={calorieRange.max} className="lg:hidden" />
          )}
          <MealForm onSubmit={addMeal} meals={meals} prefillData={prefillData} onPrefillConsumed={handlePrefillConsumed} />
          {mealsFailed ? (
            <DataLoadError
              title="We couldn't load your meals"
              description="Your meals are safe. Today's totals will show once they load."
              onRetry={refetchMeals}
              minHeightClassName="min-h-[22rem]"
            />
          ) : summaryPending ? (
            <CardSkeleton bodyClassName="h-[22rem]" />
          ) : (
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
          )}
        </div>
      </PageSection>

      <PageSection title="Meal history" hideTitle>
        {mealsFailed ? (
          <Card className="shadow-md">
            <CardContent className="flex min-h-[8rem] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Your meal history will show here once your meals load.
            </CardContent>
          </Card>
        ) : listPending ? (
          <CardSkeleton bodyClassName="h-[24rem]" />
        ) : (
          <MealList meals={meals} onDelete={deleteMeal} onEdit={handleEditClick} onCopy={handleCopyMeal} caloriesRemainingToday={caloriesRemaining} />
        )}
      </PageSection>

      {/* Edit Modal */}
      <Dialog open={!!editingMeal} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Meal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} noValidate className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              <span aria-hidden="true" className="text-destructive">*</span> Required. Protein and carbs are optional.
            </p>
            <MealField
              id="edit-food"
              label="Food"
              required
              value={editForm.food}
              onChange={(e) => setEditField('food', e.target.value)}
              maxLength={MEAL_FOOD_MAX_LENGTH}
              error={editErrors.food}
              inputRef={bindEditRef('food')}
              autoComplete="off"
            />
            <div className="grid grid-cols-2 gap-4">
              <MealField
                id="edit-calories"
                label="Calories"
                required
                type="text"
                inputMode="numeric"
                value={editForm.calories}
                onChange={(e) => setEditNumericField('calories', e.target.value)}
                error={editErrors.calories}
                inputRef={bindEditRef('calories')}
                autoComplete="off"
              />
              <MealField
                id="edit-protein"
                label="Protein (g)"
                optional
                type="text"
                inputMode="decimal"
                placeholder="e.g., 32"
                value={editForm.protein}
                onChange={(e) => setEditNumericField('protein', e.target.value)}
                error={editErrors.protein}
                inputRef={bindEditRef('protein')}
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <MealField
                id="edit-carbs"
                label="Carbs (g)"
                optional
                type="text"
                inputMode="decimal"
                placeholder="e.g., 120"
                value={editForm.carbs}
                onChange={(e) => setEditNumericField('carbs', e.target.value)}
                error={editErrors.carbs}
                inputRef={bindEditRef('carbs')}
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <MealField
                id="edit-time"
                label="Time"
                type="time"
                value={editForm.time}
                onChange={(e) => setEditField('time', e.target.value)}
                error={editErrors.time}
                inputRef={bindEditRef('time')}
                describedBy="edit-meal-datetime-note"
              />
              <MealField
                id="edit-date"
                label="Date"
                type="date"
                value={editForm.date}
                onChange={(e) => setEditField('date', e.target.value)}
                error={editErrors.date}
                inputRef={bindEditRef('date')}
                describedBy="edit-meal-datetime-note"
              />
            </div>
            <MealDateTimeNote id="edit-meal-datetime-note" />
            {editSubmitError && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{editSubmitError}</span>
              </p>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={closeEdit} disabled={savingEdit}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit} aria-busy={savingEdit}>
                {savingEdit ? (<><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Saving…</>) : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default Meals;
