CREATE OR REPLACE FUNCTION public.is_demo_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() ->> 'email', '') = 'demo@fittrack.local'
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fittrack_meals','fittrack_gym_sessions','fittrack_workout_templates','fittrack_weight',
    'fittrack_waist','fittrack_sleep','fittrack_whoop_data','fittrack_daily_notes',
    'fittrack_extra_activities','fittrack_personal_data','fittrack_user_settings','fittrack_goals',
    'fittrack_daily_summary','fittrack_personal_data_history','fittrack_activity_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Demo account is read-only (insert)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Demo account is read-only (update)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Demo account is read-only (delete)" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Demo account is read-only (insert)" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_demo_user())', t);
    EXECUTE format('CREATE POLICY "Demo account is read-only (update)" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_demo_user())', t);
    EXECUTE format('CREATE POLICY "Demo account is read-only (delete)" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_demo_user())', t);
  END LOOP;
END $$;