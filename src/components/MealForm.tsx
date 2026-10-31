import { useState, useEffect, useMemo, useRef, type ComponentProps, type Ref } from 'react';
import type { Meal } from '@/types';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Utensils, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useMealFavorites } from '@/hooks/useMealFavorites';
import { toast } from 'sonner';
import { getMealDateTimeBasis } from '@/lib/mealDateTime';
import {
  MEAL_FOOD_MAX_LENGTH,
  sanitizeNumericInput,
  validateMealForm,
  type MealFormErrors,
  type MealFormField,
  type MealFormValues,
  type MealPayload,
} from '@/lib/mealForm';

interface MealFormProps {
  /** Must resolve true only after the meal is confirmed saved. Anything else keeps the form as typed. */
  onSubmit: (meal: MealPayload) => Promise<boolean>;
  prefillData?: { food: string; calories: number; protein?: number | null; carbs?: number | null } | null;
  onPrefillConsumed?: () => void;
  meals?: Meal[];
}

interface MealFieldProps extends Omit<ComponentProps<'input'>, 'id' | 'ref'> {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** id of a note elsewhere on the page that explains this field (read after the label). */
  describedBy?: string;
}

/**
 * Label + input + inline error, wired together for screen readers:
 * the error is linked with aria-describedby and the input gets aria-invalid.
 * Shared by the add form and the edit dialog so both behave the same.
 */
export const MealField = ({ id, label, error, required, optional, inputRef, describedBy, className, ...inputProps }: MealFieldProps) => {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" className="text-destructive"> *</span>}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      <Input
        id={id}
        ref={inputRef}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, describedBy ?? null].filter(Boolean).join(' ') || undefined}
        className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

/**
 * Plain-words version of the convention documented in lib/mealDateTime.ts.
 * Describes what the app does today; the stored date and time are unchanged.
 */
export const MEAL_DATE_TIME_NOTE =
  'Time is your local time. The date follows the UTC day (the daily reset is 00:00 UTC), so a meal logged shortly after your local midnight can count toward the previous day.';

/** The note shown right under the time and date fields (add form and edit dialog). */
export const MealDateTimeNote = ({ id }: { id: string }) => (
  <p id={id} className="text-xs text-muted-foreground">{MEAL_DATE_TIME_NOTE}</p>
);

const formatCal = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * Small "calories left today" strip for phones, shown above the form so the number
 * you are logging against is visible without scrolling past the whole form.
 * Desktop already shows the full targets card next to the form, so the page hides this at `lg`.
 */
export const MealRemainingSummary = ({ eaten, max, className }: { eaten: number; max: number; className?: string }) => {
  const over = eaten > max;
  return (
    <div
      role="group"
      aria-label="Calories left today"
      data-meal-remaining-summary
      className={cn('flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3', className)}
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{over ? 'Over today\'s max by' : 'Left today'}</p>
        <p className={cn('text-xl font-bold leading-tight', over && 'text-chart-max')}>
          {formatCal(over ? eaten - max : max - eaten)} <span className="text-sm font-medium text-muted-foreground">cal</span>
        </p>
      </div>
      <p className="text-right text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{formatCal(eaten)}</span> of {formatCal(max)} cal eaten
      </p>
    </div>
  );
};

const blankValues = (): MealFormValues => ({ food: '', calories: '', protein: '', carbs: '', ...getMealDateTimeBasis() });

