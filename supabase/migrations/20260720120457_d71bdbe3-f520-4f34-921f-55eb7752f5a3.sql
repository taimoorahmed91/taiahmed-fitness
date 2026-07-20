
CREATE TABLE public.fittrack_personal_data_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  field TEXT NOT NULL,
  value NUMERIC,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.fittrack_personal_data_history TO authenticated;
GRANT ALL ON public.fittrack_personal_data_history TO service_role;

ALTER TABLE public.fittrack_personal_data_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own personal data history"
  ON public.fittrack_personal_data_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_fittrack_pd_history_user_field ON public.fittrack_personal_data_history(user_id, field, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_fittrack_personal_data_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_weight_kg IS NOT NULL THEN
      INSERT INTO public.fittrack_personal_data_history(user_id, field, value)
      VALUES (NEW.user_id, 'target_weight_kg', NEW.target_weight_kg);
    END IF;
    IF NEW.gym_day_calorie_target IS NOT NULL THEN
      INSERT INTO public.fittrack_personal_data_history(user_id, field, value)
      VALUES (NEW.user_id, 'gym_day_calorie_target', NEW.gym_day_calorie_target);
    END IF;
    IF NEW.rest_day_calorie_target IS NOT NULL THEN
      INSERT INTO public.fittrack_personal_data_history(user_id, field, value)
      VALUES (NEW.user_id, 'rest_day_calorie_target', NEW.rest_day_calorie_target);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.target_weight_kg IS DISTINCT FROM OLD.target_weight_kg AND NEW.target_weight_kg IS NOT NULL THEN
      INSERT INTO public.fittrack_personal_data_history(user_id, field, value)
      VALUES (NEW.user_id, 'target_weight_kg', NEW.target_weight_kg);
    END IF;
    IF NEW.gym_day_calorie_target IS DISTINCT FROM OLD.gym_day_calorie_target AND NEW.gym_day_calorie_target IS NOT NULL THEN
      INSERT INTO public.fittrack_personal_data_history(user_id, field, value)
      VALUES (NEW.user_id, 'gym_day_calorie_target', NEW.gym_day_calorie_target);
    END IF;
    IF NEW.rest_day_calorie_target IS DISTINCT FROM OLD.rest_day_calorie_target AND NEW.rest_day_calorie_target IS NOT NULL THEN
      INSERT INTO public.fittrack_personal_data_history(user_id, field, value)
      VALUES (NEW.user_id, 'rest_day_calorie_target', NEW.rest_day_calorie_target);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_fittrack_personal_data_changes
  AFTER INSERT OR UPDATE ON public.fittrack_personal_data
  FOR EACH ROW EXECUTE FUNCTION public.log_fittrack_personal_data_changes();

-- Backfill current values as initial history entries (only if no history exists)
INSERT INTO public.fittrack_personal_data_history (user_id, field, value, changed_at)
SELECT user_id, 'target_weight_kg', target_weight_kg, COALESCE(updated_at, created_at, now())
FROM public.fittrack_personal_data
WHERE target_weight_kg IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.fittrack_personal_data_history h WHERE h.user_id = fittrack_personal_data.user_id AND h.field = 'target_weight_kg');

INSERT INTO public.fittrack_personal_data_history (user_id, field, value, changed_at)
SELECT user_id, 'gym_day_calorie_target', gym_day_calorie_target, COALESCE(updated_at, created_at, now())
FROM public.fittrack_personal_data
WHERE gym_day_calorie_target IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.fittrack_personal_data_history h WHERE h.user_id = fittrack_personal_data.user_id AND h.field = 'gym_day_calorie_target');

INSERT INTO public.fittrack_personal_data_history (user_id, field, value, changed_at)
SELECT user_id, 'rest_day_calorie_target', rest_day_calorie_target, COALESCE(updated_at, created_at, now())
FROM public.fittrack_personal_data
WHERE rest_day_calorie_target IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.fittrack_personal_data_history h WHERE h.user_id = fittrack_personal_data.user_id AND h.field = 'rest_day_calorie_target');
