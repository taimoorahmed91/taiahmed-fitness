ALTER TABLE public.fittrack_user_settings
  ADD COLUMN IF NOT EXISTS set_rest_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS exercise_rest_seconds integer NOT NULL DEFAULT 90;