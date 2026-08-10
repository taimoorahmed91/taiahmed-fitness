ALTER TABLE public.fittrack_meals ADD COLUMN IF NOT EXISTS carbs numeric;
ALTER TABLE public.fittrack_personal_data ADD COLUMN IF NOT EXISTS carb_multiplier numeric;