export const MealForm = ({ onSubmit, prefillData, onPrefillConsumed, meals = [] }: MealFormProps) => {
  const { favorites, toggleFavorite } = useMealFavorites();
  // Latest logged version of each meal; only meals the user marked for quick add.
  const quickMeals = useMemo(() => {
    const byName = new Map<string, { meal: Meal; count: number }>();
    [...meals].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).forEach((m) => {
      const key = m.food.trim().toLowerCase();
      const hit = byName.get(key);
      if (hit) hit.count += 1; else byName.set(key, { meal: m, count: 1 });
    });
    const list = Array.from(byName.entries()).map(([key, v]) => ({ key, ...v, fav: favorites.includes(key) }));
    const favs = list.filter((x) => x.fav);

    return favs;
  }, [meals, favorites]);

  const [values, setValues] = useState<MealFormValues>(blankValues);
  const [errors, setErrors] = useState<MealFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const quickAddHeadingRef = useRef<HTMLParagraphElement>(null);
  // If the user picked a date on purpose, keep it after logging; otherwise follow "today".
  const dateEditedRef = useRef(false);
  const fieldRefs = useRef<Partial<Record<MealFormField, HTMLInputElement | null>>>({});
  const bindRef = (field: MealFormField) => (el: HTMLInputElement | null) => { fieldRefs.current[field] = el; };

  const setField = (field: MealFormField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field === 'date') dateEditedRef.current = true;
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setSubmitError(null);
  };

  const setNumericField = (field: 'calories' | 'protein' | 'carbs', raw: string) => {
    const cleaned = sanitizeNumericInput(raw);
    if (cleaned !== null) setField(field, cleaned);
  };

  const fillFrom = (m: { food: string; calories: number; protein?: number | null; carbs?: number | null }) => {
    dateEditedRef.current = false;
    setValues({
      food: m.food,
      calories: String(m.calories),
      protein: m.protein != null ? String(m.protein) : '',
      carbs: m.carbs != null ? String(m.carbs) : '',
      ...getMealDateTimeBasis(),
    });
    setErrors({});
    setSubmitError(null);
  };

  const quickFill = (m: Meal) => fillFrom(m);

  // Handle prefill when a meal is copied
  useEffect(() => {
    if (prefillData) {
      fillFrom(prefillData);
      onPrefillConsumed?.();
      toast.info('Meal copied to form');
    }
  }, [prefillData, onPrefillConsumed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const result = validateMealForm(values);
    if (result.ok === false) {
      setErrors(result.errors);
      setSubmitError(null);
      fieldRefs.current[result.firstInvalid]?.focus();
      return;
    }

    setErrors({});
    setSubmitError(null);
    submittingRef.current = true;
    setSubmitting(true);

    let saved = false;
    try {
      saved = (await onSubmit(result.value)) === true;
    } catch (error) {
      console.error('Error logging meal:', error);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }

    if (!saved) {
      // The hook already showed an error toast. Keep everything the user typed.
      setSubmitError('Your meal was not saved. Nothing was cleared, so you can try again.');
      return;
    }

    // Confirmed saved: clear the entry and put time (and date, unless chosen on purpose) back to "now".
    const basis = getMealDateTimeBasis();
    setValues((prev) => ({
      food: '',
      calories: '',
      protein: '',
      carbs: '',
      time: basis.time,
      date: dateEditedRef.current ? prev.date : basis.date,
    }));
    toast.success('Meal logged successfully!');
    fieldRefs.current.food?.focus();
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Utensils className="h-5 w-5 text-primary" />
          Log a Meal
        </CardTitle>
      </CardHeader>
      <CardContent>
        {quickMeals.length > 0 && (
          <div role="group" aria-labelledby="meal-quick-add-heading" className="mb-4 space-y-2">
            <p
              id="meal-quick-add-heading"
              ref={quickAddHeadingRef}
              tabIndex={-1}
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground focus-visible:outline-none"
            >
              Quick add
            </p>
            <p id="meal-quick-add-help" className="text-xs text-muted-foreground">
              Tap a meal to fill the form. The lightning button (filled = pinned) removes it from this list.
            </p>
            <ul aria-describedby="meal-quick-add-help" className="flex flex-wrap gap-2">
              {quickMeals.map(({ key, meal, fav }) => (
                <li
                  key={key}
                  className={cn(
                    'inline-flex max-w-full items-stretch overflow-hidden rounded-full border',
                    fav ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted/30',
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => quickFill(meal)}
                    title={`${meal.food} · ${meal.calories} cal`}
                    className="h-11 min-w-0 max-w-[14rem] justify-start rounded-none rounded-l-full pl-4 pr-2 text-left"
                  >
                    <span className="min-w-0 truncate">{meal.food}</span>
                    <span className="shrink-0 text-muted-foreground">
                      · {meal.calories}<span className="sr-only"> calories. Fill the form with this meal.</span>
                    </span>
                  </Button>
                  <IconButton
                    label={`Pin ${meal.food} to quick add`}
                    aria-pressed={fav}
                    onClick={() => {
                      toggleFavorite(meal.food);
                      // The chip disappears when unpinned, so keep keyboard focus inside this section.
                      quickAddHeadingRef.current?.focus();
                    }}
                    className={cn(
                      'h-11 w-11 rounded-none rounded-r-full border-l',
                      fav ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground',
                    )}
                  >
                    <Zap aria-hidden="true" className={cn('h-4 w-4', fav && 'fill-primary')} />
                  </IconButton>
                </li>
              ))}
            </ul>
          </div>
        )}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <span aria-hidden="true" className="text-destructive">*</span> Required. Protein and carbs are optional.
          </p>
          <MealField
            id="food"
            label="What did you eat?"
            required
            placeholder="e.g., Grilled chicken salad"
            value={values.food}
            onChange={(e) => setField('food', e.target.value)}
            maxLength={MEAL_FOOD_MAX_LENGTH}
            error={errors.food}
            inputRef={bindRef('food')}
            autoComplete="off"
          />
          <div className="grid grid-cols-2 gap-4">
            <MealField
              id="calories"
              label="Calories"
              required
              type="text"
              inputMode="numeric"
              placeholder="e.g., 450"
              value={values.calories}
              onChange={(e) => setNumericField('calories', e.target.value)}
              error={errors.calories}
              inputRef={bindRef('calories')}
              autoComplete="off"
            />
            <MealField
              id="protein"
              label="Protein (g)"
              optional
              type="text"
              inputMode="decimal"
              placeholder="e.g., 32"
              value={values.protein}
              onChange={(e) => setNumericField('protein', e.target.value)}
              error={errors.protein}
              inputRef={bindRef('protein')}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <MealField
              id="carbs"
              label="Carbs (g)"
              optional
              type="text"
              inputMode="decimal"
              placeholder="e.g., 120"
              value={values.carbs}
              onChange={(e) => setNumericField('carbs', e.target.value)}
              error={errors.carbs}
              inputRef={bindRef('carbs')}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <MealField
              id="time"
              label="Time Eaten"
              type="time"
              value={values.time}
              onChange={(e) => setField('time', e.target.value)}
              error={errors.time}
              inputRef={bindRef('time')}
              describedBy="meal-datetime-note"
            />
            <MealField
              id="date"
              label="Date"
              type="date"
              value={values.date}
              onChange={(e) => setField('date', e.target.value)}
              error={errors.date}
              inputRef={bindRef('date')}
              describedBy="meal-datetime-note"
            />
          </div>
          <MealDateTimeNote id="meal-datetime-note" />
          {submitError && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </p>
          )}
          <Button type="submit" className="w-full [@media(pointer:coarse)]:min-h-11" loading={submitting} loadingText="Logging…">
            Log Meal
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
