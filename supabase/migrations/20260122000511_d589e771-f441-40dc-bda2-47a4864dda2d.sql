-- Create a table to store daily fitness summary data
CREATE TABLE public.fittrack_daily_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  calories_consumed INTEGER NOT NULL DEFAULT 0,
  calories_remaining INTEGER NOT NULL DEFAULT 2000,
  calorie_goal INTEGER NOT NULL DEFAULT 2000,
  workout_status TEXT NOT NULL DEFAULT 'yes' CHECK (workout_status IN ('yes', 'no', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable Row Level Security
ALTER TABLE public.fittrack_daily_summary ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own daily summary" 
ON public.fittrack_daily_summary 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own daily summary" 
ON public.fittrack_daily_summary 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily summary" 
ON public.fittrack_daily_summary 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily summary" 
ON public.fittrack_daily_summary 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_fittrack_daily_summary_updated_at
BEFORE UPDATE ON public.fittrack_daily_summary
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create a function to get or create today's summary with workout logic
CREATE OR REPLACE FUNCTION public.get_or_create_daily_summary(p_user_id UUID)
RETURNS public.fittrack_daily_summary
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary public.fittrack_daily_summary;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  v_worked_out_yesterday BOOLEAN;
  v_worked_out_today BOOLEAN;
  v_workout_status TEXT;
  v_calories_today INTEGER;
  v_calorie_goal INTEGER;
BEGIN
  -- Check if workout was done yesterday
  SELECT EXISTS(
    SELECT 1 FROM public.fittrack_gym_sessions 
    WHERE user_id = p_user_id AND date = v_yesterday
  ) INTO v_worked_out_yesterday;
  
  -- Check if workout was done today
  SELECT EXISTS(
    SELECT 1 FROM public.fittrack_gym_sessions 
    WHERE user_id = p_user_id AND date = v_today
  ) INTO v_worked_out_today;
  
  -- Determine workout status based on logic
  IF v_worked_out_today THEN
    v_workout_status := 'completed';
  ELSIF v_worked_out_yesterday THEN
    v_workout_status := 'no';
  ELSE
    v_workout_status := 'yes';
  END IF;
  
  -- Get today's calories from meals
  SELECT COALESCE(SUM(calories), 0) INTO v_calories_today
  FROM public.fittrack_meals
  WHERE user_id = p_user_id AND date = v_today;
  
  -- Get user's calorie goal
  SELECT COALESCE(daily_calorie_goal, 2000) INTO v_calorie_goal
  FROM public.fittrack_user_settings
  WHERE user_id = p_user_id;
  
  IF v_calorie_goal IS NULL THEN
    v_calorie_goal := 2000;
  END IF;
  
  -- Try to insert or update today's summary
  INSERT INTO public.fittrack_daily_summary (
    user_id, 
    date, 
    calories_consumed, 
    calories_remaining, 
    calorie_goal, 
    workout_status
  )
  VALUES (
    p_user_id, 
    v_today, 
    v_calories_today, 
    GREATEST(v_calorie_goal - v_calories_today, 0), 
    v_calorie_goal, 
    v_workout_status
  )
  ON CONFLICT (user_id, date) 
  DO UPDATE SET
    calories_consumed = v_calories_today,
    calories_remaining = GREATEST(v_calorie_goal - v_calories_today, 0),
    calorie_goal = v_calorie_goal,
    workout_status = v_workout_status,
    updated_at = now()
  RETURNING * INTO v_summary;
  
  RETURN v_summary;
END;
$$;