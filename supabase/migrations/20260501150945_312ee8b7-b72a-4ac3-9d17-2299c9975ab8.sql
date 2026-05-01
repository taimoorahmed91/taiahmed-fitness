ALTER TABLE public.fittrack_personal_data
ADD COLUMN IF NOT EXISTS gym_day_calorie_target integer,
ADD COLUMN IF NOT EXISTS rest_day_calorie_target integer;