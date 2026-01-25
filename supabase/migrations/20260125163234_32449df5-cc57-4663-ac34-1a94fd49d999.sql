
-- Fix the get_or_create_daily_summary function to properly recalculate values
CREATE OR REPLACE FUNCTION public.get_or_create_daily_summary(p_user_id uuid)
 RETURNS fittrack_daily_summary
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_summary fittrack_daily_summary;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  v_calorie_goal INTEGER;
  v_calories_consumed INTEGER;
  v_workout_yesterday BOOLEAN;
  v_workout_status TEXT;
BEGIN
  -- Get user's calorie goal
  SELECT daily_calorie_goal INTO v_calorie_goal
  FROM fittrack_user_settings
  WHERE user_id = p_user_id;
  
  -- Default to 2000 if no settings
  v_calorie_goal := COALESCE(v_calorie_goal, 2000);
  
  -- Calculate today's calories consumed (always recalculate)
  SELECT COALESCE(SUM(calories), 0)::INTEGER INTO v_calories_consumed
  FROM fittrack_meals
  WHERE user_id = p_user_id AND date = v_today;
  
  -- Check if user worked out yesterday
  SELECT EXISTS(
    SELECT 1 FROM fittrack_gym_sessions
    WHERE user_id = p_user_id AND date = v_yesterday
  ) INTO v_workout_yesterday;
  
  -- Determine workout status: 
  -- If worked out yesterday → 'no' (rest day)
  -- If didn't work out yesterday → 'yes' (need to workout)
  IF v_workout_yesterday THEN
    v_workout_status := 'no';
  ELSE
    v_workout_status := 'yes';
  END IF;
  
  -- Try to update existing row for this user (regardless of date - one row per user)
  UPDATE fittrack_daily_summary
  SET 
    date = v_today,
    calories_consumed = v_calories_consumed,
    calories_remaining = v_calorie_goal - v_calories_consumed,
    calorie_goal = v_calorie_goal,
    workout_status = v_workout_status,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_summary;
  
  -- If no row exists, create one
  IF v_summary.id IS NULL THEN
    INSERT INTO fittrack_daily_summary (
      user_id, date, calories_consumed, calories_remaining, 
      calorie_goal, workout_status, created_at, updated_at
    )
    VALUES (
      p_user_id, v_today, v_calories_consumed, 
      v_calorie_goal - v_calories_consumed, v_calorie_goal, 
      v_workout_status, NOW(), NOW()
    )
    RETURNING * INTO v_summary;
  END IF;
  
  RETURN v_summary;
END;
$function$;

-- Clean up: Keep only one row per user (the most recent one)
DELETE FROM fittrack_daily_summary a
USING fittrack_daily_summary b
WHERE a.user_id = b.user_id 
  AND a.date < b.date;

-- Add unique constraint to ensure one row per user going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fittrack_daily_summary_user_id_unique'
  ) THEN
    ALTER TABLE fittrack_daily_summary ADD CONSTRAINT fittrack_daily_summary_user_id_unique UNIQUE (user_id);
  END IF;
END $$;
