-- Drop tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS public.fittrack_template_exercises CASCADE;
DROP TABLE IF EXISTS public.fittrack_workout_sessions CASCADE;
DROP TABLE IF EXISTS public.fittrack_workout_templates CASCADE;
DROP TABLE IF EXISTS public.fittrack_exercises CASCADE;