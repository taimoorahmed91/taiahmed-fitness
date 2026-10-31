import { normalizeNutrientInput, validNutrientInput } from './mealNutrientFilter';

/**
 * Shared parsing and validation for the meal add form and the meal edit dialog.
 *
 * Database contract (fittrack_meals): food TEXT, calories INTEGER, protein/carbs NUMERIC
 * (nullable), time TEXT, date DATE. In the form only food and calories are things the
 * user must supply. Time and date are pre-filled, but are still checked if cleared
 * because the database will not accept an empty value.
 */

export const MEAL_FOOD_MAX_LENGTH = 500;
export const MEAL_CALORIES_MAX = 100000;

export type MealFormField = 'food' | 'calories' | 'protein' | 'carbs' | 'time' | 'date';

/** Visual order of the fields; the first invalid one in this order gets focus. */
export const MEAL_FORM_FIELD_ORDER: readonly MealFormField[] = ['food', 'calories', 'protein', 'carbs', 'time', 'date'];

export type MealFormValues = Record<MealFormField, string>;
export type MealFormErrors = Partial<Record<MealFormField, string>>;

export interface MealPayload {
  food: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  time: string;
  date: string;
}

export type MealFormResult =
  | { ok: true; value: MealPayload }
  | { ok: false; errors: MealFormErrors; firstInvalid: MealFormField };

/**
 * For typing into a numeric text box: turns commas into dots and returns the cleaned
 * text, or null when the new text is not a plain non-negative number so the caller can
 * ignore the keystroke.
 */
export const sanitizeNumericInput = (value: string): string | null => {
  const normalized = normalizeNutrientInput(value);
  return validNutrientInput(normalized) ? normalized : null;
};

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/;
const WHOLE = /^\d+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRealDate = (value: string): boolean => {
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

const parseOptionalMacro = (raw: string, label: string): { value: number | null; error?: string } => {
  const text = normalizeNutrientInput(raw.trim());
  if (text === '') return { value: null };
  if (!DECIMAL.test(text) || !Number.isFinite(Number(text))) {
    return { value: null, error: `${label} must be a number like 32 or 32.5, or leave it empty.` };
  }
  return { value: Number(text) };
};

export const validateMealForm = (values: MealFormValues): MealFormResult => {
  const errors: MealFormErrors = {};

  const food = values.food.trim();
  if (!food) errors.food = 'Enter what you ate.';
  else if (food.length > MEAL_FOOD_MAX_LENGTH) errors.food = `Keep it to ${MEAL_FOOD_MAX_LENGTH} characters or fewer.`;

  let calories = 0;
  const caloriesText = normalizeNutrientInput(values.calories.trim());
  if (caloriesText === '') errors.calories = 'Enter the calories.';
  else if (!WHOLE.test(caloriesText)) errors.calories = 'Calories must be a whole number, like 450.';
  else {
    calories = Number(caloriesText);
    if (!Number.isSafeInteger(calories) || calories > MEAL_CALORIES_MAX) {
      errors.calories = `Calories must be ${MEAL_CALORIES_MAX.toLocaleString('en-US')} or less.`;
    }
  }

  const protein = parseOptionalMacro(values.protein, 'Protein');
  if (protein.error) errors.protein = protein.error;
  const carbs = parseOptionalMacro(values.carbs, 'Carbs');
  if (carbs.error) errors.carbs = carbs.error;

  const time = values.time.trim();
  if (!TIME.test(time)) errors.time = 'Enter a time.';
  const date = values.date.trim();
  if (!isRealDate(date)) errors.date = 'Enter a valid date.';

  const firstInvalid = MEAL_FORM_FIELD_ORDER.find((f) => errors[f]);
  if (firstInvalid) return { ok: false, errors, firstInvalid };

  return { ok: true, value: { food, calories, protein: protein.value, carbs: carbs.value, time, date } };
};
