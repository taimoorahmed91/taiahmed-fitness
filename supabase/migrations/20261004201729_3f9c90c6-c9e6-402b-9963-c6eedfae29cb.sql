ALTER TABLE public.fittrack_personal_data
  ADD COLUMN IF NOT EXISTS gym_day_calorie_target_max integer,
  ADD COLUMN IF NOT EXISTS rest_day_calorie_target_max integer,
  ADD COLUMN IF NOT EXISTS protein_multiplier_max numeric,
  ADD COLUMN IF NOT EXISTS carb_multiplier_max numeric;

CREATE OR REPLACE FUNCTION public.log_fittrack_personal_data_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  f text;
  newv numeric;
  oldv numeric;
BEGIN
  FOREACH f IN ARRAY ARRAY['target_weight_kg','gym_day_calorie_target','rest_day_calorie_target','gym_day_calorie_target_max','rest_day_calorie_target_max'] LOOP
    EXECUTE format('SELECT ($1).%I::numeric', f) INTO newv USING NEW;
    IF TG_OP = 'UPDATE' THEN
      EXECUTE format('SELECT ($1).%I::numeric', f) INTO oldv USING OLD;
    ELSE
      oldv := NULL;
    END IF;
    IF newv IS NOT NULL AND (TG_OP = 'INSERT' OR newv IS DISTINCT FROM oldv) THEN
      INSERT INTO public.fittrack_personal_data_history(user_id, field, value) VALUES (NEW.user_id, f, newv);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;