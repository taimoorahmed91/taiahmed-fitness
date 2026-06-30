ALTER TABLE public.fittrack_gym_sessions ADD COLUMN IF NOT EXISTS end_time timestamptz;
UPDATE public.fittrack_gym_sessions
SET end_time = (date::text || ' ' || start_time)::timestamp + (duration || ' minutes')::interval
WHERE end_time IS NULL AND start_time IS NOT NULL AND duration IS NOT NULL AND start_time ~ '^[0-9]{1,2}:[0-9]{2}$';