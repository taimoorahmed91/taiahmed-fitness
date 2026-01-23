-- Drop the existing function and recreate with new logic
DROP FUNCTION IF EXISTS public.get_or_create_daily_summary(uuid);

-- Create function that maintains a single row per user, resetting daily
CREATE OR REPLACE FUNCTION public.get_or_create_daily_summary(p_user_id uuid)
RETURNS fittrack_daily_summary
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- Calculate today's calories consumed
  SELECT COALESCE(SUM(calories), 0) INTO v_calories_consumed
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
  
  -- Check if user already has a row
  SELECT * INTO v_summary
  FROM fittrack_daily_summary
  WHERE user_id = p_user_id;
  
  IF v_summary.id IS NULL THEN
    -- No row exists, create one
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
  ELSE
    -- Row exists - check if it's from today
    IF v_summary.date < v_today THEN
      -- Old row, update it with today's data (this is the daily reset)
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
    ELSE
      -- Same day, just update the calorie data
      UPDATE fittrack_daily_summary
      SET 
        calories_consumed = v_calories_consumed,
        calories_remaining = v_calorie_goal - v_calories_consumed,
        calorie_goal = v_calorie_goal,
        updated_at = NOW()
      WHERE user_id = p_user_id
      RETURNING * INTO v_summary;
    END IF;
  END IF;
  
  RETURN v_summary;
END;
$$;

-- Clean up existing data: keep only the most recent row per user
DELETE FROM fittrack_daily_summary
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM fittrack_daily_summary
  ORDER BY user_id, date DESC
);